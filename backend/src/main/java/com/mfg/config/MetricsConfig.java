package com.mfg.config;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import io.micrometer.core.instrument.config.MeterFilter;
import org.springframework.boot.actuate.autoconfigure.metrics.MeterRegistryCustomizer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 指标公共标签 —— 给每条指标打上 {@code application} 和 {@code environment}，
 * Prometheus / Grafana 里多实例、多环境能一眼分开。
 *
 * <p>用 {@link MeterFilter#commonTags}（而不是配置项）是刻意的：它保证标签在任何
 * 指标注册之前就挂上，避免"早注册的指标丢标签"这类顺序坑。
 */
@Configuration
public class MetricsConfig {

    @Bean
    MeterRegistryCustomizer<MeterRegistry> commonTags(
            @Value("${spring.application.name:mfg-backend}") String application,
            @Value("${APP_ENVIRONMENT:local}") String environment) {
        return registry -> registry.config().meterFilter(
                MeterFilter.commonTags(Tags.of("application", application, "environment", environment)));
    }
}
