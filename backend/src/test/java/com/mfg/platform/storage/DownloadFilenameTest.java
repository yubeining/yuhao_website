package com.mfg.platform.storage;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 下载链接里的 Content-Disposition。
 *
 * <p>存储 key 是 {@code drawing/<uuid>}（按设计不带客户文件名），不带这个头的话，
 * 浏览器下载下来的文件名就是一串 uuid、没有扩展名，CAD 软件按扩展名打不开。
 * 文件名来自客户输入，放进响应头之前必须清洗，否则能注入额外的头。
 */
class DownloadFilenameTest {

    @Test
    void plainAsciiNameIsKeptWithBothForms() {
        assertThat(DownloadFilename.contentDisposition("bracket-A.step"))
                .isEqualTo("attachment; filename=\"bracket-A.step\"; filename*=UTF-8''bracket-A.step");
    }

    /** 非 ASCII 名：filename 给 ASCII 兜底，filename* 按 RFC 5987 百分号编码保留原名。 */
    @Test
    void nonAsciiNameIsPercentEncodedAndHasAsciiFallback() {
        String cn = "图纸.step";   // 图纸.step
        assertThat(DownloadFilename.contentDisposition(cn))
                .isEqualTo("attachment; filename=\"__.step\"; filename*=UTF-8''%E5%9B%BE%E7%BA%B8.step");
    }

    /** 引号、反斜杠、回车换行都不能进头 —— 换行能注入额外的响应头。 */
    @Test
    void quotesBackslashesAndLineBreaksCannotBreakOutOfTheHeader() {
        String header = DownloadFilename.contentDisposition("a\"b\\c\r\nSet-Cookie: x=1.pdf");
        assertThat(header).doesNotContain("\r").doesNotContain("\n");
        assertThat(header).startsWith("attachment; filename=\"a_b_cSet-Cookie: x=1.pdf\";");
    }

    /** 超长名截断，但保住扩展名 —— 扩展名是 CAD 软件认文件的唯一依据。 */
    @Test
    void overlongNameIsTruncatedButKeepsItsExtension() {
        String header = DownloadFilename.contentDisposition("x".repeat(500) + ".sldprt");
        String fallback = header.substring(header.indexOf('"') + 1, header.indexOf('"', header.indexOf('"') + 1));
        assertThat(fallback).hasSizeLessThanOrEqualTo(DownloadFilename.MAX_LENGTH).endsWith(".sldprt");
    }

    @Test
    void blankNameFallsBackToAGenericOne() {
        assertThat(DownloadFilename.contentDisposition("  \r\n "))
                .isEqualTo("attachment; filename=\"download\"; filename*=UTF-8''download");
    }
}
