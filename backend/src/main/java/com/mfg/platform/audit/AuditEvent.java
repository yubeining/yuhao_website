package com.mfg.platform.audit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * 审计事件。对应 {@code 2026-08-02_01_platform-core.sql} 里的 {@code audit_event} 表。
 *
 * <p>只记<b>结构性 / 生命周期 / 高危安全事件</b>，不记常规字段编辑（CLAUDE.md §7）。
 *
 * <p><b>payload 只放</b>：ID / 枚举 / 计数 / 变更字段名集合。
 * <b>绝不放</b>：姓名 / 邮箱 / 电话 / 价格 / 自由文本 / 原始 IP / token。
 *
 * <h3>★ 本类同时是三个 JPA 坑的活体样本（CLAUDE.md §6）</h3>
 *
 * <ol>
 *   <li><b>时间</b>：字段用 {@link OffsetDateTime} 且显式声明
 *       {@code columnDefinition = "timestamp with time zone"}。
 *       用 {@code LocalDateTime} 会和 schema 的 {@code timestamptz} <b>静默漂移</b> ——
 *       写进去的时间少了时区信息，跨时区读出来就是错的，而且没有任何报错。</li>
 *   <li><b>jsonb</b>：必须 {@code @JdbcTypeCode(SqlTypes.JSON)} 配
 *       {@code columnDefinition = "jsonb"}。写成 {@code "json"} 是坑 ——
 *       PostgreSQL 的 {@code json} 和 {@code jsonb} 是两个类型，
 *       schema 是 jsonb 而映射写 json，{@code ddl-auto: validate} 会启动失败。</li>
 *   <li><b>UUID</b>：见 {@link #actorUserId} 上的注释。</li>
 * </ol>
 *
 * <p><b>主键用 bigserial 而不是 UUID</b>：这是高频只增的日志表，
 * UUID 主键在这种表上会让 B-tree 索引随机分裂、写放大明显（CLAUDE.md §6）。
 */
@Entity
@Table(name = "audit_event")
public class AuditEvent {

    /** bigserial → IDENTITY。不要用 GenerationType.AUTO，它在 PG 上会去建 hibernate_sequence。 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 动作命名 {@code <域>.<子域>.<动词>}，例 {@code quote.customer.send}。 */
    @Column(name = "action", nullable = false)
    private String action;

    @Column(name = "target_type", nullable = false)
    private String targetType;

    @Column(name = "target_id")
    private String targetId;

    /**
     * ★ 全局配置里有 {@code hibernate.type.preferred_uuid_jdbc_type: VARCHAR}
     * （为了让自定义 {@code @Query} 的 UUID 参数能正确绑定）。
     * 那个设置会让 Hibernate 默认把 UUID 当 varchar 处理，而本表的列是 PostgreSQL 的
     * {@code uuid} 类型 —— 不显式声明的话 {@code ddl-auto: validate} 会在启动时报
     * "found uuid, but expecting varchar"。
     *
     * <p>所以凡是映射到 {@code uuid} 列的字段，都要显式标注
     * {@code @JdbcTypeCode(SqlTypes.UUID)} 把全局默认覆盖回来。
     */
    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "actor_user_id", columnDefinition = "uuid")
    private UUID actorUserId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "actor_party_id", columnDefinition = "uuid")
    private UUID actorPartyId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "payload", nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> payload;

    /** 哈希后的 IP，绝不存原始值。 */
    @Column(name = "ip_hash")
    private String ipHash;

    @Column(name = "created_at", nullable = false,
            columnDefinition = "timestamp with time zone")
    private OffsetDateTime createdAt;

    protected AuditEvent() {
        // JPA 要求的无参构造
    }

    public AuditEvent(String action, String targetType, String targetId,
                      UUID actorUserId, UUID actorPartyId,
                      Map<String, Object> payload, OffsetDateTime createdAt) {
        this.action = action;
        this.targetType = targetType;
        this.targetId = targetId;
        this.actorUserId = actorUserId;
        this.actorPartyId = actorPartyId;
        this.payload = payload;
        this.createdAt = createdAt;
    }

    public Long getId() {
        return id;
    }

    public String getAction() {
        return action;
    }

    public String getTargetType() {
        return targetType;
    }

    public String getTargetId() {
        return targetId;
    }

    public UUID getActorUserId() {
        return actorUserId;
    }

    public UUID getActorPartyId() {
        return actorPartyId;
    }

    public Map<String, Object> getPayload() {
        return payload;
    }

    public String getIpHash() {
        return ipHash;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
