package com.mfg.platform.audit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * 写审计事件。
 *
 * <p>★ 审计写入<b>不能让业务失败</b>。异常在这里吞掉并打日志 ——
 * 因为一条审计没写上而让客户的报价提交失败，是更糟的结果。
 *
 * <p>反过来也成立：图纸访问审计（红线 1）<b>不适用</b>这条豁免。
 * 那是跟欧洲客户签保密协议时的交付物，写不进去就必须拒绝访问 ——
 * 那条路径要单独实现，不要复用本方法。
 */
@Service
public class AuditService {

    private static final Logger log = LoggerFactory.getLogger(AuditService.class);

    private final AuditEventRepository repository;

    public AuditService(AuditEventRepository repository) {
        this.repository = repository;
    }

    /**
     * @param action     {@code <域>.<子域>.<动词>}
     * @param targetType 目标实体类型，如 rfq / customer_quote
     * @param targetId   目标 id，可为 null
     * @param payload    只放 ID / 枚举 / 计数 / 变更字段名；绝不放 PII 或价格
     */
    @Transactional
    public void record(String action, String targetType, String targetId,
                       UUID actorUserId, UUID actorPartyId, Map<String, Object> payload) {
        try {
            repository.save(new AuditEvent(
                    action, targetType, targetId,
                    actorUserId, actorPartyId,
                    payload == null ? Map.of() : payload,
                    OffsetDateTime.now()));
        } catch (RuntimeException e) {
            // 只记 action，不记 payload —— payload 里可能有 id，日志不该成为第二份数据源
            log.error("failed to write audit event: action={}", action, e);
        }
    }
}
