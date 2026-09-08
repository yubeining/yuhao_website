package com.mfg.common.web;

/**
 * MDC key 常量 —— 日志里放什么请求级字段，集中在这里，别在各处手写字符串。
 */
public final class MdcKeys {

    public static final String TRACE_ID = "traceId";
    public static final String USER_ID = "userId";
    public static final String PORTAL = "portal";

    private MdcKeys() {
    }
}
