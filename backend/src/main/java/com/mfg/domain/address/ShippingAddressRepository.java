package com.mfg.domain.address;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** 地址簿。所有查询都带所有者条件（CLAUDE.md §3 铁律 2）。 */
interface ShippingAddressRepository extends JpaRepository<ShippingAddress, UUID> {

    List<ShippingAddress> findByExternalUserIdOrderByCreatedAtAsc(UUID externalUserId);

    Optional<ShippingAddress> findByIdAndExternalUserId(UUID id, UUID externalUserId);

    Optional<ShippingAddress> findByExternalUserIdAndIsDefaultTrue(UUID externalUserId);

    /**
     * 改地址簿前先锁住这个用户的全部地址：同一个人的两个并发请求（比如同时设默认、同时删）排队执行，
     * 「最多一个默认」「最多 20 条」才算得准。地址簿为空时锁不到行，第一条的并发新增由库里的部分唯一索引兜底。
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from ShippingAddress a where a.externalUserId = :userId order by a.createdAt asc")
    List<ShippingAddress> lockAllByExternalUserId(@Param("userId") UUID externalUserId);
}
