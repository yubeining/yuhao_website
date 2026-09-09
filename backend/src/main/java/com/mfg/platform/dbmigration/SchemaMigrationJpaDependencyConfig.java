package com.mfg.platform.dbmigration;

import org.springframework.boot.jpa.autoconfigure.EntityManagerFactoryDependsOnPostProcessor;
import org.springframework.context.annotation.Configuration;

/**
 * 让 EntityManagerFactory 依赖 {@link SchemaMigrationRunner}，
 * 保证<b>迁移先跑完，JPA 再初始化</b>。
 *
 * <h3>为什么这个 5 行的类是必需的</h3>
 *
 * <p>{@code SchemaMigrationRunner} 在构造函数里跑迁移，但 Spring 的 bean 创建顺序
 * 只由依赖关系决定 —— 它和 {@code entityManagerFactory} 之间没有任何依赖关系，
 * 谁先谁后<b>取决于 classpath 扫描顺序，是不确定的</b>。
 *
 * <p>一旦 JPA 先初始化：{@code ddl-auto: validate} 会在空库上找不到表而启动失败。
 * 更坏的情况是它<b>偶尔</b>成功（顺序恰好对了），于是本地一直好好的，
 * 换台机器或升个版本就起不来，而且报错信息（"missing table xxx"）
 * 指向的是表结构问题，跟真正的原因（初始化顺序）毫无关系。
 *
 * <p>Spring Boot 自己给 Flyway 和 Liquibase 用的就是这个机制
 * （{@code FlywayInitializerJpaDependencyConfiguration}），照抄即可。
 */
@Configuration(proxyBeanMethods = false)
public class SchemaMigrationJpaDependencyConfig extends EntityManagerFactoryDependsOnPostProcessor {

    public SchemaMigrationJpaDependencyConfig() {
        super(SchemaMigrationRunner.class);
    }
}
