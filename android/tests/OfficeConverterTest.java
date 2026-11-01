import com.study.aiassistant.OfficeConverter;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** 只使用内存合成的 OOXML；无需 Android、外部测试框架、磁盘文件或网络。 */
public final class OfficeConverterTest {
    private static final int MIB = 1024 * 1024;
    private static final String W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    private static final String A = "http://schemas.openxmlformats.org/drawingml/2006/main";
    private static final String P = "http://schemas.openxmlformats.org/presentationml/2006/main";
    private static final String S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    private static final String R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    private static final String PR = "http://schemas.openxmlformats.org/package/2006/relationships";
    private static int passed;
    private static int assertions;

    private interface Test { void run() throws Exception; }

    public static void main(String[] args) throws Exception {
        run("DOCX 标题、文本、换行与表格段落", OfficeConverterTest::docxText);
        run("PPTX 按关联关系排序并保留空白页", OfficeConverterTest::pptxOrder);
        run("PPTX 无清单时按数字排序", OfficeConverterTest::pptxFallback);
        run("XLSX 工作表关系、共享字符串与多种单元格", OfficeConverterTest::xlsxText);
        run("XLSX 不依赖共享字符串和关系清单", OfficeConverterTest::xlsxFallback);
        run("三种无文字文档均报错", OfficeConverterTest::emptyDocuments);
        run("参数校验及不支持旧版和 PDF", OfficeConverterTest::invalidArguments);
        run("无效 ZIP、截断 ZIP、目录和校验值损坏", OfficeConverterTest::invalidZip);
        run("ZIP 路径穿越、绝对路径与重复条目", OfficeConverterTest::unsafePaths);
        run("压缩输入大小上限", OfficeConverterTest::inputLimit);
        run("压缩炸弹和单条目解压上限", OfficeConverterTest::entryLimit);
        run("全部条目的累计解压上限", OfficeConverterTest::totalLimit);
        run("ZIP 目录项数量上限", OfficeConverterTest::entryCountLimit);
        run("输出文本上限与重复引用上限", OfficeConverterTest::textLimit);
        run("拒绝内部实体、外部实体及外部 DTD", OfficeConverterTest::doctypeBlocked);
        run("UTF-16 XML 与 UTF-16 实体攻击", OfficeConverterTest::utf16AndEntities);
        run("非法 XML、无效编码与 XML 深度限制", OfficeConverterTest::invalidXml);
        run("XML 元素数量限制", OfficeConverterTest::elementLimit);
        run("损坏的共享字符串索引不会被静默忽略", OfficeConverterTest::badSharedIndex);
        run("错误信息不包含文档内容", OfficeConverterTest::noContentInErrors);
        System.out.println("通过 " + passed + " 项测试，" + assertions + " 次断言。");
    }

    private static void run(String name, Test test) throws Exception {
        try {
            test.run();
            passed++;
            System.out.println("通过：" + name);
        } catch (Throwable t) {
            System.err.println("失败：" + name);
            throw t;
        }
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }

    private static void contains(String value, String expected) {
        check(value.contains(expected), "缺少预期文本：" + expected);
    }

    private static void sequence(String value, String... terms) {
        int from = 0;
        for (String term : terms) {
            int index = value.indexOf(term, from);
            check(index >= from, "输出顺序错误：" + term);
            from = index + term.length();
        }
    }

    private static void rejected(String expectedMessage, Test operation) throws Exception {
        assertions++;
        try {
            operation.run();
        } catch (IllegalArgumentException e) {
            check(e.getMessage() != null && e.getMessage().contains(expectedMessage), "异常信息不清楚");
            return;
        }
        throw new AssertionError("应拒绝：" + expectedMessage);
    }

    private static byte[] utf8(String text) { return text.getBytes(StandardCharsets.UTF_8); }

