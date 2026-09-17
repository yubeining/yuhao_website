package com.mfg.platform.fx;

import com.mfg.common.cache.CacheKeys;
import com.mfg.common.service.RedisService;
import com.mfg.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * 定时从 ECB 拉参考汇率入库。
 *
 * <p>按 CLAUDE.md §8：按条目加 Redis 锁（这里只有一个条目 —— ECB 这个数据源），比对 fence 才释放；
 * DB 唯一索引兜底锁过期后的重复执行。不假设「只有一个实例」。
 *
 * <p>拉取失败只记 warn，不抛出：汇率晚几个小时更新不影响任何现有功能，而一个抛出的定时任务会刷屏。
 * ECB 工作日约 16:00 CET 更新，周末 / 节假日不更新，所以库里最新一天落后一两天是正常的。
 */
@Component
class FxRateSyncJob {

    enum Status {
        SYNCED, SKIPPED_LOCKED, FAILED
    }

    record Outcome(Status status, int inserted) {
    }

    private static final Logger log = LoggerFactory.getLogger(FxRateSyncJob.class);
    private static final String JOB = "fx-sync";
    private static final int LOCK_TTL_SECONDS = 120;

    private final EcbRatesClient client;
    private final FxRateStore store;
    private final RedisService redis;
    private final boolean enabled;

    FxRateSyncJob(EcbRatesClient client, FxRateStore store, RedisService redis, AppProperties properties) {
        this.client = client;
        this.store = store;
        this.redis = redis;
        this.enabled = properties.fx().enabled();
    }

    @Scheduled(initialDelayString = "${app.fx.sync-initial-delay:PT1M}",
            fixedDelayString = "${app.fx.sync-interval:PT3H}")
    public void scheduledSync() {
        if (enabled) {
            syncOnce();
        }
    }

    Outcome syncOnce() {
        String key = CacheKeys.schedulerLock(JOB, FxRate.SOURCE_ECB);
        String fence = UUID.randomUUID().toString();
        if (!redis.tryLock(key, fence, LOCK_TTL_SECONDS)) {
            log.info("fx sync skipped: another instance holds the lock");
            return new Outcome(Status.SKIPPED_LOCKED, 0);
        }
        try {
            EcbDailyRates day = client.fetchDaily();
            int inserted = store.saveEcbDay(day);
            log.info("fx sync done: source=ECB rateDate={} currencies={} inserted={}",
                    day.date(), day.rates().size(), inserted);
            return new Outcome(Status.SYNCED, inserted);
        } catch (RuntimeException e) {
            log.warn("fx sync failed: {}", e.toString());
            return new Outcome(Status.FAILED, 0);
        } finally {
            redis.releaseLock(key, fence);
        }
    }
}
