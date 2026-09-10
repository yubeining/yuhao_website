package com.mfg.domain.order;

import org.apache.tika.Tika;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 图纸类型校验 —— 按文件内容判，不信扩展名（设计文档 2 §5.2）。
 *
 * <p>分两道：申请上传时先看扩展名在不在白名单（{@link #isAllowedExtension}，便宜，挡掉明显不对的）；
 * 字节进桶之后 complete 时再读文件头判真实类型（{@link #inspect}）。
 *
 * <h3>每种格式实际能验到什么（2026-09-10 用项目 classpath 实测 tika-core 3.0.0）</h3>
 * <table>
 *   <tr><th>扩展名</th><th>判据</th><th>强度</th></tr>
 *   <tr><td>PDF / ZIP / DWG / DXF</td><td>tika 按文件头判</td><td>真校验</td></tr>
 *   <tr><td>STEP / STP</td><td>tika 不认识；显式判 ISO 10303-21 规定的首行 {@code ISO-10303-21;}</td><td>真校验</td></tr>
 *   <tr><td>IGES / IGS</td><td>tika 只有扩展名规则、没有文件头规则；显式判 IGES 规范的
 *       固定 80 列记录，首条记录第 73 列为 {@code S}（或二进制 / 压缩格式的 {@code B} / {@code C}）</td>
 *       <td>按规范推出，<b>未用真实客户文件验证过</b></td></tr>
 *   <tr><td>SLDPRT</td><td>tika 只认得出 OLE2 复合文档容器</td><td>只验到容器</td></tr>
 *   <tr><td>X_T</td><td>没有可验证的签名</td><td><b>只能信扩展名</b>，违背文档 2 §5.2</td></tr>
 * </table>
 *
 * <p>ZIP 不解包，不防解压炸弹 —— 本轮不做。
 */
final class DrawingTypeGuard {

    record Verdict(boolean accepted, String detectedType) {

        static Verdict accept(String detectedType) {
            return new Verdict(true, detectedType);
        }

        static Verdict reject(String detectedType) {
            return new Verdict(false, detectedType);
        }
    }

    /** 扩展名 → tika 判出的类型（去掉 {@code ; format=...} 参数后比较）。 */
    private static final Map<String, String> TIKA_TYPES = Map.of(
            "PDF", "application/pdf",
            "ZIP", "application/zip",
            "DWG", "image/vnd.dwg",
            "DXF", "image/vnd.dxf",
            "SLDPRT", "application/x-tika-msoffice");

    private static final Set<String> STEP = Set.of("STEP", "STP");
    private static final Set<String> IGES = Set.of("IGES", "IGS");
    private static final Set<String> UNVERIFIABLE = Set.of("X_T");

    private static final byte[] STEP_HEADER = "ISO-10303-21;".getBytes(StandardCharsets.US_ASCII);
    private static final int IGES_SECTION_COLUMN = 72;   // 第 73 列，0 起算
    private static final Set<Character> IGES_FIRST_SECTIONS = Set.of('S', 'B', 'C');

    private final Set<String> allowedExtensions;
    private final Tika tika = new Tika();

    DrawingTypeGuard(Set<String> allowedExtensions) {
        this.allowedExtensions = allowedExtensions.stream()
                .map(e -> e.trim().toUpperCase(Locale.ROOT))
                .filter(e -> !e.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    boolean isAllowedExtension(String filename) {
        String ext = extensionOf(filename);
        return ext != null && allowedExtensions.contains(ext);
    }

    /**
     * @param filename 客户端给的文件名，只用来取扩展名
     * @param head     对象开头的若干字节（调用方读前几 KB 即可）
     */
    Verdict inspect(String filename, byte[] head) {
        String ext = extensionOf(filename);
        if (ext == null || !allowedExtensions.contains(ext)) {
            return Verdict.reject(null);
        }
        if (UNVERIFIABLE.contains(ext)) {
            return Verdict.accept(null);
        }
        if (STEP.contains(ext)) {
            return startsWith(head, STEP_HEADER) ? Verdict.accept("model/step") : Verdict.reject(detect(head));
        }
        if (IGES.contains(ext)) {
            return looksLikeIges(head) ? Verdict.accept("model/iges") : Verdict.reject(detect(head));
        }
        String expected = TIKA_TYPES.get(ext);
        String detected = detect(head);
        if (expected == null) {
            // 白名单里配了一个这里不认识的扩展名：宁可拒，不静默放行
            return Verdict.reject(detected);
        }
        return expected.equals(baseType(detected)) ? Verdict.accept(detected) : Verdict.reject(detected);
    }

    private String detect(byte[] head) {
        return tika.detect(head == null ? new byte[0] : head);
    }

    private static String extensionOf(String filename) {
        if (filename == null) {
            return null;
        }
        int dot = filename.lastIndexOf('.');
        if (dot < 0 || dot == filename.length() - 1) {
            return null;
        }
        return filename.substring(dot + 1).toUpperCase(Locale.ROOT);
    }

    private static String baseType(String mediaType) {
        int semi = mediaType.indexOf(';');
        return (semi < 0 ? mediaType : mediaType.substring(0, semi)).trim();
    }

    private static boolean startsWith(byte[] data, byte[] prefix) {
        if (data == null || data.length < prefix.length) {
            return false;
        }
        for (int i = 0; i < prefix.length; i++) {
            if (data[i] != prefix[i]) {
                return false;
            }
        }
        return true;
    }

    /** 首条记录前 72 列不能断行，第 73 列是段标识。 */
    private static boolean looksLikeIges(byte[] head) {
        if (head == null || head.length <= IGES_SECTION_COLUMN) {
            return false;
        }
        for (int i = 0; i < IGES_SECTION_COLUMN; i++) {
            if (head[i] == '\n' || head[i] == '\r') {
                return false;
            }
        }
        return IGES_FIRST_SECTIONS.contains((char) head[IGES_SECTION_COLUMN]);
    }
}
