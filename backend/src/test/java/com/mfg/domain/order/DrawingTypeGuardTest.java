package com.mfg.domain.order;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 图纸类型按文件内容判，不信扩展名（设计文档 2 §5.2）。
 *
 * <p>字节样本都是各格式<b>规范定义</b>的文件头，不是随手编的：
 * PDF {@code %PDF-}、ZIP {@code PK\x03\x04}、DWG {@code AC10xx}、
 * STEP {@code ISO-10303-21;}（ISO 10303-21 规定的第一行）、
 * DXF 以组码 0 + {@code SECTION} 开头、IGES 每条记录 80 列且第 73 列是段标识（首条为 {@code S}）、
 * SLDPRT 是 OLE2 复合文档（{@code D0 CF 11 E0 A1 B1 1A E1}）。
 *
 * <p>X_T 没有可验证的签名 —— 只能信扩展名。这条违背文档 2 §5.2，是如实钉下来的已知限制。
 */
class DrawingTypeGuardTest {

    /** 最小可用的 OOXML 包：`[Content_Types].xml` 声明了主文档类型，tika 据此细化到具体格式。 */
    private static byte[] ooxml(String mainPath, String mainType) throws Exception {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        try (java.util.zip.ZipOutputStream zip = new java.util.zip.ZipOutputStream(out)) {
            zip.putNextEntry(new java.util.zip.ZipEntry("[Content_Types].xml"));
            zip.write(("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                    + "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
                    + "<Override PartName=\"/" + mainPath + "\" ContentType=\"" + mainType + "\"/>"
                    + "</Types>").getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
            zip.putNextEntry(new java.util.zip.ZipEntry(mainPath));
            zip.write("<?xml version=\"1.0\"?><root/>".getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
        }
        return out.toByteArray();
    }

    private final DrawingTypeGuard guard = new DrawingTypeGuard(
            Set.of("STEP", "STP", "IGES", "IGS", "X_T", "SLDPRT", "DWG", "DXF", "PDF", "ZIP",
                    "DOC", "DOCX", "XLS", "XLSX", "PPT", "PPTX", "PNG", "JPG", "JPEG"));

    // ---------- 放宽后的格式（2026-11-15）：Office 文档与图纸照片 ----------

    private static final String DOCX_TYPE =
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    private static final String XLSX_TYPE =
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    @Test
    void docxIsAcceptedAndReportedAsDocx() throws Exception {
        byte[] docx = ooxml("word/document.xml", DOCX_TYPE + ".main+xml");
        DrawingTypeGuard.Verdict v = guard.inspect("工艺卡.docx", docx);
        assertThat(v.accepted()).isTrue();
        assertThat(v.detectedType()).isEqualTo(DOCX_TYPE);
    }

    @Test
    void xlsxIsAccepted() throws Exception {
        byte[] xlsx = ooxml("xl/workbook.xml", XLSX_TYPE + ".main+xml");
        assertThat(guard.inspect("检验表.xlsx", xlsx).accepted()).isTrue();
    }

    @Test
    void pngIsAccepted() {
        byte[] png = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D};
        assertThat(guard.inspect("photo.png", png).accepted()).isTrue();
    }

    @Test
    void docxExtensionWithPdfBytesIsRejected() {
        byte[] pdf = "%PDF-1.7\n".getBytes(StandardCharsets.US_ASCII);
        assertThat(guard.inspect("fake.docx", pdf).accepted()).isFalse();
    }

    @Test
    void legacyDocIsAcceptedAsOle2Container() {
        byte[] ole2 = {(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0,
                (byte) 0xA1, (byte) 0xB1, 0x1A, (byte) 0xE1, 0, 0, 0, 0};
        assertThat(guard.inspect("old.doc", ole2).accepted()).isTrue();
    }

    // ---------- 扩展名白名单：看内容之前的第一道 ----------

    @Test
    void extensionOutsideWhitelistIsRejected() {
        assertThat(guard.isAllowedExtension("drawing.exe")).isFalse();
        assertThat(guard.isAllowedExtension("no-extension")).isFalse();
        assertThat(guard.isAllowedExtension("trailing-dot.")).isFalse();
    }

    @Test
    void extensionMatchIsCaseInsensitive() {
        assertThat(guard.isAllowedExtension("Part.STEP")).isTrue();
        assertThat(guard.isAllowedExtension("part.step")).isTrue();
        assertThat(guard.isAllowedExtension("assembly.x_t")).isTrue();
    }

    // ---------- 内容和扩展名对得上：放行 ----------

    @Test
    void pdfIsAccepted() {
        assertThat(guard.inspect("a.pdf", ascii("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n")).accepted())
                .isTrue();
    }

    @Test
    void zipIsAccepted() {
        assertThat(guard.inspect("bundle.zip", withPrefix(0x50, 0x4B, 0x03, 0x04)).accepted()).isTrue();
    }

    @Test
    void dwgIsAccepted() {
        assertThat(guard.inspect("part.dwg", withPrefix(ascii("AC1027"))).accepted()).isTrue();
    }

    @Test
    void stepIsAcceptedByIsoHeader() {
        byte[] head = ascii("ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\n");
        assertThat(guard.inspect("part.step", head).accepted()).isTrue();
        assertThat(guard.inspect("part.stp", head).accepted()).isTrue();
    }

    @Test
    void dxfIsAccepted() {
        assertThat(guard.inspect("part.dxf", ascii("  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1027\n"))
                .accepted()).isTrue();
    }

    @Test
    void igesIsAccepted() {
        String start = "Test IGES file";
        byte[] head = ascii(start + " ".repeat(72 - start.length()) + "S      1\n");
        assertThat(guard.inspect("part.igs", head).accepted()).isTrue();
        assertThat(guard.inspect("part.iges", head).accepted()).isTrue();
    }

    @Test
    void sldprtIsAcceptedAsOle2Container() {
        byte[] ole2 = withPrefix(0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1);
        assertThat(guard.inspect("part.sldprt", ole2).accepted()).isTrue();
    }

    /** 已知限制：X_T 没有可验证的签名，任何内容都放行，且不声称判出了类型。 */
    @Test
    void xtIsAcceptedOnExtensionAloneAndReportsNoDetectedType() {
        DrawingTypeGuard.Verdict v = guard.inspect("part.x_t", ascii("anything at all"));
        assertThat(v.accepted()).isTrue();
        assertThat(v.detectedType()).isNull();
    }

    // ---------- 内容和扩展名对不上：拒 ----------

    @Test
    void pdfBytesRenamedToDwgAreRejected() {
        assertThat(guard.inspect("fake.dwg", ascii("%PDF-1.7\n1 0 obj\n")).accepted()).isFalse();
    }

    @Test
    void zipBytesRenamedToPdfAreRejected() {
        assertThat(guard.inspect("fake.pdf", withPrefix(0x50, 0x4B, 0x03, 0x04)).accepted()).isFalse();
    }

    @Test
    void plainTextRenamedToStepIsRejected() {
        assertThat(guard.inspect("fake.step", ascii("just some notes, not a STEP file\n")).accepted()).isFalse();
    }

    @Test
    void plainTextRenamedToIgesIsRejected() {
        assertThat(guard.inspect("fake.igs", ascii("just some notes, not an IGES file\n")).accepted()).isFalse();
    }

    @Test
    void ole2BytesRenamedToPdfAreRejected() {
        byte[] ole2 = withPrefix(0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1);
        assertThat(guard.inspect("fake.pdf", ole2).accepted()).isFalse();
    }

    @Test
    void emptyContentIsRejectedForVerifiableTypes() {
        assertThat(guard.inspect("empty.pdf", new byte[0]).accepted()).isFalse();
        assertThat(guard.inspect("empty.step", new byte[0]).accepted()).isFalse();
    }

    @Test
    void disallowedExtensionIsRejectedEvenWithValidContent() {
        assertThat(guard.inspect("report.exe", ascii("%PDF-1.7\n")).accepted()).isFalse();
    }

    // ---------- helpers ----------

    private static byte[] ascii(String s) {
        return s.getBytes(StandardCharsets.US_ASCII);
    }

    /** 512 字节，前面是给定的文件头，其余补 0 —— 足够让按文件头判类型的逻辑看到完整签名。 */
    private static byte[] withPrefix(int... prefix) {
        byte[] b = new byte[512];
        for (int i = 0; i < prefix.length; i++) {
            b[i] = (byte) prefix[i];
        }
        return b;
    }

    private static byte[] withPrefix(byte[] prefix) {
        byte[] b = new byte[512];
        System.arraycopy(prefix, 0, b, 0, prefix.length);
        return b;
    }
}
