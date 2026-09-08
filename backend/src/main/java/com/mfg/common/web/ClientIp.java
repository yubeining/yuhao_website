package com.mfg.common.web;

import jakarta.servlet.http.HttpServletRequest;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

/**
 * 取客户端真实 IP —— 本系统永远在 Sealos 的 istio ingress 后面，真实客户端 IP 在
 * {@code X-Forwarded-For} 的最左一跳；直连（本地）时用 {@code remoteAddr}。
 *
 * <p>★ 只在"确知处于可信代理之后"才信 XFF（我们的部署形态就是如此）。裸信 XFF 在没有可信代理时
 * 可被伪造 —— 所以这个工具只该用于限流/审计这类"IP 只是个计数维度"的场景，不作安全判定依据。
 */
public final class ClientIp {

    private static final String XFF = "X-Forwarded-For";

    private ClientIp() {
    }

    /** 客户端 IP 原值。 */
    public static String of(HttpServletRequest request) {
        String xff = request.getHeader(XFF);
        if (xff != null && !xff.isBlank()) {
            // 最左 = 最初的客户端（后面几跳是各级代理）
            int comma = xff.indexOf(',');
            String first = (comma < 0 ? xff : xff.substring(0, comma)).trim();
            if (!first.isEmpty()) {
                return first;
            }
        }
        String remote = request.getRemoteAddr();
        return remote == null ? "unknown" : remote;
    }

    /**
     * 客户端 IP 的短 hash —— 落限流 key / 审计时用，不落原始 IP（§6/§7：日志/审计不放原始 IP）。
     */
    public static String hashed(HttpServletRequest request) {
        return sha256Short(of(request));
    }

    /** 对任意原值做同样的短 hash —— 给已经持有原始 IP 的调用方（如 RequestContext）复用。 */
    public static String hash(String value) {
        return sha256Short(value);
    }

    private static String sha256Short(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest).substring(0, 16);
        } catch (Exception e) {
            return "nohash";
        }
    }
}
