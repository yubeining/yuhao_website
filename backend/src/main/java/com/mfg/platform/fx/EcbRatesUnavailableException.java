package com.mfg.platform.fx;

/** 没拿到 ECB 的文件：网络不通、超时、非 200、内容过大。和「拿到了但格式不对」分开，日志里好区分。 */
class EcbRatesUnavailableException extends RuntimeException {

    EcbRatesUnavailableException(String message) {
        super(message);
    }

    EcbRatesUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
