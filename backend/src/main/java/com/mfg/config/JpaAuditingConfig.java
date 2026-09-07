package com.mfg.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

/**
 * 打开 JPA Auditing，让 {@code @CreatedDate} / {@code @LastModifiedDate}（见 BaseEntity）
 * 在 insert / update 时自动填 {@code created_at} / {@code updated_at}。
 *
 * <p>单独一个类而不是挂在主应用上：审计依赖 JPA 上下文，放在 {@code config/} 下
 * 和其余 {@code @Configuration} 一起，测试里也能按需替换。
 *
 * <p>没有配 {@code AuditorAware} —— 我们不用 {@code @CreatedBy} / {@code @LastModifiedBy}。
 * "谁创建的"走审计事件（{@code AuditService}）和业务字段显式传入（CLAUDE.md §3 铁律 3），
 * 不靠框架从 SecurityContext 里偷。
 */
@Configuration
@EnableJpaAuditing
public class JpaAuditingConfig {
}
