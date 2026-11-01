package com.study.aiassistant;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.StringReader;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.zip.CRC32;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import javax.xml.parsers.ParserConfigurationException;
import javax.xml.parsers.SAXParserFactory;
import org.xml.sax.Attributes;
import org.xml.sax.EntityResolver;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
import org.xml.sax.SAXParseException;
import org.xml.sax.XMLReader;
import org.xml.sax.helpers.DefaultHandler;

/** 在内存中将未加密的 OOXML 正文提取为 Markdown；不进行磁盘或网络操作。 */
public final class OfficeConverter {
    private static final int MIB = 1024 * 1024;
    private static final int MAX_INPUT = 12 * MIB;
    private static final int MAX_ENTRY = 8 * MIB;
    private static final int MAX_TOTAL = 24 * MIB;
    private static final int MAX_ENTRIES = 512;
    private static final int MAX_TEXT = 200000;
    private static final int MAX_XML_DEPTH = 128;
    private static final int MAX_XML_ELEMENTS = 200000;
    private static final int MAX_SHARED_STRINGS = 50000;
    private static final String WORD = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    private static final String WORD_STRICT = "http://purl.oclc.org/ooxml/wordprocessingml/main";
    private static final String DRAWING = "http://schemas.openxmlformats.org/drawingml/2006/main";
    private static final String DRAWING_STRICT = "http://purl.oclc.org/ooxml/drawingml/main";
    private static final String PRESENTATION = "http://schemas.openxmlformats.org/presentationml/2006/main";
    private static final String PRESENTATION_STRICT = "http://purl.oclc.org/ooxml/presentationml/main";
    private static final String SHEET = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    private static final String SHEET_STRICT = "http://purl.oclc.org/ooxml/spreadsheetml/main";
    private static final String REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    private static final String REL_STRICT = "http://purl.oclc.org/ooxml/officeDocument/relationships";
    private static final String PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships";

    private OfficeConverter() {}

    /**
     * @param data 完整的 DOCX、PPTX 或 XLSX 文件字节
     * @param name 展示用文件名，不访问该路径
     * @param ext 扩展名，可带前导点，不区分大小写
     * @return 不超过 200000 个 UTF-16 字符的 Markdown
     * @throws IllegalArgumentException 输入无效、文档无文字、格式不支持或超过安全限制
     */
    public static String convert(byte[] data, String name, String ext) {
        if (data == null || data.length == 0) {
            throw problem("文件内容不能为空");
        }
        if (data.length > MAX_INPUT) {
            throw problem("压缩文件超过 12 MiB 限制");
        }
        if (name == null || name.trim().isEmpty() || name.length() > 1024) {
            throw problem("文件名不能为空或超过 1024 个字符");
        }
        if (ext == null) {
            throw problem("文件扩展名不能为空");
        }
        String kind = ext.trim().toLowerCase(Locale.ROOT);
        if (kind.startsWith(".")) kind = kind.substring(1);
        if (!kind.equals("docx") && !kind.equals("pptx") && !kind.equals("xlsx")) {
            throw problem("仅支持 DOCX、PPTX、XLSX；旧版 Office 和 PDF 不支持");
        }
        Map<String, byte[]> parts = readArchive(data, kind);
        Text out = new Text();
        if (kind.equals("docx")) {
            return docx(parts, cleanTitle(name), out);
        } else if (kind.equals("pptx")) {
            return pptx(parts, cleanTitle(name), out);
        }
        return xlsx(parts, cleanTitle(name), out);
    }

    private static final class ConversionException extends IllegalArgumentException {
        ConversionException(String message) { super(message); }
    }

    private static ConversionException problem(String message) {
        return new ConversionException(message);
    }

    private static String cleanTitle(String name) {
        StringBuilder title = new StringBuilder(name.length());
        for (int i = 0; i < name.length(); i++) {
            char c = name.charAt(i);
            if (Character.isISOControl(c) || c == '\u2028' || c == '\u2029') c = ' ';
            if (c == '\\' || c == '*' || c == '_' || c == '[' || c == ']' || c == '`'
                    || c == '<' || c == '>' || c == '&') {
                title.append('\\');
            }
            title.append(c);
        }
        return title.toString();
    }

