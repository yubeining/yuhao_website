package com.mfg.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * 应用配置的 typed 收口 —— 把散落的 {@code @Value("${app.xxx}")} 归成一棵有类型、有默认、
 * 有注释的树。好处：改配置 IDE 有补全和类型检查；每个开关的"为什么/默认值"写在这里，不用满代码库找。
 *
 * <p>用 record + 构造器绑定 + {@link DefaultValue}：缺配置项时用默认，不会 null。
 * 默认值和 application.yml 保持一致（yml 里的 {@code ${ENV:默认}} 是运维覆盖入口，这里是代码兜底）。
 *
 * <p>本轮迁了 async / scheduler / auth 这几组（最典型的多参数场景）；jwt / storage / ai 等
 * 暂留原样，可后续逐步并进来。
 */
@ConfigurationProperties(prefix = "app")
public record AppProperties(
        @DefaultValue Async async,
        @DefaultValue Scheduler scheduler,
        @DefaultValue Auth auth,
        @DefaultValue Web web) {

    /** Web 层通用参数（分页等）。 */
    public record Web(@DefaultValue Page page) {

        /**
         * 分页封顶 —— 全局统一,不分受众/接口。size 上限防 {@code pageSize=1000000} 拖库。
         * 内外之分是 controller / 路径层的事(端级闸门),不进分页组件。
         */
        public record Page(
                @DefaultValue("20") int defaultSize,
                @DefaultValue("200") int maxSize) {
        }
    }

    /** 通用异步池 + 通知专用池（见 AsyncConfig）。 */
    public record Async(
            @DefaultValue("4") int corePoolSize,
            @DefaultValue("16") int maxPoolSize,
            @DefaultValue("500") int queueCapacity,
            @DefaultValue("20") int awaitTerminationSeconds,
            @DefaultValue Notification notification) {

        public record Notification(
                @DefaultValue("2") int corePoolSize,
                @DefaultValue("8") int maxPoolSize,
                @DefaultValue("500") int queueCapacity) {
        }
    }

    /** @Scheduled 调度池。 */
    public record Scheduler(@DefaultValue("2") int poolSize) {
    }

    public record Auth(@DefaultValue Login login) {

        /** 登录限流：同一(受众+账号)窗口内尝试上限。 */
        public record Login(
                @DefaultValue("10") int maxAttempts,
                @DefaultValue("300") int windowSeconds) {
        }
    }
}
