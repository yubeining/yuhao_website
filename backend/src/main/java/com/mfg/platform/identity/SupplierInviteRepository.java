package com.mfg.platform.identity;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface SupplierInviteRepository extends JpaRepository<SupplierInvite, UUID> {

    Optional<SupplierInvite> findByTokenHash(String tokenHash);

    List<SupplierInvite> findAllByOrderByCreatedAtDesc();

    /**
     * 用掉一条邀请：只有「没用过、没作废、没过期」时才改得到，返回改到的行数。
     * 两个请求同时注册，后到的等前一个提交后再判 {@code used_at is null}，拿到 0。
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update SupplierInvite i set i.usedAt = :now, i.usedByOrgId = :orgId, i.updatedAt = :now,"
            + " i.version = i.version + 1"
            + " where i.id = :id and i.usedAt is null and i.revokedAt is null and i.expiresAt > :now")
    int consume(@Param("id") UUID id, @Param("orgId") UUID orgId, @Param("now") Instant now);

    /** 作废：只作废还没用掉的。 */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update SupplierInvite i set i.revokedAt = :now, i.updatedAt = :now, i.version = i.version + 1"
            + " where i.id = :id and i.usedAt is null and i.revokedAt is null")
    int revoke(@Param("id") UUID id, @Param("now") Instant now);
}