    private static final class Text {
        private final StringBuilder value = new StringBuilder();
        void add(String s) {
            if (s.length() > MAX_TEXT - value.length()) throw problem("提取文字超过 20 万字符限制");
            value.append(s);
        }
        void add(char[] chars, int start, int length) {
            if (length > MAX_TEXT - value.length()) throw problem("提取文字超过 20 万字符限制");
            value.append(chars, start, length);
        }
        int length() { return value.length(); }
        @Override public String toString() { return value.toString(); }
    }

    private static final class ZipMeta {
        final long size;
        final long compressed;
        final long crc;
        ZipMeta(long size, long compressed, long crc) {
            this.size = size;
            this.compressed = compressed;
            this.crc = crc;
        }
    }

    private static int u16(byte[] b, int p) {
        return (b[p] & 255) | ((b[p + 1] & 255) << 8);
    }

    private static long u32(byte[] b, int p) {
        return (long) u16(b, p) | ((long) u16(b, p + 2) << 16);
    }

    private static boolean signature(byte[] b, int p, long magic) {
        return p >= 0 && (long) p + 4 <= b.length && u32(b, p) == magic;
    }

    /* 校验中央目录与本地头，防止把截断文件或互相矛盾的 ZIP 误认作有效文档。 */
    private static Map<String, ZipMeta> zipDirectory(byte[] data) {
        int end = -1;
        int min = Math.max(0, data.length - 65557);
        for (int i = data.length - 22; i >= min; i--) {
            if (signature(data, i, 0x06054b50L) && (long) i + 22 + u16(data, i + 20) == data.length) {
                end = i;
                break;
            }
        }
        if (end < 0 || !signature(data, 0, 0x04034b50L)) throw problem("无效或不完整的 ZIP 文件");
        int disk = u16(data, end + 4);
        int cdDisk = u16(data, end + 6);
        int onDisk = u16(data, end + 8);
        int count = u16(data, end + 10);
        long cdSize = u32(data, end + 12);
        long cdOffset = u32(data, end + 16);
        if (disk != 0 || cdDisk != 0 || onDisk != count || count == 0 || count == 65535
                || cdOffset + cdSize != end || cdOffset > end) {
            throw problem("无效的 ZIP 目录或不支持的分卷/ZIP64 文件");
        }
        if (count > MAX_ENTRIES) throw problem("ZIP 条目超过 512 项限制");
        Map<String, ZipMeta> result = new HashMap<>();
        Set<Long> offsets = new HashSet<>();
        long declaredTotal = 0;
        int p = (int) cdOffset;
        for (int i = 0; i < count; i++) {
            if ((long) p + 46 > end || !signature(data, p, 0x02014b50L)) {
                throw problem("无效的 ZIP 中央目录");
            }
            int flags = u16(data, p + 8);
            int method = u16(data, p + 10);
            long crc = u32(data, p + 16);
            long compressed = u32(data, p + 20);
            long size = u32(data, p + 24);
            int nameLen = u16(data, p + 28);
            int extraLen = u16(data, p + 30);
            int commentLen = u16(data, p + 32);
            int startDisk = u16(data, p + 34);
            long offset = u32(data, p + 42);
            long next = (long) p + 46 + nameLen + extraLen + commentLen;
            if (next > end || nameLen == 0 || startDisk != 0 || (flags & 0x41) != 0
                    || (method != 0 && method != 8) || offset + 30 > cdOffset
                    || !offsets.add(offset)) {
                throw problem("无效、加密或不支持的 ZIP 条目");
            }
            int lp = (int) offset;
            int localNameLen = u16(data, lp + 26);
            int localExtraLen = u16(data, lp + 28);
            if (!signature(data, lp, 0x04034b50L) || flags != u16(data, lp + 6)
                    || method != u16(data, lp + 8) || localNameLen != nameLen
                    || (long) lp + 30 + localNameLen + localExtraLen + compressed > cdOffset) {
                throw problem("ZIP 本地条目与目录不一致");
            }
            for (int j = 0; j < nameLen; j++) {
                if (data[p + 46 + j] != data[lp + 30 + j]) throw problem("ZIP 条目名称不一致");
            }
            String name = decode(data, p + 46, nameLen, StandardCharsets.UTF_8);
            checkEntryName(name);
            if (size > MAX_ENTRY) throw problem("ZIP 单个条目超过 8 MiB 限制");
            declaredTotal += size;
            if (declaredTotal > MAX_TOTAL) throw problem("ZIP 解压总量超过 24 MiB 限制");
            if (result.put(name, new ZipMeta(size, compressed, crc)) != null) {
                throw problem("ZIP 包含重复条目");
            }
            p = (int) next;
        }
        if (p != end) throw problem("无效的 ZIP 中央目录长度");
        return result;
    }

