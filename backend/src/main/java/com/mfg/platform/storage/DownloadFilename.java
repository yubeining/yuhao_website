package com.mfg.platform.storage;

import java.nio.charset.StandardCharsets;

/**
 * 下载链接的 {@code Content-Disposition} —— 让浏览器按原文件名保存。
 *
 * <p>存储 key 按设计不含客户文件名（{@code drawing/<uuid>}），不带这个头，
 * 下载下来的文件名就是一串 uuid、没有扩展名，CAD 软件按扩展名打不开。
 *
 * <p>文件名来自客户输入，进响应头之前必须清洗：去掉控制字符（回车换行能注入额外的头）、
 * 引号和反斜杠换成下划线、超长截断但保住扩展名。
 * 同时给两种形式：{@code filename} 是 ASCII 兜底，{@code filename*} 按 RFC 5987 保留原名。
 */
final class DownloadFilename {

    static final int MAX_LENGTH = 200;
    private static final int MAX_EXTENSION_LENGTH = 20;
    private static final String FALLBACK = "download";
    private static final char[] HEX = "0123456789ABCDEF".toCharArray();

    private DownloadFilename() {
    }

    static String contentDisposition(String filename) {
        String clean = sanitize(filename);
        return "attachment; filename=\"" + asciiFallback(clean) + "\"; filename*=UTF-8''" + rfc5987(clean);
    }

    private static String sanitize(String filename) {
        if (filename == null) {
            return FALLBACK;
        }
        StringBuilder sb = new StringBuilder(filename.length());
        for (int i = 0; i < filename.length(); i++) {
            char c = filename.charAt(i);
            if (c < 0x20 || c == 0x7F) {
                continue;
            }
            sb.append(c == '"' || c == '\\' ? '_' : c);
        }
        String s = sb.toString().trim();
        if (s.isEmpty()) {
            return FALLBACK;
        }
        return s.length() <= MAX_LENGTH ? s : truncateKeepingExtension(s);
    }

    private static String truncateKeepingExtension(String s) {
        int dot = s.lastIndexOf('.');
        String ext = dot > 0 && s.length() - dot <= MAX_EXTENSION_LENGTH ? s.substring(dot) : "";
        int cut = MAX_LENGTH - ext.length();
        // 不要从一个代理对中间切开
        if (Character.isLowSurrogate(s.charAt(cut))) {
            cut--;
        }
        return s.substring(0, cut) + ext;
    }

    private static String asciiFallback(String s) {
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            sb.append(c >= 0x20 && c < 0x7F ? c : '_');
        }
        return sb.toString();
    }

    /** RFC 5987 attr-char 原样保留，其余按 UTF-8 字节百分号编码。 */
    private static String rfc5987(String s) {
        StringBuilder sb = new StringBuilder();
        for (byte b : s.getBytes(StandardCharsets.UTF_8)) {
            int c = b & 0xFF;
            if (isAttrChar(c)) {
                sb.append((char) c);
            } else {
                sb.append('%').append(HEX[c >> 4]).append(HEX[c & 0x0F]);
            }
        }
        return sb.toString();
    }

    private static boolean isAttrChar(int c) {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
                || "!#$&+-.^_`|~".indexOf(c) >= 0;
    }
}
