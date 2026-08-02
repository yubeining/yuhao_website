package com.mfg.common.interceptor;

import com.mfg.common.dto.ApiResponse;
import org.springframework.core.MethodParameter;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

/**
 * 把 controller 的返回值自动包成 {@link ApiResponse}，业务代码直接 {@code return dto;} 即可。
 *
 * <p><b>跳过包装的情况</b>（每一条都有具体原因，不要凭感觉加）：
 * <ul>
 *   <li>已经是 {@code ApiResponse} —— 手动构造过了（如需要自定义 code 的场景）</li>
 *   <li>{@code byte[]} / {@code Resource} —— 二进制下载，包 JSON 会破坏内容</li>
 *   <li>{@code String} —— Spring 用 StringHttpMessageConverter 处理，
 *       包成对象后转换器会 ClassCastException</li>
 *   <li>非 JSON 的 content type</li>
 * </ul>
 *
 * <p>将来若接入必须返回裸 JSON 的第三方协议（如某些 webhook 回调），
 * 在这里加一个方法级注解判断，并在注释里写明是哪个协议要求的。
 */
@RestControllerAdvice(basePackages = "com.mfg")
public class ResponseWrapperAdvice implements ResponseBodyAdvice<Object> {

    @Override
    public boolean supports(MethodParameter returnType,
                            Class<? extends HttpMessageConverter<?>> converterType) {
        Class<?> type = returnType.getParameterType();
        if (ApiResponse.class.isAssignableFrom(type)) {
            return false;
        }
        if (byte[].class.isAssignableFrom(type)) {
            return false;
        }
        if (Resource.class.isAssignableFrom(type)) {
            return false;
        }
        // String 返回值走 StringHttpMessageConverter，包成 ApiResponse 会在写出时炸
        return !String.class.isAssignableFrom(type);
    }

    @Override
    public Object beforeBodyWrite(Object body,
                                  MethodParameter returnType,
                                  MediaType selectedContentType,
                                  Class<? extends HttpMessageConverter<?>> converterType,
                                  ServerHttpRequest request,
                                  ServerHttpResponse response) {
        if (!MediaType.APPLICATION_JSON.isCompatibleWith(selectedContentType)) {
            return body;
        }
        // ★ 必须按【实际 body 对象】再判一次，不能只信 supports() 里的静态返回类型。
        //
        //   supports() 拿到的是方法签名上的类型。GlobalExceptionHandler 的签名是
        //   ResponseEntity<ApiResponse<T>> —— 静态类型是 ResponseEntity，
        //   supports() 认不出里面已经是 ApiResponse 了，于是又包一层，
        //   客户端收到 {"code":200,"message":"ok","data":{"code":500,...}}：
        //   HTTP 状态是 500，envelope 里的 code 却是 200。
        //
        //   前端 http.ts 判的是 envelope.code，于是把一个 500 当成成功处理，
        //   拿着 data（其实是内层错误对象）继续往下走 —— 报错点离真实原因十万八千里。
        if (body instanceof ApiResponse<?>) {
            return body;
        }
        return ApiResponse.success(body);
    }
}
