package com.mfg.platform.storage;

/**
 * 一个存储对象的元数据（不含内容本身）。
 *
 * @param sizeBytes   字节数
 * @param contentType 存进去时记录的 MIME 类型
 * @param etag        对象指纹（S3 通常是 MD5；用于校验一致性），可能为 null
 */
public record StorageObjectMeta(long sizeBytes, String contentType, String etag) {
}
