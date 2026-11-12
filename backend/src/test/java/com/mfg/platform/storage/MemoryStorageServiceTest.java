package com.mfg.platform.storage;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 内存实现的单测 —— 钉住 {@link StorageService} 的行为契约，不碰网络。
 * S3 实现的真实往返由 {@code S3StorageServiceIT} 对着真桶验。
 */
class MemoryStorageServiceTest {

    private final MemoryStorageService storage = new MemoryStorageService("/api/v1");

    @Test
    void putThenGetRoundTrips() throws Exception {
        put("a/b.txt", "hello", "text/plain");

        try (var in = storage.get("a/b.txt")) {
            assertThat(new String(in.readAllBytes(), StandardCharsets.UTF_8)).isEqualTo("hello");
        }
        assertThat(storage.exists("a/b.txt")).isTrue();
    }

    @Test
    void headReturnsMetaAndEmptyForMissing() {
        put("a/b.txt", "hello", "text/plain");

        assertThat(storage.head("a/b.txt")).hasValueSatisfying(m -> {
            assertThat(m.sizeBytes()).isEqualTo(5);
            assertThat(m.contentType()).isEqualTo("text/plain");
            assertThat(m.etag()).isNotBlank();
        });
        assertThat(storage.head("missing")).isEmpty();
    }

    @Test
    void getMissingThrows() {
        assertThatThrownBy(() -> storage.get("missing")).isInstanceOf(StorageException.class);
    }

    @Test
    void deleteIsIdempotent() {
        put("a/b.txt", "hello", "text/plain");
        storage.delete("a/b.txt");
        assertThat(storage.exists("a/b.txt")).isFalse();
        storage.delete("a/b.txt"); // 再删不报错
    }

    /** 读文件头判类型只需要开头几 KB —— 不许为此把几百 MB 的对象整个读一遍。 */
    @Test
    void readRangeReturnsOnlyTheRequestedBytes() {
        put("a/b.txt", "hello world", "text/plain");

        assertThat(new String(storage.readRange("a/b.txt", 0, 5), StandardCharsets.UTF_8)).isEqualTo("hello");
        assertThat(new String(storage.readRange("a/b.txt", 6, 100), StandardCharsets.UTF_8)).isEqualTo("world");
        assertThat(storage.readRange("a/b.txt", 50, 10)).isEmpty();
    }

    @Test
    void readRangeOfMissingObjectThrows() {
        assertThatThrownBy(() -> storage.readRange("missing", 0, 10)).isInstanceOf(StorageException.class);
    }

    @Test
    void providerIsMemory() {
        assertThat(storage.provider()).isEqualTo("memory");
    }

    private void put(String key, String body, String contentType) {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        storage.put(key, new ByteArrayInputStream(bytes), bytes.length, contentType);
    }

    // ---------- 签名 URL（本地内存实现的真实可用性）----------

    @Test
    void presignedPutReturnsSameOriginOneTimeUrl() {
        var url = storage.presignedPut("drawing/x.pdf", java.time.Duration.ofMinutes(15), "application/pdf");

        // ★ 不能再是 memory:/// —— 浏览器发不出去，本地就永远传不了图纸（2026-11-12 修）
        assertThat(url.getScheme()).isNull();
        assertThat(url.getPath()).startsWith("/api/v1/dev/storage/");

        String token = url.getPath().substring("/api/v1/dev/storage/".length());
        assertThat(storage.consume(token, "put")).isPresent();
        // 一次性：同一个 token 用第二次就没了
        assertThat(storage.consume(token, "put")).isEmpty();
    }

    @Test
    void presignedGetTokenIsOperationScoped() {
        var url = storage.presignedGet("drawing/x.pdf", java.time.Duration.ofMinutes(15));
        String token = url.getPath().substring("/api/v1/dev/storage/".length());

        // 拿下载凭证去当上传凭证用 —— 必须拒绝，否则等于给了个任意写入口
        assertThat(storage.consume(token, "put")).isEmpty();
    }
}
