package com.mfg;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 应用入口。
 *
 * <p>{@code @EnableScheduling} 打开定时任务支持（报价过期扫描、汇率同步等）。
 * <b>每个 {@code @Scheduled} 必须按条目加 Redis 锁</b> —— 见 CLAUDE.md §9，
 * 用 {@code RedisService.tryLock/releaseLock}。多 pod 部署下没有锁就是重复执行。
 */
@SpringBootApplication
@EnableScheduling
public class MfgApplication {

    public static void main(String[] args) {
        SpringApplication.run(MfgApplication.class, args);
    }
}
