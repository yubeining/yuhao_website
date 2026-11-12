package com.mfg.platform.storage;

import com.mfg.common.exception.BusinessException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * 只给 {@code app.storage.provider=memory} 用的「签名 URL」落点。
 *
 * <h3>为什么需要它</h3>
 * <p>真实的 S3 由对象存储自己接预签名 PUT/GET，应用不用碰字节。内存实现没有这个外部服务，
 * 早期就返回一个 {@code memory:///…} 的假 URL —— 浏览器发不出去（还会被 CSP 拦），
 * 于是本地开发「上传失败、下载打不开」，而主流程要求零件必须有图纸，
 * 结果本地走不完一条订单。
 *
 * <p>这个控制器把那条链路补上：{@link MemoryStorageService} 签发<b>同源一次性</b> URL，
 * 这里接住 PUT / GET，转手交给内存仓。**字节只在本进程内存里**，不落盘、不跨实例。
 *
 * <h3>为什么这几条路径在 SecurityConfig 里 permitAll</h3>
 * <p>预签名 URL 的性质就是「拿到链接即可访问，不带登录态」—— 下载是 {@code window.location.assign}，
 * 压根没有 Authorization 头。鉴权靠 URL 里那张随机、一次性、带过期的凭证。
 * 而且这个控制器<b>只在 memory 模式下才注册</b>（{@link ConditionalOnProperty}），
 * 生产用 s3 时这些路径是 404。
 */
@RestController
@ConditionalOnProperty(name = "app.storage.provider", havingValue = "memory")
class DevStorageController {

    private final MemoryStorageService memory;

    DevStorageController(MemoryStorageService memory) {
        this.memory = memory;
    }

    /** 一次性上传：消耗凭证 → 写入内存仓。 */
    @PutMapping("/dev/storage/{token}")
    ResponseEntity<Void> put(@PathVariable String token,
                             @RequestBody byte[] body,
                             @RequestHeader(value = HttpHeaders.CONTENT_TYPE, required = false) String contentType) {
        MemoryStorageService.Slot slot = memory.consume(token, "put")
                .orElseThrow(() -> new BusinessException(400, "storage.upload_token_invalid"));
        memory.put(slot.key(), new java.io.ByteArrayInputStream(body), body.length,
                contentType == null ? MediaType.APPLICATION_OCTET_STREAM_VALUE : contentType);
        return ResponseEntity.ok().build();
    }

    /** 一次性下载：消耗凭证 → 回吐字节。带 filename 时按附件下载（和 S3 的签名行为一致）。 */
    @GetMapping("/dev/storage/{token}")
    ResponseEntity<byte[]> get(@PathVariable String token) {
        MemoryStorageService.Slot slot = memory.consume(token, "get")
                .orElseThrow(() -> new BusinessException(400, "storage.download_token_invalid"));
        MemoryStorageService.Entry entry = memory.entry(slot.key());
        if (entry == null) {
            throw new BusinessException(404, "storage.object_not_found");
        }
        ResponseEntity.BodyBuilder builder = ResponseEntity.ok()
                .contentType(entry.contentType() == null
                        ? MediaType.APPLICATION_OCTET_STREAM
                        : MediaType.parseMediaType(entry.contentType()));
        if (slot.filename() != null) {
            builder.header(HttpHeaders.CONTENT_DISPOSITION,
                    "attachment; filename=\"" + slot.filename().replace("\"", "") + "\"");
        }
        return builder.body(entry.data());
    }
}
