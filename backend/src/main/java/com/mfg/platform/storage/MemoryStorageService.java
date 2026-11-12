package com.mfg.platform.storage;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * {@link StorageService} 的内存实现 —— 本地开发（{@code app.storage.provider=memory}）
 * 和测试用，不打真实对象存储。进程重启即清空。
 *
 * <h3>签名 URL 现在是真的能用的</h3>
 * <p>早期版本返回 {@code memory:///put/...} 这种假 URI：浏览器发不出去（还会被 CSP 拦），
 * 于是「本地用 memory 存储」等于「上传和下载都走不通」—— 而主流程提交订单要求每个零件
 * 都有图纸，结果本地根本走不完一条单。
 *
 * <p>现在改成返回<b>同源</b>的一次性 URL（{@code /api/v1/dev/storage/{token}}），
 * 由 {@link DevStorageController} 接住（只在 memory 模式下注册）。token 随机、一次性、
 * 带过期时间，服务端只认自己发出去的。
 *
 * <p>★ 这仍然只是本地/测试设施：字节留在本进程内存里，不落盘、不跨实例。
 */
public class MemoryStorageService implements StorageService {

    record Entry(byte[] data, String contentType, String etag) {
    }

    /** 一张已签发的一次性上传/下载凭证。 */
    record Slot(String key, String op, String filename, Instant expiresAt) {
    }

    private final ConcurrentHashMap<String, Entry> store = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Slot> tokens = new ConcurrentHashMap<>();
    private final String apiPrefix;

    public MemoryStorageService(String apiPrefix) {
        this.apiPrefix = apiPrefix == null ? "" : apiPrefix;
    }

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
        return signedUrl("get", key, ttl, null);
    }

    @Override
    public URI presignedGet(String key, Duration ttl, String downloadFilename) {
        return signedUrl("get", key, ttl, downloadFilename);
    }

    @Override
    public URI presignedPut(String key, Duration ttl, String contentType) {
        return signedUrl("put", key, ttl, null);
    }

    @Override
    public String provider() {
        return "memory";
    }

    // ---------- 给 DevStorageController 用 ----------

    /** 校验并消耗一张凭证。过期、不存在、操作类型不对 → empty（不区分原因，别给探测空间）。 */
    Optional<Slot> consume(String token, String op) {
        Slot slot = tokens.remove(token);
        if (slot == null || !slot.op().equals(op) || slot.expiresAt().isBefore(Instant.now())) {
            return Optional.empty();
        }
        return Optional.of(slot);
    }

    Entry entry(String key) {
        return store.get(key);
    }

    private URI signedUrl(String op, String key, Duration ttl, String filename) {
        String token = UUID.randomUUID().toString().replace("-", "");
        tokens.put(token, new Slot(key, op, filename, Instant.now().plus(ttl)));
        return URI.create(apiPrefix + "/dev/storage/" + token);
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
