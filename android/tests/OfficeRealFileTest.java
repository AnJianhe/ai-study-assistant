import com.study.aiassistant.OfficeConverter;
import java.nio.file.Files;
import java.nio.file.Path;

/** 对专门生成的合成文件验证常见 Office 兼容性。 */
public final class OfficeRealFileTest {
    public static void main(String[] args) throws Exception {
        Path root = Path.of(args[0]);
        check(root, "sample.docx", "docx", "分数的分母不能为零");
        check(root, "sample.pptx", "pptx", "光的折射测试");
        check(root, "sample.xlsx", "xlsx", "语文");
        System.out.println("PASS：合成 DOCX、PPTX、XLSX 实际文件");
    }
    private static void check(Path root, String name, String ext, String expected) throws Exception {
        String result = OfficeConverter.convert(Files.readAllBytes(root.resolve(name)), name, ext);
        if (!result.contains(expected)) throw new AssertionError(name + " 未提取预期文字");
    }
}
