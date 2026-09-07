package com.mfg.platform.storage;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * S3 实现对着<b>真实对象存储</b>的往返测试 —— 这是 §9 要求 *IT 打真依赖的那一类
 * （只不过这里的"真依赖"是对象存储，不是 PG/Redis）。
 *
 * <p><b>只在提供了凭据时才跑</b>：环境变量 {@code S3_IT_ACCESS_KEY} 存在才启用，
 * 否则 JUnit 直接跳过。CI 不配这些就跳过，本地想验真桶时按下面这样跑：
 * <pre>
 *   S3_IT_ENDPOINT=https://objectstorageapi.bja.sealos.run \
 *   S3_IT_BUCKET=aprx7mvw-yuhao-oss \
 *   S3_IT_ACCESS_KEY=xxx S3_IT_SECRET_KEY=yyy \
 *   mvn -Dit.test=S3StorageServiceIT failsafe:integration-test
 * </pre>
 *
 * <p>★ 凭据只从环境读，绝不写进代码（提交闸门会拦，也是常识）。
 * ★ 本机只能到<b>外网</b> endpoint，所以 client 和 presigner 都用同一个外网地址；
 *   线上是 client 走内网、presigner 走外网，那条路径由部署配置覆盖，不在本测试内。
 */
@EnabledIfEnvironmentVariable(named = "S3_IT_ACCESS_KEY", matches = ".+")
class S3StorageServiceIT {

    private static final String ENDPOINT =
            envOr("S3_IT_ENDPOINT", "https://objectstorageapi.bja.sealos.run");
    private static final String BUCKET = envOr("S3_IT_BUCKET", "aprx7mvw-yuhao-oss");
    private static final String REGION = envOr("S3_IT_REGION", "us-east-1");

    private final S3Client client = buildClient();
    private final S3Presigner presigner = buildPresigner();
    private final StorageService storage = new S3StorageService(client, presigner, BUCKET);

    // 每个用例一个唯一 key，测完删掉，不污染真桶
    private final String key = "it/" + UUID.randomUUID() + ".txt";

    @AfterEach
    void cleanup() {
        try {
            storage.delete(key);
        } finally {
            client.close();
            presigner.close();
        }
    }

    @Test
    void putGetHeadDeleteRoundTrip() throws Exception {
        byte[] body = ("mfg S3 IT " + UUID.randomUUID()).getBytes(StandardCharsets.UTF_8);

        storage.put(key, new ByteArrayInputStream(body), body.length, "text/plain");
        assertThat(storage.exists(key)).isTrue();

        assertThat(storage.head(key)).hasValueSatisfying(m -> {
            assertThat(m.sizeBytes()).isEqualTo(body.length);
            assertThat(m.contentType()).isEqualTo("text/plain");
        });

        try (var in = storage.get(key)) {
            assertThat(in.readAllBytes()).isEqualTo(body);
        }

        storage.delete(key);
        assertThat(storage.exists(key)).isFalse();
        assertThat(storage.head(key)).isEmpty();
    }

    @Test
    void presignedGetIsDownloadableByAnHttpClient() throws Exception {
        byte[] body = "downloadable via presigned url".getBytes(StandardCharsets.UTF_8);
        storage.put(key, new ByteArrayInputStream(body), body.length, "text/plain");

        URI url = storage.presignedGet(key, Duration.ofSeconds(60));

        // 不带任何凭据，纯 GET 这个签名 URL —— 模拟浏览器
        HttpResponse<byte[]> res = HttpClient.newHttpClient()
                .send(HttpRequest.newBuilder(url).GET().build(), HttpResponse.BodyHandlers.ofByteArray());

        assertThat(res.statusCode()).isEqualTo(200);
        assertThat(res.body()).isEqualTo(body);
    }

    private static S3Client buildClient() {
        return S3Client.builder()
                .endpointOverride(URI.create(ENDPOINT))
                .region(Region.of(REGION))
                .credentialsProvider(creds())
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .build();
    }

    private static S3Presigner buildPresigner() {
        return S3Presigner.builder()
                .endpointOverride(URI.create(ENDPOINT))
                .region(Region.of(REGION))
                .credentialsProvider(creds())
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .build();
    }

    private static StaticCredentialsProvider creds() {
        return StaticCredentialsProvider.create(AwsBasicCredentials.create(
                System.getenv("S3_IT_ACCESS_KEY"), System.getenv("S3_IT_SECRET_KEY")));
    }

    private static String envOr(String name, String fallback) {
        String v = System.getenv(name);
        return v == null || v.isBlank() ? fallback : v;
    }
}
