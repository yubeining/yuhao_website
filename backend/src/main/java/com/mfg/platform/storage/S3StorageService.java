package com.mfg.platform.storage;

import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

import java.io.InputStream;
import java.net.URI;
import java.time.Duration;
import java.util.Optional;

/**
 * {@link StorageService} 的 S3 实现（AWS SDK v2）—— 对接 Sealos OSS（MinIO，S3 兼容）。
 *
 * <p>装配、path-style、凭据这些都在 {@code StorageConfig} 里，本类只拿现成的
 * {@link S3Client} / {@link S3Presigner} 干活，不碰配置。
 *
 * <p><b>MinIO 必须 path-style</b>（{@code endpoint/bucket/key} 而非
 * {@code bucket.endpoint/key}）—— virtual-host 风格要求桶名是合法子域名且 DNS 能解析，
 * 自建 MinIO 没有。这一项在 {@code StorageConfig} 里开。
 */
public class S3StorageService implements StorageService {

    private static final String DEFAULT_CONTENT_TYPE = "application/octet-stream";

    private final S3Client s3;
    private final S3Presigner presigner;
    private final String bucket;

    public S3StorageService(S3Client s3, S3Presigner presigner, String bucket) {
        this.s3 = s3;
        this.presigner = presigner;
        this.bucket = bucket;
    }

    @Override
    public void put(String key, InputStream data, long contentLength, String contentType) {
        try {
            PutObjectRequest request = PutObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .contentType(contentType == null ? DEFAULT_CONTENT_TYPE : contentType)
                    .contentLength(contentLength)
                    .build();
            s3.putObject(request, RequestBody.fromInputStream(data, contentLength));
        } catch (SdkException e) {
            throw new StorageException("put failed for key " + key, e);
        }
    }

    @Override
    public InputStream get(String key) {
        try {
            return s3.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build());
        } catch (NoSuchKeyException e) {
            throw new StorageException("object not found: " + key, e);
        } catch (SdkException e) {
            throw new StorageException("get failed for key " + key, e);
        }
    }

    @Override
    public boolean exists(String key) {
        return head(key).isPresent();
    }

    @Override
    public void delete(String key) {
        try {
            s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
        } catch (SdkException e) {
            throw new StorageException("delete failed for key " + key, e);
        }
    }

    @Override
    public Optional<StorageObjectMeta> head(String key) {
        try {
            HeadObjectResponse r = s3.headObject(
                    HeadObjectRequest.builder().bucket(bucket).key(key).build());
            return Optional.of(new StorageObjectMeta(r.contentLength(), r.contentType(), unquote(r.eTag())));
        } catch (NoSuchKeyException e) {
            return Optional.empty();
        } catch (SdkException e) {
            // 有的 S3 实现对不存在的 key 返回 404 而不是 NoSuchKeyException
            if (isNotFound(e)) {
                return Optional.empty();
            }
            throw new StorageException("head failed for key " + key, e);
        }
    }

    @Override
    public URI presignedGet(String key, Duration ttl) {
        try {
            GetObjectPresignRequest presign = GetObjectPresignRequest.builder()
                    .signatureDuration(ttl)
                    .getObjectRequest(GetObjectRequest.builder().bucket(bucket).key(key).build())
                    .build();
            return presigner.presignGetObject(presign).url().toURI();
        } catch (Exception e) {
            throw new StorageException("presign get failed for key " + key, e);
        }
    }

    @Override
    public URI presignedPut(String key, Duration ttl, String contentType) {
        try {
            PutObjectRequest put = PutObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .contentType(contentType == null ? DEFAULT_CONTENT_TYPE : contentType)
                    .build();
            PutObjectPresignRequest presign = PutObjectPresignRequest.builder()
                    .signatureDuration(ttl)
                    .putObjectRequest(put)
                    .build();
            return presigner.presignPutObject(presign).url().toURI();
        } catch (Exception e) {
            throw new StorageException("presign put failed for key " + key, e);
        }
    }

    @Override
    public String provider() {
        return "s3";
    }

    private static boolean isNotFound(SdkException e) {
        return e instanceof software.amazon.awssdk.services.s3.model.S3Exception s3e
                && s3e.statusCode() == 404;
    }

    /** S3 的 ETag 带引号，去掉便于比对。 */
    private static String unquote(String etag) {
        if (etag == null) {
            return null;
        }
        return etag.replace("\"", "");
    }
}