    private static void checkEntryName(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        if (name.isEmpty() || name.startsWith("/") || name.indexOf('\\') >= 0 || name.indexOf(':') >= 0
                || lower.contains("%2e") || lower.contains("%2f") || lower.contains("%5c")) {
            throw problem("ZIP 包含不安全的条目路径");
        }
        for (int i = 0; i < name.length(); i++) {
            if (Character.isISOControl(name.charAt(i))) throw problem("ZIP 包含不安全的条目路径");
        }
        String[] segments = name.split("/", -1);
        for (int i = 0; i < segments.length; i++) {
            if (segments[i].equals(".") || segments[i].equals("..")
                    || (segments[i].isEmpty() && i != segments.length - 1)) {
                throw problem("ZIP 包含不安全的条目路径");
            }
        }
    }

    private static boolean needed(String name, String kind) {
        if (kind.equals("docx")) return name.equals("word/document.xml");
        if (kind.equals("pptx")) {
            return name.equals("ppt/presentation.xml") || name.equals("ppt/_rels/presentation.xml.rels")
                    || (name.startsWith("ppt/slides/") && name.endsWith(".xml") && !name.contains("/_rels/"));
        }
        return name.equals("xl/workbook.xml") || name.equals("xl/_rels/workbook.xml.rels")
                || name.equals("xl/sharedStrings.xml")
                || (name.startsWith("xl/worksheets/") && name.endsWith(".xml") && !name.contains("/_rels/"));
    }

