package com.mfg.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.AsyncConfigurer;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

import java.util.Arrays;
import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

/**
 * 全应用统一的线程池。
 *
 * <h3>为什么要统一</h3>
 * <p>不配的话，{@code @Async} 会落到 Spring 默认的 {@code SimpleAsyncTaskExecutor} ——
 * 它<b>每个任务开一个新线程、无上限、不复用</b>，突发流量下直接把内存耗光。
 * 定时任务的默认 scheduler 又是<b>单线程</b>，一个慢 job 会把其余全堵住。
 * 这里各给一个有界、命名、可优雅关闭的池，从源头堵掉这两类问题。
 *
 * <h3>两个池，各管各的</h3>
 * <ul>
 *   <li>{@code appTaskExecutor} —— 一切 {@code @Async} 和事务提交后的副作用
 *       （{@code AfterCommitExecutor}）。有界队列 + CallerRuns：队列满了就让提交任务的线程
 *       自己跑，形成背压，而不是把任务默默丢掉（AbortPolicy）或无限堆积（内存爆）。</li>
 *   <li>{@code taskScheduler} —— {@code @Scheduled}。小池即可，因为每个 job 本来就
 *       按条目加 Redis 锁（CLAUDE.md §8），并发靠锁而不是靠线程数。</li>
 * </ul>
 *
 * <h3>优雅关闭</h3>
 * <p>两个池都等在途任务跑完（上限 {@code await-termination-seconds}），
 * 和 {@code server.shutdown: graceful} 对齐 —— 否则滚动发布时正在发的通知会被硬砍。
 */
@Configuration
@EnableAsync
public class AsyncConfig implements AsyncConfigurer {

    private static final Logger log = LoggerFactory.getLogger(AsyncConfig.class);

    public static final String APP_EXECUTOR = "appTaskExecutor";

    /**
     * ★ 通知这类"慢的外部 I/O"（发邮件 / 微信）用独立池，和通用池隔离 ——
     * 外部服务变慢时只堵住自己的池，不会把通用异步任务一起拖垮（爆炸半径隔离）。
     * 别的子系统要独立池就照这个再加一个 bean（每子系统一个池，WeAct/webox 都是这么做的）。
     */
    public static final String NOTIFICATION_EXECUTOR = "notificationExecutor";

    private final int corePoolSize;
    private final int maxPoolSize;
    private final int queueCapacity;
    private final int awaitTerminationSeconds;
    private final int schedulerPoolSize;
    private final int notifCore;
    private final int notifMax;
    private final int notifQueue;

    public AsyncConfig(AppProperties props) {
        AppProperties.Async async = props.async();
        AppProperties.Async.Notification notif = async.notification();
        this.corePoolSize = async.corePoolSize();
        this.maxPoolSize = async.maxPoolSize();
        this.queueCapacity = async.queueCapacity();
        this.awaitTerminationSeconds = async.awaitTerminationSeconds();
        this.schedulerPoolSize = props.scheduler().poolSize();
        this.notifCore = notif.corePoolSize();
        this.notifMax = notif.maxPoolSize();
        this.notifQueue = notif.queueCapacity();
    }

    /**
     * 通用异步池。{@code @Async}（无限定名时）和 {@code AfterCommitExecutor} 都用它。
     */
    @Bean(name = APP_EXECUTOR)
    public ThreadPoolTaskExecutor appTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(corePoolSize);
        executor.setMaxPoolSize(maxPoolSize);
        executor.setQueueCapacity(queueCapacity);
        executor.setThreadNamePrefix("mfg-async-");
        // 背压：队列满 → 提交线程自己执行，不丢任务、不无限堆积
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(awaitTerminationSeconds);
        executor.initialize();
        return executor;
    }

    /** 通知专用池（慢的外部发信隔离，见 NOTIFICATION_EXECUTOR 注释）。 */
    @Bean(name = NOTIFICATION_EXECUTOR)
    public ThreadPoolTaskExecutor notificationExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(notifCore);
        executor.setMaxPoolSize(notifMax);
        executor.setQueueCapacity(notifQueue);
        executor.setThreadNamePrefix("mfg-notify-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(awaitTerminationSeconds);
        executor.initialize();
        return executor;
    }

    /**
     * {@code @Scheduled} 用的调度池。给这个 bean 就替换掉了 Spring 默认的单线程调度器。
     */
    @Bean
    public ThreadPoolTaskScheduler taskScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(schedulerPoolSize);
        scheduler.setThreadNamePrefix("mfg-sched-");
        scheduler.setWaitForTasksToCompleteOnShutdown(true);
        scheduler.setAwaitTerminationSeconds(awaitTerminationSeconds);
        scheduler.initialize();
        return scheduler;
    }

    /** {@code @Async} 的默认执行器 = 上面的通用池。 */
    @Override
    public Executor getAsyncExecutor() {
        return appTaskExecutor();
    }

    /**
     * {@code @Async} 且返回 void 的方法抛异常时没人接 —— 默认 Spring 只打个 error。
     * 这里显式记下方法名和参数个数（不记参数值，可能含敏感数据，同 CLAUDE.md §7）。
     */
    @Override
    public org.springframework.aop.interceptor.AsyncUncaughtExceptionHandler
            getAsyncUncaughtExceptionHandler() {
        return (ex, method, params) ->
                log.error("uncaught exception in @Async {}#{} ({} args)",
                        method.getDeclaringClass().getSimpleName(), method.getName(),
                        params == null ? 0 : Arrays.asList(params).size(), ex);
    }
}
