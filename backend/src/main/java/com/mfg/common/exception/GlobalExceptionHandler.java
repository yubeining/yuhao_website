package com.mfg.common.exception;

import com.mfg.common.dto.ApiResponse;
import jakarta.persistence.EntityNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * 全局异常处理。所有异常在这里统一翻译成 {@link ApiResponse}。
 *
 * <p><b>两条纪律</b>
 * <ol>
 *   <li>返回给客户端的 {@code message} 永远是 i18n code，不是文案，
 *       更不是异常的 {@code getMessage()} —— 那里可能带 SQL 片段、内部路径、字段值。</li>
 *   <li>详细信息只进日志，且日志里不许出现姓名 / 邮箱 / 价格 / token / 图纸 URL
 *       （见 CLAUDE.md §7）。</li>
 * </ol>
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Object>> handleBusiness(BusinessException e) {
        // 业务异常是预期内的，用 warn 而不是 error，别污染告警
        log.warn("business exception: code={} messageCode={}", e.getCode(), e.getMessageCode());
        return ResponseEntity.status(e.getCode())
                .body(ApiResponse.error(e.getCode(), e.getMessageCode(), e.getData()));
    }

    @ExceptionHandler(EntityNotFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNotFound(EntityNotFoundException e) {
        log.warn("entity not found: {}", e.getMessage());
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error(404, "common.not_found"));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleAccessDenied(AccessDeniedException e) {
        // 不回显被拒的资源标识 —— 那本身就是信息泄露
        log.warn("access denied");
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiResponse.error(403, "common.forbidden"));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException e) {
        // 只回字段名，不回字段值 —— 值可能是密码或客户信息
        String field = e.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(err -> err.getField())
                .orElse("unknown");
        log.warn("validation failed on field: {}", field);
        return ResponseEntity.badRequest()
                .body(ApiResponse.error(400, "common.validation_failed." + field));
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingParam(
            MissingServletRequestParameterException e) {
        return ResponseEntity.badRequest()
                .body(ApiResponse.error(400, "common.missing_param." + e.getParameterName()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Void>> handleUnreadableBody(HttpMessageNotReadableException e) {
        // 绝不回显解析错误详情 —— 它会带上请求体内容
        log.warn("unreadable request body");
        return ResponseEntity.badRequest()
                .body(ApiResponse.error(400, "common.malformed_body"));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiResponse<Void>> handleUploadTooLarge(MaxUploadSizeExceededException e) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(ApiResponse.error(413, "file.too_large"));
    }

    /**
     * ★ 路径没有任何 handler。<b>必须显式处理，否则会被下面的兜底当成 500。</b>
     *
     * <p>Spring 6 把「没有匹配的静态资源」表达成 {@code NoResourceFoundException}，
     * 它是个普通的 RuntimeException —— 不写这个方法，所有拼错的 URL
     * 都会返回 500 并在日志里打一整条栈。后果是双重的：
     * 前端看到 500 会以为是后端崩了（实际只是路径写错），
     * 而真正的 500 被淹没在一堆假 500 里，告警彻底失效。
     *
     * <p>用 warn 而不是 error，且不打栈 —— 这是客户端的问题，不是服务端故障。
     */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNoResource(NoResourceFoundException e) {
        log.warn("no handler for path: {}", e.getResourcePath());
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error(404, "common.not_found"));
    }

    /**
     * 乐观锁冲突 = 两个请求并发改了同一行，后到的那个没改成。这是并发的正常结果，不是服务端故障：
     * 回 409 让客户端重新读一遍再决定，别落到兜底变成 500 + error 级全栈日志。
     * （Spring 的 {@code ObjectOptimisticLockingFailureException} 是它的子类，一并覆盖。）
     */
    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<ApiResponse<Void>> handleOptimisticLock(OptimisticLockingFailureException e) {
        log.warn("optimistic lock conflict: {}", e.getClass().getSimpleName());
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ApiResponse.error(409, "common.conflict"));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiResponse<Void>> handleIllegalArgument(IllegalArgumentException e) {
        log.warn("illegal argument: {}", e.getMessage());
        return ResponseEntity.badRequest()
                .body(ApiResponse.error(400, "common.bad_request"));
    }

    /**
     * 兜底。这里到了就是 bug —— 用 error 级别，打全栈，但只给客户端一个通用 code。
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnexpected(Exception e) {
        log.error("unhandled exception", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error(500, "common.internal_error"));
    }
}
