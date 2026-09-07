package com.mfg.platform.async;

import com.mfg.config.AsyncConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.concurrent.Executor;

/**
 * 把一段副作用推迟到<b>当前事务提交之后</b>再异步执行。
 *
 * <h3>为什么需要它</h3>
 * <p>设计文档 3 §4 明确要求：接受报价的那一串动作在同一事务里完成，但
 * <b>「通知发送要在事务提交之后触发，不要在事务内调外部服务」</b>。原因有二：
 * <ul>
 *   <li>事务还没提交就发通知，事务若回滚，客户已经收到"订单已确认"——
 *       屏幕上的事实和库里的事实对不上；</li>
 *   <li>在事务内调外部服务（发邮件 / 微信 / 打对象存储），慢响应会把数据库连接
 *       和行锁一起占住，放大锁竞争。</li>
 * </ul>
 *
 * <h3>行为</h3>
 * <ul>
 *   <li>有活动事务：注册一个 {@link TransactionSynchronization}，
 *       在 {@code afterCommit} 时把任务丢到 {@code appTaskExecutor} 异步跑。
 *       事务回滚 → 任务不执行。</li>
 *   <li>没有活动事务（比如定时任务里直接调）：立即异步执行。</li>
 * </ul>
 * 任务本身在异步线程里跑，其异常不会回灌到业务事务 —— 这里兜底记日志。
 */
@Component
public class AfterCommitExecutor {

    private static final Logger log = LoggerFactory.getLogger(AfterCommitExecutor.class);

    private final Executor executor;

    public AfterCommitExecutor(@Qualifier(AsyncConfig.APP_EXECUTOR) Executor executor) {
        this.executor = executor;
    }

    /**
     * @param task 提交后要跑的副作用。务必自包含 —— 到它执行时，原事务的
     *             持久化上下文已经关闭，别在里面碰懒加载的实体，需要数据就先取好值传进来。
     */
    public void execute(Runnable task) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    submit(task);
                }
            });
        } else {
            // 没有事务上下文 —— 无所谓"提交后"，直接异步跑
            submit(task);
        }
    }

    private void submit(Runnable task) {
        executor.execute(() -> {
            try {
                task.run();
            } catch (RuntimeException e) {
                // 副作用失败不该影响已经提交的业务；记下来人工兜
                log.error("after-commit task failed", e);
            }
        });
    }
}
