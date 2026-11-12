package com.mfg.config;

import com.mfg.platform.storage.MemoryStorageService;
import com.mfg.platform.storage.S3StorageService;
import com.mfg.platform.storage.StorageService;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

import java.net.URI;

/**
 * 对象存储的装配 —— 按 {@code app.storage.provider} 选实现，把 AWS SDK 的构造细节收在这里。
 *
 * <h3>★ 两个端点，不是笔误</h3>
 * <p>Sealos OSS 有内网和外网两个地址：
 * <ul>
 *   <li><b>内网</b>（{@code app.storage.s3.endpoint}）给 {@link S3Client} ——
 *       服务端自己 put/get/head 走内网，不出集群、不计公网流量。</li>
 *   <li><b>外网</b>（{@code app.storage.s3.public-endpoint}）给 {@link S3Presigner} ——
 *       签名 URL 是发给<b>欧洲客户的浏览器</b>点的，必须指向公网地址；
 *       用内网地址签出来的 URL，客户根本解析不了那个域名。</li>
 * </ul>
 * 签名对 host 敏感，所以 presigner 必须用客户实际会访问的那个 host 来签。
 * {@code public-endpoint} 不填时回落到 {@code endpoint}（本地开发两者本就同一个外网地址）。
 *
 * <p>provider 只认 {@code s3} / {@code memory}；配成别的（比如老的 {@code gcs}）会没有
 * StorageService bean，启动时注入失败 —— 这是刻意的，早炸早发现，别静默退化。
 */
@Configuration
public class StorageConfig {

    /** provider = s3：真实对象存储（Sealos OSS / 任意 S3 兼容）。 */
    @Configuration
    @ConditionalOnProperty(name = "app.storage.provider", havingValue = "s3")
    static class S3Provider {

        private final String endpoint;
        private final String publicEndpoint;
        private final String region;
        private final String bucket;
        private final String accessKey;
        private final String secretKey;
        private final boolean pathStyle;

        S3Provider(
                @Value("${app.storage.s3.endpoint:}") String endpoint,
                @Value("${app.storage.s3.public-endpoint:}") String publicEndpoint,
                @Value("${app.storage.s3.region:us-east-1}") String region,
                @Value("${app.storage.s3.bucket:}") String bucket,
                @Value("${app.storage.s3.access-key:}") String accessKey,
                @Value("${app.storage.s3.secret-key:}") String secretKey,
                @Value("${app.storage.s3.path-style:true}") boolean pathStyle) {
            if (endpoint.isBlank() || bucket.isBlank() || accessKey.isBlank() || secretKey.isBlank()) {
                throw new IllegalStateException(
                        "app.storage.provider=s3 but endpoint/bucket/access-key/secret-key are not all set. "
                        + "Set STORAGE_S3_ENDPOINT / STORAGE_S3_BUCKET / STORAGE_S3_ACCESS_KEY / "
                        + "STORAGE_S3_SECRET_KEY (see deploy/README.md), or use app.storage.provider=memory locally.");
            }
            this.endpoint = endpoint;
            this.publicEndpoint = publicEndpoint.isBlank() ? endpoint : publicEndpoint;
            // ★ 没配 public-endpoint 就会回落到内网 endpoint —— 而内网地址【浏览器永远访问不到】。
            //   后果全是静默的：签名 URL 客户点开是坏的，CSP 放行的也是个够不到的域名，
            //   表现为图裂 / 下载不了，而后端日志干干净净。所以这里必须喊一声。
            if (isClusterInternal(this.publicEndpoint)) {
                LoggerFactory.getLogger(S3Provider.class).warn(
                        "app.storage.s3.public-endpoint is not set, falling back to the cluster-internal "
                        + "endpoint '{}'. Presigned URLs handed to browsers will NOT be reachable. "
                        + "Set STORAGE_S3_PUBLIC_ENDPOINT to the external address.", this.publicEndpoint);
            }
            this.region = region;
            this.bucket = bucket;
            this.accessKey = accessKey;
            this.secretKey = secretKey;
            this.pathStyle = pathStyle;
        }

        private StaticCredentialsProvider credentials() {
            return StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey));
        }

        private S3Configuration serviceConfig() {
            // MinIO / Sealos 必须 path-style（endpoint/bucket/key），virtual-host 风格解析不了
            return S3Configuration.builder().pathStyleAccessEnabled(pathStyle).build();
        }

        /** 服务端操作走内网 endpoint。close() 由 Spring 在关闭时自动调（SdkAutoCloseable）。 */
        @Bean
        S3Client s3Client() {
            return S3Client.builder()
                    .endpointOverride(URI.create(endpoint))
                    .region(Region.of(region))
                    .credentialsProvider(credentials())
                    .serviceConfiguration(serviceConfig())
                    .build();
        }

        /** 签名 URL 走外网 public-endpoint —— 给浏览器用。 */
        @Bean
        S3Presigner s3Presigner() {
            return S3Presigner.builder()
                    .endpointOverride(URI.create(publicEndpoint))
                    .region(Region.of(region))
                    .credentialsProvider(credentials())
                    .serviceConfiguration(serviceConfig())
                    .build();
        }

        @Bean
        StorageService storageService(S3Client s3Client, S3Presigner s3Presigner) {
            return new S3StorageService(s3Client, s3Presigner, bucket);
        }
    }

    /** provider = memory：本地 / 测试，进程内，不打真实存储。 */
    @Configuration
    @ConditionalOnProperty(name = "app.storage.provider", havingValue = "memory")
    static class MemoryProvider {

        @Bean
        MemoryStorageService storageService(@Value("${app.api.prefix:}") String apiPrefix) {
            // 传前缀是因为签名 URL 要指向本应用的 /dev/storage/{token}（同源，浏览器才发得出去）
            return new MemoryStorageService(apiPrefix);
        }
    }

    /**
     * 这个地址是不是集群内网的 —— 内网地址浏览器永远访问不到。
     *
     * <p>用在两处：签名 URL 回落到内网时告警（本类），以及 CSP 不去放行一个够不到的域名
     * （{@code SecurityConfig}）。判据保守：只认明确的集群内后缀，不做别的猜测。
     */
    public static boolean isClusterInternal(String url) {
        if (url == null || url.isBlank()) {
            return false;
        }
        String host;
        try {
            host = java.net.URI.create(url.trim()).getHost();
        } catch (IllegalArgumentException e) {
            return false;
        }
        if (host == null) {
            return false;
        }
        return host.endsWith(".svc.cluster.local") || host.endsWith(".svc") || host.endsWith(".local");
    }
}
