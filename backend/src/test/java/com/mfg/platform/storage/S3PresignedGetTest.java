package com.mfg.platform.storage;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 预签名是纯本地计算，不连网 —— 所以能用假地址、假凭据做单测。
 * 这里只钉「下载链接带上了原文件名」；链接在真桶上能不能用由 {@code S3StorageServiceIT} 验。
 */
class S3PresignedGetTest {

    @Test
    void presignedGetCarriesTheOriginalFilenameForTheBrowser() {
        try (S3Presigner presigner = S3Presigner.builder()
                .endpointOverride(URI.create("https://storage.example.test"))
                .region(Region.US_EAST_1)
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create("test-access-key", "test-secret-key")))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .build()) {
            StorageService storage = new S3StorageService(null, presigner, "bucket");

            URI url = storage.presignedGet("drawing/0b7c", Duration.ofMinutes(15), "bracket-A.step");

            String query = URLDecoder.decode(url.getRawQuery(), StandardCharsets.UTF_8);
            assertThat(query).contains(
                    "response-content-disposition=" + DownloadFilename.contentDisposition("bracket-A.step"));
            assertThat(url.getPath()).isEqualTo("/bucket/drawing/0b7c");
        }
    }
}