    private static Map<String, byte[]> readArchive(byte[] data, String kind) {
        Map<String, ZipMeta> metadata = zipDirectory(data);
        Map<String, byte[]> parts = new HashMap<>();
        Set<String> visited = new HashSet<>();
        int count = 0;
        long total = 0;
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(data))) {
            ZipEntry entry;
            byte[] buffer = new byte[8192];
            while ((entry = zip.getNextEntry()) != null) {
                if (++count > MAX_ENTRIES) throw problem("ZIP 条目超过 512 项限制");
                String name = entry.getName();
                checkEntryName(name);
                ZipMeta meta = metadata.get(name);
                if (meta == null || !visited.add(name)) throw problem("ZIP 条目与中央目录不一致");
                ByteArrayOutputStream copy = needed(name, kind) ? new ByteArrayOutputStream() : null;
                CRC32 crc = new CRC32();
                long size = 0;
                int n;
                while ((n = zip.read(buffer)) != -1) {
                    size += n;
                    total += n;
                    if (size > MAX_ENTRY) throw problem("ZIP 单个条目超过 8 MiB 限制");
                    if (total > MAX_TOTAL) throw problem("ZIP 解压总量超过 24 MiB 限制");
                    crc.update(buffer, 0, n);
                    if (copy != null) copy.write(buffer, 0, n);
                }
                if (size != meta.size || crc.getValue() != meta.crc
                        || entry.getCompressedSize() != meta.compressed) {
                    throw problem("ZIP 条目的长度或校验值不正确");
                }
                if (copy != null) parts.put(name, copy.toByteArray());
                zip.closeEntry();
            }
        } catch (ConversionException e) {
            throw e;
        } catch (IOException | IllegalArgumentException e) {
            throw problem("ZIP 文件损坏或不受支持");
        }
        if (count != metadata.size()) throw problem("ZIP 本地条目与中央目录不一致");
        return parts;
    }

    private static String decode(byte[] bytes, int offset, int length, Charset charset) {
        try {
            return charset.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes, offset, length)).toString();
        } catch (CharacterCodingException e) {
            throw problem("ZIP 或 XML 包含无效字符编码");
        }
    }

    /* 仅接受 UTF-8/UTF-16，并在解析器读取前拒绝所有 DOCTYPE，包括 UTF-16 编码形式。
       即使 Android 的 SAX 不支持 Xerces 专有开关，此检查与拒绝实体解析器仍会生效。 */
    private static String xmlText(byte[] bytes) {
        int offset = 0;
        Charset charset = StandardCharsets.UTF_8;
        if (bytes.length >= 4 && ((bytes[0] == 0 && bytes[1] == 0 && bytes[2] == (byte) 0xfe && bytes[3] == (byte) 0xff)
                || (bytes[0] == (byte) 0xff && bytes[1] == (byte) 0xfe && bytes[2] == 0 && bytes[3] == 0))) {
            throw problem("不支持的 XML 编码");
        }
        if (bytes.length >= 3 && bytes[0] == (byte) 0xef && bytes[1] == (byte) 0xbb && bytes[2] == (byte) 0xbf) {
            offset = 3;
        } else if (bytes.length >= 2 && bytes[0] == (byte) 0xfe && bytes[1] == (byte) 0xff) {
            charset = StandardCharsets.UTF_16BE;
            offset = 2;
        } else if (bytes.length >= 2 && bytes[0] == (byte) 0xff && bytes[1] == (byte) 0xfe) {
            charset = StandardCharsets.UTF_16LE;
            offset = 2;
        } else if (bytes.length >= 2 && bytes[0] == 0 && bytes[1] == '<') {
            charset = StandardCharsets.UTF_16BE;
        } else if (bytes.length >= 2 && bytes[0] == '<' && bytes[1] == 0) {
            charset = StandardCharsets.UTF_16LE;
        }
        String xml = decode(bytes, offset, bytes.length - offset, charset);
        if (xml.indexOf('\0') >= 0) throw problem("XML 包含无效字符");
        for (int i = xml.indexOf("<!"); i >= 0; i = xml.indexOf("<!", i + 2)) {
            if (xml.regionMatches(true, i, "<!DOCTYPE", 0, 9)) throw problem("禁止 XML DTD 和外部实体");
        }
        return xml;
    }

    private static void optionalFeature(XMLReader reader, String feature, boolean value) {
        try { reader.setFeature(feature, value); } catch (SAXException ignored) { /* Android 实现可不支持。 */ }
    }

    private static void parse(byte[] bytes, SafeHandler handler) {
        String xml = xmlText(bytes);
        try {
            SAXParserFactory factory = SAXParserFactory.newInstance();
            factory.setNamespaceAware(true);
            try { factory.setXIncludeAware(false); } catch (UnsupportedOperationException ignored) { }
            XMLReader reader = factory.newSAXParser().getXMLReader();
            optionalFeature(reader, "http://apache.org/xml/features/disallow-doctype-decl", true);
            optionalFeature(reader, "http://xml.org/sax/features/external-general-entities", false);
            optionalFeature(reader, "http://xml.org/sax/features/external-parameter-entities", false);
            optionalFeature(reader, "http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            reader.setContentHandler(handler);
            reader.setErrorHandler(handler);
            reader.setEntityResolver(new EntityResolver() {
                @Override public InputSource resolveEntity(String publicId, String systemId) throws SAXException {
                    throw new SAXException("外部实体被禁止");
                }
            });
            reader.parse(new InputSource(new StringReader(xml)));
        } catch (ParserConfigurationException | SAXException | IOException e) {
            throw problem("XML 无效、不安全或无法解析");
        }
    }

    private abstract static class SafeHandler extends DefaultHandler {
        int depth;
        int elements;
        @Override public final void startElement(String uri, String local, String qName, Attributes a) throws SAXException {
            if (++depth > MAX_XML_DEPTH || ++elements > MAX_XML_ELEMENTS) throw problem("XML 结构超过安全限制");
            start(uri, local, a);
        }
        @Override public final void endElement(String uri, String local, String qName) throws SAXException {
            end(uri, local);
            depth--;
        }
        @Override public final void characters(char[] ch, int start, int length) throws SAXException {
            chars(ch, start, length);
        }
        @Override public void error(SAXParseException e) throws SAXException { throw e; }
        @Override public void fatalError(SAXParseException e) throws SAXException { throw e; }
        void start(String uri, String local, Attributes a) throws SAXException { }
        void end(String uri, String local) throws SAXException { }
        void chars(char[] ch, int start, int length) throws SAXException { }
    }

    private static boolean is(String uri, String local, String name, String ns, String strict) {
        return local.equals(name) && (uri.equals(ns) || uri.equals(strict));
    }
    private static boolean word(String u, String l, String n) { return is(u, l, n, WORD, WORD_STRICT); }
    private static boolean draw(String u, String l, String n) { return is(u, l, n, DRAWING, DRAWING_STRICT); }
    private static boolean sheet(String u, String l, String n) { return is(u, l, n, SHEET, SHEET_STRICT); }
    private static String relId(Attributes a) {
        String value = a.getValue(REL, "id");
        return value != null ? value : a.getValue(REL_STRICT, "id");
    }

    private static byte[] required(Map<String, byte[]> parts, String path, String message) {
        byte[] value = parts.get(path);
        if (value == null) throw problem(message);
        return value;
    }

    private static String docx(Map<String, byte[]> parts, String name, Text out) {
        byte[] xml = required(parts, "word/document.xml", "DOCX 里没有找到正文内容");
        out.add("# 文档：" + name + "\n\n");
        final boolean[] found = {false};
        parse(xml, new SafeHandler() {
            Text paragraph;
            int paragraphDepth;
            int textDepth;
            String style;
            @Override void start(String u, String l, Attributes a) {
                if (word(u, l, "p") && paragraph == null) {
                    paragraph = new Text(); paragraphDepth = depth; style = "";
                } else if (paragraph != null && word(u, l, "pStyle")) {
                    String v = a.getValue(WORD, "val");
                    if (v == null) v = a.getValue(WORD_STRICT, "val");
                    if (v != null && v.length() < 64) style = v;
                } else if (paragraph != null && word(u, l, "t")) {
                    textDepth = depth;
                } else if (paragraph != null && word(u, l, "tab")) {
                    paragraph.add("\t");
                } else if (paragraph != null && (word(u, l, "br") || word(u, l, "cr"))) {
                    paragraph.add("\n");
                }
            }
            @Override void chars(char[] ch, int start, int length) {
                if (paragraph != null && textDepth != 0) paragraph.add(ch, start, length);
            }
            @Override void end(String u, String l) {
                if (textDepth == depth) textDepth = 0;
                if (paragraph != null && paragraphDepth == depth) {
                    String value = paragraph.toString().trim();
                    if (!value.isEmpty()) {
                        found[0] = true;
                        if (style.equalsIgnoreCase("Heading1")) out.add("# ");
                        else if (style.equalsIgnoreCase("Heading2") || style.equalsIgnoreCase("Title")) out.add("## ");
                        else if (style.equalsIgnoreCase("Heading3")) out.add("### ");
                        out.add(value); out.add("\n\n");
                    }
                    paragraph = null;
                }
            }
        });
        if (!found[0]) throw problem("DOCX 里没有可提取的文字");
        return out.toString().trim();
    }

    private static final class Reference {
        final String name;
        final String id;
        Reference(String name, String id) { this.name = name; this.id = id; }
    }
    private static final class Relation {
        final String target;
        final String type;
        Relation(String target, String type) { this.target = target; this.type = type; }
    }
    private static final class PartRef {
        final String name;
        final String path;
        PartRef(String name, String path) { this.name = name; this.path = path; }
    }

    private static Map<String, Relation> relations(byte[] xml, String base) {
        Map<String, Relation> result = new HashMap<>();
        parse(xml, new SafeHandler() {
            @Override void start(String u, String l, Attributes a) {
                if (!l.equals("Relationship") || !u.equals(PACKAGE_REL)) return;
                String id = a.getValue("Id"), target = a.getValue("Target"), type = a.getValue("Type");
                String mode = a.getValue("TargetMode");
                if (id == null || target == null || id.length() > 1024 || target.length() > 2048) {
                    throw problem("Office 关联关系无效");
                }
                if (mode != null && mode.equalsIgnoreCase("External")) return;
                if (result.put(id, new Relation(resolveTarget(base, target), type == null ? "" : type)) != null) {
                    throw problem("Office 包含重复的关联关系");
                }
            }
        });
        return result;
    }

    private static String resolveTarget(String source, String target) {
        String lower = target.toLowerCase(Locale.ROOT);
        if (target.indexOf('\\') >= 0 || target.indexOf(':') >= 0 || target.indexOf('?') >= 0
                || target.indexOf('#') >= 0 || lower.contains("%2e") || lower.contains("%2f")
                || lower.contains("%5c")) throw problem("Office 关联路径不安全");
        ArrayDeque<String> segments = new ArrayDeque<>();
        if (!target.startsWith("/")) {
            String prefix = source.substring(0, source.lastIndexOf('/'));
            for (String p : prefix.split("/")) segments.addLast(p);
        }
        for (String p : target.split("/")) {
            if (p.isEmpty() || p.equals(".")) continue;
            if (p.equals("..")) {
                if (segments.isEmpty()) throw problem("Office 关联路径不安全");
                segments.removeLast();
            } else segments.addLast(p);
        }
        StringBuilder path = new StringBuilder();
        for (String p : segments) {
            if (path.length() != 0) path.append('/');
            path.append(p);
        }
        checkEntryName(path.toString());
        return path.toString();
    }

    private static final Comparator<String> NATURAL_PATH = new Comparator<String>() {
        @Override public int compare(String a, String b) {
            int ai = a.length() - 1, bi = b.length() - 1;
            while (ai >= 0 && !Character.isDigit(a.charAt(ai))) ai--;
            while (bi >= 0 && !Character.isDigit(b.charAt(bi))) bi--;
            int ae = ai + 1, be = bi + 1;
            while (ai >= 0 && Character.isDigit(a.charAt(ai))) ai--;
            while (bi >= 0 && Character.isDigit(b.charAt(bi))) bi--;
            String an = a.substring(ai + 1, ae).replaceFirst("^0+(?!$)", "");
            String bn = b.substring(bi + 1, be).replaceFirst("^0+(?!$)", "");
            if (!an.isEmpty() && !bn.isEmpty()) {
                if (an.length() != bn.length()) return Integer.compare(an.length(), bn.length());
                int n = an.compareTo(bn);
                if (n != 0) return n;
            }
            return a.compareTo(b);
        }
    };

    private static List<String> matchingParts(Map<String, byte[]> parts, String prefix) {
        List<String> result = new ArrayList<>();
        for (String path : parts.keySet()) {
            if (path.startsWith(prefix) && path.endsWith(".xml")) result.add(path);
        }
        Collections.sort(result, NATURAL_PATH);
        return result;
    }

    private static List<PartRef> slideRefs(Map<String, byte[]> parts) {
        byte[] manifest = parts.get("ppt/presentation.xml");
        byte[] rels = parts.get("ppt/_rels/presentation.xml.rels");
        List<PartRef> result = new ArrayList<>();
        if (manifest != null && rels != null) {
            List<Reference> refs = new ArrayList<>();
            parse(manifest, new SafeHandler() {
                @Override void start(String u, String l, Attributes a) {
                    if (is(u, l, "sldId", PRESENTATION, PRESENTATION_STRICT)) {
                        String id = relId(a);
                        if (id == null || id.length() > 1024 || refs.size() >= MAX_ENTRIES) throw problem("PPTX 幻灯片关联无效");
                        refs.add(new Reference(null, id));
                    }
                }
            });
            Map<String, Relation> mapping = relations(rels, "ppt/presentation.xml");
            for (Reference ref : refs) {
                Relation r = mapping.get(ref.id);
                if (r == null || !r.type.endsWith("/slide") || !r.target.startsWith("ppt/slides/")
                        || !parts.containsKey(r.target)) throw problem("PPTX 幻灯片关联无效");
                result.add(new PartRef(null, r.target));
            }
        } else {
            for (String path : matchingParts(parts, "ppt/slides/")) result.add(new PartRef(null, path));
        }
        return result;
    }

    private static String pptx(Map<String, byte[]> parts, String name, Text out) {
        List<PartRef> slides = slideRefs(parts);
        if (slides.isEmpty()) throw problem("PPTX 里没有找到幻灯片内容");
        out.add("# 课件：" + name + "\n\n");
        final boolean[] found = {false};
        for (int i = 0; i < slides.size(); i++) {
            out.add("## 第 " + (i + 1) + " 页\n\n");
            parse(parts.get(slides.get(i).path), new SafeHandler() {
                Text paragraph;
                int paragraphDepth;
                int textDepth;
                @Override void start(String u, String l, Attributes a) {
                    if (draw(u, l, "p") && paragraph == null) { paragraph = new Text(); paragraphDepth = depth; }
                    else if (paragraph != null && draw(u, l, "t")) textDepth = depth;
                    else if (paragraph != null && draw(u, l, "br")) paragraph.add("\n");
                    else if (paragraph != null && draw(u, l, "tab")) paragraph.add("\t");
                }
                @Override void chars(char[] ch, int start, int length) {
                    if (paragraph != null && textDepth != 0) paragraph.add(ch, start, length);
                }
                @Override void end(String u, String l) {
                    if (textDepth == depth) textDepth = 0;
                    if (paragraph != null && paragraphDepth == depth) {
                        String value = paragraph.toString().trim();
                        if (!value.isEmpty()) { found[0] = true; out.add(value); out.add("\n\n"); }
                        paragraph = null;
                    }
                }
            });
        }
        if (!found[0]) throw problem("PPTX 里没有可提取的文字（可能全是图片）");
        return out.toString().trim();
    }

    private static List<PartRef> sheetRefs(Map<String, byte[]> parts) {
        byte[] workbook = parts.get("xl/workbook.xml");
        byte[] rels = parts.get("xl/_rels/workbook.xml.rels");
        List<Reference> refs = new ArrayList<>();
        if (workbook != null) {
            parse(workbook, new SafeHandler() {
                @Override void start(String u, String l, Attributes a) {
                    if (sheet(u, l, "sheet")) {
                        String name = a.getValue("name"), id = relId(a);
                        if (name == null || name.length() > 1024 || refs.size() >= MAX_ENTRIES) {
                            throw problem("XLSX 工作表信息无效");
                        }
                        refs.add(new Reference(name, id));
                    }
                }
            });
        }
        List<PartRef> result = new ArrayList<>();
        if (workbook != null && rels != null) {
            Map<String, Relation> mapping = relations(rels, "xl/workbook.xml");
            for (Reference ref : refs) {
                Relation r = mapping.get(ref.id);
                if (r == null) throw problem("XLSX 工作表关联无效");
                if (!r.type.endsWith("/worksheet")) continue; // 图表工作表不是单元格工作表。
                if (!r.target.startsWith("xl/worksheets/") || !parts.containsKey(r.target)) {
                    throw problem("XLSX 工作表关联无效");
                }
                result.add(new PartRef(ref.name, r.target));
            }
        } else {
            List<String> paths = matchingParts(parts, "xl/worksheets/");
            for (int i = 0; i < paths.size(); i++) {
                result.add(new PartRef(i < refs.size() ? refs.get(i).name : "工作表 " + (i + 1), paths.get(i)));
            }
        }
        return result;
    }

    private static List<String> sharedStrings(byte[] xml) {
        List<String> shared = new ArrayList<>();
        if (xml == null) return shared;
        parse(xml, new SafeHandler() {
            Text item;
            int itemDepth;
            int textDepth;
            int phoneticDepth;
            int total;
            @Override void start(String u, String l, Attributes a) {
                if (sheet(u, l, "si") && item == null) {
                    if (shared.size() >= MAX_SHARED_STRINGS) throw problem("XLSX 共享字符串数量超过安全限制");
                    item = new Text(); itemDepth = depth;
                } else if (item != null && sheet(u, l, "rPh")) phoneticDepth = depth;
                else if (item != null && phoneticDepth == 0 && sheet(u, l, "t")) textDepth = depth;
            }
            @Override void chars(char[] ch, int start, int length) {
                if (item != null && textDepth != 0) item.add(ch, start, length);
            }
            @Override void end(String u, String l) {
                if (textDepth == depth) textDepth = 0;
                if (phoneticDepth == depth) phoneticDepth = 0;
                if (item != null && itemDepth == depth) {
                    total += item.length();
                    if (total > MAX_TEXT) throw problem("XLSX 共享字符串超过 20 万字符限制");
                    shared.add(item.toString()); item = null;
                }
            }
        });
        return shared;
    }

    private static void addCellText(Text out, String value) {
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '\\' || c == '|') out.add("\\" + c);
            else if (c == '&') out.add("&amp;");
            else if (c == '<') out.add("&lt;");
            else if (c == '>') out.add("&gt;");
            else if (c == '\n' || c == '\r') out.add("<br>");
            else out.add(String.valueOf(c));
        }
    }

    private static int rowIndex(String text) {
        if (text == null || !text.matches("[1-9][0-9]{0,6}")) throw problem("XLSX 单元格位置无效");
        int row = Integer.parseInt(text);
        if (row > 1048576) throw problem("XLSX 单元格位置无效");
        return row;
    }

    private static int columnIndex(String text) {
        int column = 0;
        for (int i = 0; i < text.length(); i++) {
            char c = Character.toUpperCase(text.charAt(i));
            if (c < 'A' || c > 'Z') throw problem("XLSX 单元格位置无效");
            column = column * 26 + c - 'A' + 1;
        }
        if (column == 0 || column > 16384) throw problem("XLSX 单元格位置无效");
        return column;
    }

    private static String cellAddress(int column, int row) {
        if (column <= 0 || column > 16384 || row <= 0 || row > 1048576) {
            throw problem("XLSX 单元格位置无效");
        }
        StringBuilder letters = new StringBuilder();
        while (column > 0) {
            column--;
            letters.append((char) ('A' + column % 26));
            column /= 26;
        }
        return letters.reverse().toString() + row;
    }

    private static String xlsx(Map<String, byte[]> parts, String name, Text out) {
        List<String> shared = sharedStrings(parts.get("xl/sharedStrings.xml"));
        List<PartRef> sheets = sheetRefs(parts);
        if (sheets.isEmpty()) throw problem("XLSX 里没有找到工作表");
        out.add("# 表格：" + name + "\n\n");
        final boolean[] found = {false};
        for (PartRef current : sheets) {
            out.add("## " + cleanTitle(current.name) + "\n\n| 单元格 | 内容 |\n| --- | --- |\n");
            parse(parts.get(current.path), new SafeHandler() {
                Text value;
                int cellDepth;
                int valueDepth;
                int inlineDepth;
                int phoneticDepth;
                String type;
                String cellRef;
                int rowNumber;
                int colNumber;
                @Override void start(String u, String l, Attributes a) {
                    if (sheet(u, l, "row")) {
                        rowNumber++;
                        colNumber = 0;
                    } else if (sheet(u, l, "c") && value == null) {
                        value = new Text(); cellDepth = depth; type = a.getValue("t");
                        cellRef = a.getValue("r"); colNumber++;
                        if (cellRef == null || cellRef.isEmpty()) cellRef = "R" + rowNumber + "C" + colNumber;
                        if (cellRef.length() > 64 || !cellRef.matches("[A-Za-z0-9]+")) {
                            throw problem("XLSX 单元格位置无效");
                        }
                    } else if (value != null && sheet(u, l, "rPh")) phoneticDepth = depth;
                    else if (value != null && sheet(u, l, "is")) inlineDepth = depth;
                    else if (value != null && (sheet(u, l, "v")
                            || (inlineDepth != 0 && phoneticDepth == 0 && sheet(u, l, "t")))) valueDepth = depth;
                }
                @Override void chars(char[] ch, int start, int length) {
                    if (value != null && valueDepth != 0) value.add(ch, start, length);
                }
                @Override void end(String u, String l) {
                    if (valueDepth == depth) valueDepth = 0;
                    if (inlineDepth == depth) inlineDepth = 0;
                    if (phoneticDepth == depth) phoneticDepth = 0;
                    if (value != null && cellDepth == depth) {
                        String text = value.toString();
                        if ("s".equals(type) && !text.trim().isEmpty()) {
                            try {
                                int index = Integer.parseInt(text.trim());
                                if (index < 0 || index >= shared.size()) throw problem("XLSX 共享字符串索引无效");
                                text = shared.get(index);
                            } catch (NumberFormatException e) {
                                throw problem("XLSX 共享字符串索引无效");
                            }
                        } else if ("b".equals(type)) {
                            if (text.equals("1")) text = "TRUE";
                            else if (text.equals("0")) text = "FALSE";
                        }
                        if (!text.trim().isEmpty()) {
                            found[0] = true;
                            out.add("| "); addCellText(out, cellRef); out.add(" | ");
                            addCellText(out, text); out.add(" |\n");
                        }
                        value = null;
                    }
                }
            });
            out.add("\n");
        }
        if (!found[0]) throw problem("XLSX 里没有可提取的文字或单元格值");
        return out.toString().trim();
    }
}
