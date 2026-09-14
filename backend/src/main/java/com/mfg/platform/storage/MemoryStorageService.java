package com.mfg.platform.storage;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * {@link StorageService} 的内存实现 —— 本地开发（{@code app.storage.provider=memory}）
 * 和测试用，不打真实对象存储。进程重启即清空。
 *
 * <p><b>签名 URL 是假的。</b>{@code presignedGet/Put} 返回一个
 * {@code memory://…} 形状的 URI，只为让上层流程能跑通，浏览器点它下不到东西。
 * 需要真实下载 / 直传的测试走 S3 实现（{@code *IT} + 真桶）。
 */
public class MemoryStorageService implements StorageService {

    private record Entry(byte[] data, String contentType, String etag) {
    }

    private final ConcurrentHashMap<String, Entry> store = new ConcurrentHashMap<>();

    @Override
    public void put(String key, InputStream data, long contentLength, String contentType) {
        try {
            byte[] bytes = data.readAllBytes();
            store.put(key, new Entry(bytes, contentType, md5Hex(bytes)));
        } catch (Exception e) {
            throw new StorageException("put failed for key " + key, e);
        }
    }

    @Override
    public InputStream get(String key) {
        Entry e = store.get(key);
        if (e == null) {
            throw new StorageException("object not found: " + key, null);
        }
        return new ByteArrayInputStream(e.data());
    }

    @Override
    public byte[] readRange(String key, long offset, int length) {
        Entry e = store.get(key);
        if (e == null) {
            throw new StorageException("object not found: " + key, null);
        }
        byte[] data = e.data();
        if (offset >= data.length || length <= 0) {
            return new byte[0];
        }
        int from = (int) offset;
        int to = (int) Math.min((long) data.length, offset + length);
        return java.util.Arrays.copyOfRange(data, from, to);
    }

    @Override
    public boolean exists(String key) {
        return store.containsKey(key);
    }

    @Override
    public void delete(String key) {
        store.remove(key);
    }

    @Override
    public Optional<StorageObjectMeta> head(String key) {
        Entry e = store.get(key);
        return e == null
                ? Optional.empty()
                : Optional.of(new StorageObjectMeta(e.data().length, e.contentType(), e.etag()));
    }

    @Override
    public URI presignedGet(String key, Duration ttl) {
        return fakeUrl("get", key, ttl);
    }

    @Override
    public URI presignedGet(String key, Duration ttl, String downloadFilename) {
        return fakeUrl("get", key, ttl);
    }

    @Override
    public URI presignedPut(String key, Duration ttl, String contentType) {
        return fakeUrl("put", key, ttl);
    }

    @Override
    public String provider() {
        return "memory";
    }

    private static URI fakeUrl(String op, String key, Duration ttl) {
        return URI.create("memory:///" + op + "/" + key + "?ttl=" + ttl.toSeconds());
    }

    private static String md5Hex(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("MD5").digest(bytes));
        } catch (Exception e) {
            // 内存实现里 etag 只是给测试比对用，算不出就给个稳定占位
            return HexFormat.of().formatHex(
                    Integer.toString(java.util.Arrays.hashCode(bytes)).getBytes(StandardCharsets.UTF_8));
        }
    }
}
