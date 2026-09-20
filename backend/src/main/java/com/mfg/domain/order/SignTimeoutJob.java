package com.mfg.domain.order;

import com.mfg.common.cache.CacheKeys;
import com.mfg.common.service.RedisService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * 接单 7 天还没签字 → 供应商订单自动取消（SIGN_TIMEOUT），生产订单回组装中，运营重派
 * （2026-09-09 定的机制，2026-09-20 定的 7 天，从接单算）。
 *
 * <p>按 CLAUDE.md §8 加 Redis 锁：这一类只有一个条目（整张表扫一遍），锁一把；比对 fence 才释放。
 * 库里那条「每张生产订单同时最多一张没取消的供应商订单」的唯一索引兜底重复执行。
 *
 * <p>取消的是「已接单」和「待签」两种；已签字的锁定了，不动。
 */
@Component
class SignTimeoutJob {

    private static final Logger log = LoggerFactory.getLogger(SignTimeoutJob.class);
    private static final String JOB = "sign-timeout";
    private static final String ITEM = "all";
    private static final int LOCK_TTL_SECONDS = 120;

    private final SupplierOrderRepository supplierOrders;
    private final OpsOrderRepository opsOrders;
    private final SignDeadline deadline;
    private final RedisService redis;
    private final TransactionTemplate tx;
    private final boolean enabled;

    SignTimeoutJob(SupplierOrderRepository supplierOrders, OpsOrderRepository opsOrders, SignDeadline deadline,
                   RedisService redis, PlatformTransactionManager transactions,
                   @Value("${app.dispatch.sign-timeout-scan-enabled}") boolean enabled) {
        this.supplierOrders = supplierOrders;
        this.opsOrders = opsOrders;
        this.deadline = deadline;
        this.redis = redis;
        this.tx = new TransactionTemplate(transactions);
        this.enabled = enabled;
    }

    @Scheduled(initialDelayString = "${app.dispatch.sign-timeout-initial-delay:PT2M}",
            fixedDelayString = "${app.dispatch.sign-timeout-interval:PT1H}")
    public void scheduledScan() {
        if (enabled) {
            runOnce();
        }
    }

    /** @return 取消的张数；别的实例正拿着锁时返回 -1。 */
    int runOnce() {
        String key = CacheKeys.schedulerLock(JOB, ITEM);
        String fence = UUID.randomUUID().toString();
        if (!redis.tryLock(key, fence, LOCK_TTL_SECONDS)) {
            log.info("sign timeout scan skipped: another instance holds the lock");
            return -1;
        }
        try {
            int cancelled = cancelOverdue();
            if (cancelled > 0) {
                log.info("sign timeout: cancelled {} unsigned supplier order(s)", cancelled);
            }
            return cancelled;
        } finally {
            redis.releaseLock(key, fence);
        }
    }

    /** 一张一个事务（{@code TransactionTemplate}，不是同类里的 {@code @Transactional} —— 那个自调用不生效）：某一张出错不拖累其余的。 */
    private int cancelOverdue() {
        Instant now = Instant.now();
        List<UUID> overdue = tx.execute(status -> supplierOrders.findByStatusInAndAcceptedAtBefore(
                        List.of(SupplierOrder.Status.ACCEPTED, SupplierOrder.Status.CONTRACT_PENDING),
                        deadline.overdueBefore(now)).stream()
                .map(SupplierOrder::getId).toList());
        int cancelled = 0;
        for (UUID id : overdue == null ? List.<UUID>of() : overdue) {
            try {
                if (cancelOne(id, now)) {
                    cancelled++;
                }
            } catch (RuntimeException e) {
                log.warn("sign timeout: could not cancel supplier order {}", id, e);
            }
        }
        return cancelled;
    }

    private boolean cancelOne(UUID supplierOrderId, Instant now) {
        return Boolean.TRUE.equals(tx.execute(status -> {
            SupplierOrder peek = supplierOrders.findById(supplierOrderId).orElse(null);
            if (peek == null) {
                return false;
            }
            // 锁生产订单：和接单 / 签字 / 退单 / 收回是同一把锁，扫描不会和它们打架
            OpsOrder o = opsOrders.lockById(peek.getOpsOrderId()).orElse(null);
            SupplierOrder so = supplierOrders.findById(supplierOrderId).orElseThrow();
            if (o == null || !so.isOpenBeforeSigning()
                    || so.getAcceptedAt().isAfter(deadline.overdueBefore(now))) {
                return false;
            }
            so.cancel(SupplierOrder.CancelReason.SIGN_TIMEOUT, now);
            supplierOrders.saveAndFlush(so);
            if (o.getStatus() == OpsOrder.Status.ASSIGNED) {
                o.backToAssembling();
                opsOrders.saveAndFlush(o);
            }
            return true;
        }));
    }
}
