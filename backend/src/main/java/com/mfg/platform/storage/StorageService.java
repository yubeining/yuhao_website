package com.mfg.platform.storage;

import java.io.InputStream;
import java.net.URI;
import java.time.Duration;
import java.util.Optional;

/**
 * 对象存储的统一入口 —— 业务代码只依赖这个接口，看不到底下是 S3 / MinIO / 内存。
 *
 * <h3>设计要点</h3>
 * <ul>
 *   <li><b>桶是配置，不是参数。</b>当前只有一个私有桶（Sealos OSS），桶名走
 *       {@code app.storage.s3.bucket}。方法只收 {@code key}（对象路径），
 *       调用方无从指定桶 —— 少一个能填错的地方。</li>
 *   <li><b>图纸一律私有。</b>没有"公开读"的方法；对外给文件永远走
 *       {@link #presignedGet}（短期签名 URL）。这是红线 1 的前提：每一次签发都能落审计。</li>
 *   <li><b>key 由调用方生成且不可猜。</b>建议 {@code <purpose>/<uuid>/<原名>}，
 *       绝不用客户可控的字符串直接拼 key（否则能越权取别人的对象）。</li>
 * </ul>
 *
 * <p><b>本接口不落审计、不做鉴权。</b>"谁能看这个 key" 是文件域的责任
 * （先校验 part_revision 归属，再调 {@link #presignedGet}，再落 file_access_log）——
 * 见 CLAUDE.md §3 铁律 6。这一层只负责"把字节存取好"。
 */
public interface StorageService {

    /**
     * 上传 / 覆盖一个对象。
     *
     * @param key           对象路径
     * @param data          内容流（本方法不负责关闭，由调用方 try-with-resources）
     * @param contentLength 字节数，必须准确 —— S3 靠它切分和校验
     * @param contentType   MIME 类型；null 时按 {@code application/octet-stream}
     */
    void put(String key, InputStream data, long contentLength, String contentType);

    /**
     * 取对象内容。调用方负责关闭返回的流。
     *
     * @throws StorageException 对象不存在或读取失败
     */
    InputStream get(String key);

    /** 对象是否存在。 */
    boolean exists(String key);

    /** 删除对象；对象本就不存在时静默返回（幂等）。 */
    void delete(String key);

    /** 元数据；对象不存在时返回空 {@link Optional}。 */
    Optional<StorageObjectMeta> head(String key);

    /**
     * 签发一个短期的下载 URL（GET）。
     *
     * @param ttl 有效期；调用方一般传 {@code app.storage.signed-url-ttl-seconds}
     */
    URI presignedGet(String key, Duration ttl);

    /**
     * 签发一个短期的上传 URL（PUT）—— 让浏览器直传，字节不经过后端。
     *
     * @param contentType 允许上传的类型；客户端 PUT 时的 Content-Type 必须与此一致
     */
    URI presignedPut(String key, Duration ttl, String contentType);

    /** 当前实现标识（{@code "s3"} / {@code "memory"}），仅用于诊断和健康检查。 */
    String provider();
}
