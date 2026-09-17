package com.mfg.platform.fx;

import com.mfg.config.AppProperties;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * 从 ECB 拉每日参考汇率 XML 并解析。
 *
 * <p>这是本项目第一个出站 HTTP 调用，用 JDK 自带 {@link HttpClient}，不引新依赖。
 * 连接和整次请求都有超时（走配置），响应体设上限 —— 外网内容，不信任它的大小。
 * 地址走配置（CLAUDE.md C3），测试里指向本地假 ECB。
 */
@Component
class EcbRatesClient {

    /** ECB 每日文件约 1.5KB；远超这个数说明拿到的不是它。 */
    private static final int MAX_BODY_BYTES = 1_000_000;

    private final HttpClient http;
    private final URI url;
    private final Duration requestTimeout;

    @Autowired
    EcbRatesClient(AppProperties properties) {
        this(properties.fx());
    }

    EcbRatesClient(AppProperties.Fx fx) {
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(fx.connectTimeoutSeconds()))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
        this.url = URI.create(fx.ecbDailyUrl());
        this.requestTimeout = Duration.ofSeconds(fx.requestTimeoutSeconds());
    }

    EcbDailyRates fetchDaily() {
        HttpRequest request = HttpRequest.newBuilder(url)
                .timeout(requestTimeout)
                .header("Accept", "application/xml, text/xml")
                .GET()
                .build();
        try {
            HttpResponse<InputStream> response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream body = response.body()) {
                if (response.statusCode() != 200) {
                    throw new EcbRatesUnavailableException("ECB responded HTTP " + response.statusCode());
                }
                byte[] bytes = body.readNBytes(MAX_BODY_BYTES + 1);
                if (bytes.length > MAX_BODY_BYTES) {
                    throw new EcbRatesUnavailableException("ECB response larger than " + MAX_BODY_BYTES + " bytes");
                }
                return EcbDailyRatesParser.parse(bytes);
            }
        } catch (IOException e) {
            throw new EcbRatesUnavailableException("ECB request failed: " + e.getClass().getSimpleName(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new EcbRatesUnavailableException("ECB request interrupted", e);
        }
    }

    @PreDestroy
    void close() {
        http.close();
    }
}
