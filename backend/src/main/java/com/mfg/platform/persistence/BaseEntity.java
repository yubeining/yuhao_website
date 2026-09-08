package com.mfg.platform.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.Version;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.proxy.HibernateProxy;
import org.hibernate.type.SqlTypes;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.Instant;
import java.util.UUID;

/**
 * 业务实体的公共基类 —— 把 CLAUDE.md §4 里对每张表的强制约定收在一处，
 * 让每个新实体不用重抄一遍、也不会抄错。
 *
 * <h3>钉死的三件事（§4）</h3>
 * <ul>
 *   <li><b>主键是 UUID</b>，且在应用侧生成（{@code GenerationType.UUID}）——
 *       迁移里的 {@code id uuid PRIMARY KEY} 没有默认值，靠这里填。</li>
 *   <li><b>时间用 {@link Instant} + 显式 {@code timestamp with time zone}</b>，
 *       不用 {@code LocalDateTime}（后者会按 JVM 时区静默漂移 8 小时）。</li>
 *   <li><b>createdAt / updatedAt 由应用维护</b>（JPA Auditing 自动填，见
 *       {@code JpaAuditingConfig}）。迁移里那两列的 {@code DEFAULT now()} 只是兜底 ——
 *       {@code updated_at} 没有 DB 触发器，更新时刻靠 {@code @LastModifiedDate} 打上。</li>
 * </ul>
 *
 * <h3>谁不继承它</h3>
 * <p>高频只增的日志类表（{@code audit_event} / {@code file_access_log}）用 {@code bigserial}
 * 主键、且只插不改，不适用本基类 —— 它们保持各自的实体形状。
 *
 * <h3>equals / hashCode</h3>
 * <p>按 id 比较，且对 Hibernate 代理安全（同一实体的代理和实体要相等）。
 * hashCode 用类型而非 id：id 在 persist 之前为 null、persist 之后才有值，
 * 用 id 做 hashCode 会让实体在入库前后落进不同的哈希桶，破坏 Set / Map。
 */
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
public abstract class BaseEntity {

    // ★ 显式钉 UUID jdbc 类型 —— 全局配了 preferred_uuid_jdbc_type=VARCHAR（为兼容某些
    //   @Query 的 UUID 参数），但本列是真 uuid，不钉住会按 varchar 绑，运行时
    //   报 "operator does not exist: uuid = character varying"。同 AuditEvent 的做法。
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "id", columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @CreatedDate
    @Column(name = "created_at", columnDefinition = "timestamp with time zone",
            updatable = false, nullable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", columnDefinition = "timestamp with time zone", nullable = false)
    private Instant updatedAt;

    /**
     * 乐观锁版本号。并发"读-改-写"同一行时，后写的会检测到版本已变、更新失败
     * （抛 {@code OptimisticLockingFailureException}），而不是无声覆盖别人的改动（丢更新）。
     *
     * <p>Hibernate 自动维护：insert 时置 0，每次 update +1，并把它加进
     * {@code WHERE id=? AND version=?}。影响行数为 0 = 被人抢先改过。
     *
     * <p>★ 关键并发不变式（报价接受、拆单、接单唯一）另有 DB 层显式护栏（条件更新 /
     * FOR UPDATE / 唯一约束），不靠这个；这一层兜的是普通记录的并发编辑。
     *
     * <p><b>新建继承 BaseEntity 的实体时，其表必须带 {@code version bigint NOT NULL DEFAULT 0}</b>
     * （ddl-auto=validate 会校验该列存在）。DB 默认 0 保证非 Hibernate 的插入（如种子）也合法。
     */
    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    public UUID getId() {
        return id;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public Long getVersion() {
        return version;
    }

    /**
     * 两个实体相等 = 同一具体类型且 id 非空且相等。
     * id 为 null（尚未入库）时只和自身相等 —— 避免两个未入库实体被误判为同一个。
     */
    @Override
    public final boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (o == null) {
            return false;
        }
        Class<?> thisType = unproxiedClass(this);
        Class<?> thatType = unproxiedClass(o);
        if (thisType != thatType) {
            return false;
        }
        BaseEntity other = (BaseEntity) o;
        return id != null && id.equals(other.id);
    }

    @Override
    public final int hashCode() {
        return unproxiedClass(this).hashCode();
    }

    private static Class<?> unproxiedClass(Object o) {
        return o instanceof HibernateProxy proxy
                ? proxy.getHibernateLazyInitializer().getPersistentClass()
                : o.getClass();
    }

    @Override
    public String toString() {
        return unproxiedClass(this).getSimpleName() + "{id=" + id + "}";
    }
}
