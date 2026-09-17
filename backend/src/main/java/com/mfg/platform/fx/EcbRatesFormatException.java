package com.mfg.platform.fx;

/** 拿到的内容不是一份合格的 ECB 每日汇率文件。整份拒绝，不存半截。 */
class EcbRatesFormatException extends RuntimeException {

    EcbRatesFormatException(String message) {
        super(message);
    }

    EcbRatesFormatException(String message, Throwable cause) {
        super(message, cause);
    }
}