    private static Map<String, byte[]> parts(Object... pairs) {
        Map<String, byte[]> result = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) {
            Object value = pairs[i + 1];
            result.put((String) pairs[i], value instanceof byte[] ? (byte[]) value : utf8((String) value));
        }
        return result;
    }

    private static byte[] zip(Map<String, byte[]> parts) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream out = new ZipOutputStream(bytes)) {
            for (Map.Entry<String, byte[]> part : parts.entrySet()) {
                out.putNextEntry(new ZipEntry(part.getKey()));
                out.write(part.getValue());
                out.closeEntry();
            }
        }
        return bytes.toByteArray();
    }

    private static byte[] docZip(String body) throws IOException {
        return zip(parts("word/document.xml", doc(body)));
    }

    private static String doc(String body) {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:document xmlns:w=\"" + W
                + "\"><w:body>" + body + "</w:body></w:document>";
    }

    private static String slide(String body) {
        return "<p:sld xmlns:p=\"" + P + "\" xmlns:a=\"" + A + "\"><p:cSld><p:spTree>"
                + body + "</p:spTree></p:cSld></p:sld>";
    }

    private static String drawing(String text) { return "<a:p><a:r><a:t>" + text + "</a:t></a:r></a:p>"; }
    private static String worksheet(String rows) { return "<worksheet xmlns=\"" + S + "\"><sheetData>" + rows + "</sheetData></worksheet>"; }
    private static String rels(String links) { return "<Relationships xmlns=\"" + PR + "\">" + links + "</Relationships>"; }
    private static String rel(String id, String type, String target) {
        return "<Relationship Id=\"" + id + "\" Type=\"" + R + "/" + type + "\" Target=\"" + target + "\"/>";
    }
    private static String convert(byte[] bytes, String name, String ext) { return OfficeConverter.convert(bytes, name, ext); }

    private static void docxText() throws Exception {
        byte[] file = docZip("<w:p><w:pPr><w:pStyle w:val=\"Heading1\"/></w:pPr>"
                + "<w:r><w:t>标题</w:t></w:r></w:p>"
                + "<w:p><w:r><w:t>一段 &amp; </w:t></w:r><w:r><w:t>第二段</w:t><w:tab/>"
                + "<w:t>后文</w:t><w:br/><w:t>换行</w:t></w:r></w:p>"
                + "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>表格文字</w:t></w:r></w:p></w:tc></w:tr></w:tbl>");
        String result = convert(file, "示例.docx", ".DoCx");
        sequence(result, "# 文档：示例.docx", "# 标题", "一段 & 第二段\t后文\n换行", "表格文字");
        check(result.length() <= 200000, "结果超过文字上限");
    }

    private static void pptxOrder() throws Exception {
        String presentation = "<p:presentation xmlns:p=\"" + P + "\" xmlns:r=\"" + R
                + "\"><p:sldIdLst><p:sldId r:id=\"r2\"/><p:sldId r:id=\"r1\"/>"
                + "<p:sldId r:id=\"r3\"/></p:sldIdLst></p:presentation>";
        byte[] file = zip(parts("ppt/slides/slide1.xml", slide(drawing("第二页")),
                "ppt/slides/slide3.xml", slide(""),
                "ppt/slides/slide2.xml", slide(drawing("第一页")),
                "ppt/presentation.xml", presentation,
                "ppt/_rels/presentation.xml.rels", rels(rel("r1", "slide", "slides/slide1.xml")
                        + rel("r2", "slide", "slides/slide2.xml") + rel("r3", "slide", "slides/slide3.xml"))));
        String result = convert(file, "课堂.pptx", "pptx");
        sequence(result, "# 课件：课堂.pptx", "## 第 1 页", "第一页", "## 第 2 页", "第二页", "## 第 3 页");
    }

    private static void pptxFallback() throws Exception {
        byte[] file = zip(parts("ppt/slides/slide10.xml", slide(drawing("十")),
                "ppt/slides/slide2.xml", slide(drawing("二"))));
        String result = convert(file, "演示", "PPTX");
        sequence(result, "## 第 1 页", "二", "## 第 2 页", "十");
    }

    private static void xlsxText() throws Exception {
        String workbook = "<workbook xmlns=\"" + S + "\" xmlns:r=\"" + R
                + "\"><sheets><sheet name=\"成绩 &amp; 项目\" r:id=\"r2\"/>"
                + "<sheet name=\"统计\" r:id=\"r1\"/></sheets></workbook>";
        String shared = "<sst xmlns=\"" + S + "\"><si><t>张三 &amp; 李四</t></si>"
                + "<si><r><t>甲 | </t></r><r><t>乙</t></r><rPh><t>不显示读音</t></rPh></si></sst>";
        String first = worksheet("<row r=\"1\"><c r=\"A1\" t=\"s\"><v>0</v></c>"
                + "<c r=\"B1\" t=\"s\"><v>1</v></c><c r=\"D1\" t=\"inlineStr\"><is>"
                + "<r><t>内联</t></r><r><t>文字</t></r></is></c><c r=\"E1\"><v>42</v></c>"
                + "<c r=\"F1\" t=\"b\"><v>1</v></c><c r=\"G1\"><f>40+2</f><v>42</v></c></row>");
        String second = worksheet("<row><c r=\"B2\" t=\"str\"><v>合计</v></c></row>");
        byte[] file = zip(parts("xl/worksheets/sheet1.xml", second, "xl/worksheets/sheet2.xml", first,
                "xl/sharedStrings.xml", shared, "xl/workbook.xml", workbook,
                "xl/_rels/workbook.xml.rels", rels(rel("r1", "worksheet", "worksheets/sheet1.xml")
                        + rel("r2", "worksheet", "worksheets/sheet2.xml"))));
        String result = convert(file, "表.xlsx", "xlsx");
        sequence(result, "# 表格：表.xlsx", "## 成绩 ", "| A1 | 张三 &amp; 李四 |", "| B1 | 甲 \\| 乙 |",
                "| D1 | 内联文字 |", "| E1 | 42 |", "| F1 | TRUE |", "| G1 | 42 |", "## 统计", "| B2 | 合计 |");
        check(!result.contains("不显示读音"), "不应把拼音注释当成单元格文字");
    }

    private static void xlsxFallback() throws Exception {
        byte[] file = zip(parts("xl/worksheets/sheet10.xml", worksheet("<row><c r=\"C1\" t=\"inlineStr\"><is><t>后</t></is></c></row>"),
                "xl/worksheets/sheet2.xml", worksheet("<row><c r=\"A1\"><v>9</v></c></row>")));
        String result = convert(file, "直接.xlsx", "xlsx");
        sequence(result, "## 工作表 1", "| A1 | 9 |", "## 工作表 2", "| C1 | 后 |");
    }

    private static void emptyDocuments() throws Exception {
        rejected("没有可提取", () -> convert(docZip("<w:p><w:r><w:t> </w:t></w:r></w:p>"), "a", "docx"));
        rejected("没有可提取", () -> convert(zip(parts("ppt/slides/slide1.xml", slide("<a:p/>"))), "a", "pptx"));
        rejected("没有可提取", () -> convert(zip(parts("xl/worksheets/sheet1.xml", worksheet("<row><c r=\"A1\"/></row>"))), "a", "xlsx"));
        rejected("没有找到正文", () -> convert(zip(parts("other.xml", "<x/>")), "a", "docx"));
    }

    private static void invalidArguments() throws Exception {
        byte[] valid = docZip("<w:p><w:r><w:t>内容</w:t></w:r></w:p>");
        rejected("不能为空", () -> convert(null, "a", "docx"));
        rejected("不能为空", () -> convert(new byte[0], "a", "docx"));
        rejected("文件名", () -> convert(valid, null, "docx"));
        rejected("文件名", () -> convert(valid, "  ", "docx"));
        rejected("扩展名", () -> convert(valid, "a", null));
        for (String ext : new String[] {"doc", "ppt", "xls", "pdf", "zip", "docx/../pdf"}) {
            rejected("仅支持", () -> convert(valid, "a", ext));
        }
    }

    private static int lastSignature(byte[] bytes, int a, int b, int c, int d) {
        for (int i = bytes.length - 4; i >= 0; i--) {
            if ((bytes[i] & 255) == a && (bytes[i + 1] & 255) == b
                    && (bytes[i + 2] & 255) == c && (bytes[i + 3] & 255) == d) return i;
        }
        throw new AssertionError("合成 ZIP 的测试签名不存在");
    }

    private static void invalidZip() throws Exception {
        rejected("ZIP", () -> convert(utf8("这不是 ZIP"), "a", "docx"));
        byte[] valid = docZip("<w:p><w:r><w:t>合成文字</w:t></w:r></w:p>");
        rejected("ZIP", () -> convert(Arrays.copyOf(valid, valid.length - 10), "a", "docx"));
        byte[] badDirectory = valid.clone();
        int cd = lastSignature(badDirectory, 0x50, 0x4b, 0x01, 0x02);
        badDirectory[cd] = 0;
        rejected("ZIP", () -> convert(badDirectory, "a", "docx"));
        byte[] badCrc = valid.clone();
        cd = lastSignature(badCrc, 0x50, 0x4b, 0x01, 0x02);
        badCrc[cd + 16] ^= 1;
        rejected("ZIP", () -> convert(badCrc, "a", "docx"));
        rejected("ZIP", () -> convert(zip(parts()), "a", "docx"));
    }

    private static void replaceAscii(byte[] bytes, String oldText, String newText) {
        byte[] old = utf8(oldText), replacement = utf8(newText);
        check(old.length == replacement.length, "测试替换长度错误");
        int changes = 0;
        outer: for (int i = 0; i <= bytes.length - old.length; i++) {
            for (int j = 0; j < old.length; j++) if (bytes[i + j] != old[j]) continue outer;
            System.arraycopy(replacement, 0, bytes, i, old.length);
            changes++;
            i += old.length - 1;
        }
        check(changes == 2, "测试必须修改中央目录与本地条目");
    }

    private static void unsafePaths() throws Exception {
        for (String path : new String[] {"../evil", "/absolute", "a/../../evil", "a\\..\\evil", "C:/evil", "a//evil", "a/%2e%2e/evil"}) {
            byte[] file = zip(parts("word/document.xml", doc("<w:p><w:r><w:t>有效内容</w:t></w:r></w:p>"), path, "x"));
            rejected("路径", () -> convert(file, "a", "docx"));
        }
        byte[] duplicates = zip(parts("word/document.xml", "<a/>", "word/document.xm2", "<b/>"));
        replaceAscii(duplicates, "word/document.xm2", "word/document.xml");
        rejected("重复", () -> convert(duplicates, "a", "docx"));
    }

    private static void inputLimit() throws Exception {
        rejected("12 MiB", () -> convert(new byte[12 * MIB + 1], "a", "docx"));
    }

    private static void entryLimit() throws Exception {
        byte[] bomb = zip(parts("word/document.xml", doc("<w:p><w:r><w:t>正文</w:t></w:r></w:p>"),
                "word/media/oversized.bin", new byte[8 * MIB + 1]));
        check(bomb.length < MIB, "测试压缩炸弹应具有高压缩比");
        rejected("8 MiB", () -> convert(bomb, "a", "docx"));
        byte[] allowed = zip(parts("word/document.xml", doc("<w:p><w:r><w:t>正文</w:t></w:r></w:p>"),
                "word/media/exact.bin", new byte[8 * MIB]));
        contains(convert(allowed, "a", "docx"), "正文");
    }

    private static void totalLimit() throws Exception {
        byte[] zeros = new byte[8 * MIB];
        byte[] bomb = zip(parts("word/document.xml", doc("<w:p><w:r><w:t>正文</w:t></w:r></w:p>"),
                "media/a", zeros, "media/b", zeros, "media/c", zeros));
        check(bomb.length < MIB, "测试累计炸弹应具有高压缩比");
        rejected("24 MiB", () -> convert(bomb, "a", "docx"));
    }

    private static void entryCountLimit() throws Exception {
        Map<String, byte[]> entries = parts("word/document.xml", doc("<w:p><w:r><w:t>正文</w:t></w:r></w:p>"));
        for (int i = 0; i < 512; i++) entries.put("unused/" + i, new byte[0]);
        rejected("512", () -> convert(zip(entries), "a", "docx"));
    }

    private static String repeat(char c, int count) {
        char[] chars = new char[count];
        Arrays.fill(chars, c);
        return new String(chars);
    }

    private static void textLimit() throws Exception {
        byte[] tooLong = docZip("<w:p><w:r><w:t>" + repeat('字', 200001) + "</w:t></w:r></w:p>");
        rejected("20 万", () -> convert(tooLong, "a", "docx"));
        byte[] near = docZip("<w:p><w:r><w:t>" + repeat('字', 199900) + "</w:t></w:r></w:p>");
        check(convert(near, "a", "docx").length() <= 200000, "边界内的内容未返回");
        StringBuilder cells = new StringBuilder("<row>");
        for (int i = 1; i <= 210; i++) cells.append("<c r=\"A").append(i).append("\" t=\"s\"><v>0</v></c>");
        cells.append("</row>");
        byte[] repeated = zip(parts("xl/sharedStrings.xml", "<sst xmlns=\"" + S + "\"><si><t>" + repeat('字', 1000) + "</t></si></sst>",
                "xl/worksheets/sheet1.xml", worksheet(cells.toString())));
        rejected("20 万", () -> convert(repeated, "a", "xlsx"));
    }

    private static void doctypeBlocked() throws Exception {
        String[] declarations = {
                "<!DOCTYPE w:document [<!ENTITY x '合成'>]>",
                "<!DOCTYPE w:document [<!ENTITY x SYSTEM 'file:///not-read'>]>",
                "<!DOCTYPE w:document SYSTEM 'http://127.0.0.1:9/not-requested'>",
                "<!DOCTYPE w:document [<!ENTITY % p SYSTEM 'http://127.0.0.1:9/not-requested'>%p;]>"
        };
        for (String dtd : declarations) {
            String xml = dtd + "<w:document xmlns:w=\"" + W + "\"><w:body><w:p><w:r><w:t>&x;</w:t></w:r></w:p></w:body></w:document>";
            byte[] file = zip(parts("word/document.xml", xml));
            rejected("禁止", () -> convert(file, "a", "docx"));
        }
    }

    private static void utf16AndEntities() throws Exception {
        for (Charset encoding : new Charset[] {StandardCharsets.UTF_16LE, StandardCharsets.UTF_16BE}) {
            String xml = "<?xml version=\"1.0\" encoding=\"UTF-16\"?><w:document xmlns:w=\"" + W
                    + "\"><w:body><w:p><w:r><w:t>合成中文</w:t></w:r></w:p></w:body></w:document>";
            contains(convert(zip(parts("word/document.xml", xml.getBytes(encoding))), "a", "docx"), "合成中文");
            String unsafe = "<?xml version=\"1.0\"?><!DOCTYPE w:document [<!ENTITY x SYSTEM 'file:///not-read'>]>"
                    + "<w:document xmlns:w=\"" + W + "\"><w:body><w:p><w:r><w:t>&x;</w:t></w:r></w:p></w:body></w:document>";
            rejected("禁止", () -> convert(zip(parts("word/document.xml", unsafe.getBytes(encoding))), "a", "docx"));
        }
    }

    private static void invalidXml() throws Exception {
        rejected("XML", () -> convert(zip(parts("word/document.xml", "<w:document>")), "a", "docx"));
        rejected("编码", () -> convert(zip(parts("word/document.xml", new byte[] {(byte) 0xc3, 0x28})), "a", "docx"));
        StringBuilder deep = new StringBuilder("<w:p>");
        for (int i = 0; i < 130; i++) deep.append("<x>");
        deep.append("<w:r><w:t>x</w:t></w:r>");
        for (int i = 0; i < 130; i++) deep.append("</x>");
        deep.append("</w:p>");
        rejected("结构", () -> convert(docZip(deep.toString()), "a", "docx"));
    }

    private static void elementLimit() throws Exception {
        StringBuilder many = new StringBuilder();
        for (int i = 0; i < 200001; i++) many.append("<x/>");
        rejected("结构", () -> convert(docZip(many.toString()), "a", "docx"));
    }

    private static void badSharedIndex() throws Exception {
        byte[] file = zip(parts("xl/sharedStrings.xml", "<sst xmlns=\"" + S + "\"><si><t>仅一项</t></si></sst>",
                "xl/worksheets/sheet1.xml", worksheet("<row><c r=\"A1\" t=\"s\"><v>9</v></c></row>")));
        rejected("索引", () -> convert(file, "a", "xlsx"));
    }

    private static void noContentInErrors() throws Exception {
        String marker = "合成的隐私标记SENTINEL";
        byte[] file = zip(parts("word/document.xml", "<broken>" + marker));
        try {
            convert(file, "a", "docx");
            throw new AssertionError("畸形 XML 未报错");
        } catch (IllegalArgumentException e) {
            check(!e.getMessage().contains(marker), "异常包含文档内容");
            check(e.getCause() == null, "异常不应暴露底层内容");
        }
    }
}
