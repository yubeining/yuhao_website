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

    private final StorageService storage = new MemoryStorageService();

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

    @Test
    void providerIsMemory() {
        assertThat(storage.provider()).isEqualTo("memory");
    }

    private void put(String key, String body, String contentType) {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        storage.put(key, new ByteArrayInputStream(bytes), bytes.length, contentType);
    }
}
