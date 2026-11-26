package com.mfg.domain.address;

import org.springframework.data.jpa.repository.JpaRepository;
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
     * 改地址簿前先按用户加一把事务级 advisory 锁：同一个人的写请求排队执行，「最多一个默认」「最多 20 条」才算得准。
     *
     * <p>★ 不能只锁地址行（SELECT ... FOR UPDATE）：地址簿为空时锁不到任何行，两个并发的「新增第一条」
     * 会同时以为自己是第一条、都设成默认（2026-11-26 审查发现，并发测试复现）。advisory 锁不依赖行是否存在。
     * 第一个参数是本表的命名空间，避免和别处的 advisory 锁撞号；不同用户哈希撞上只会多排一次队，不影响正确性。
     * 事务结束自动释放。
     */
    @Query(value = "select 1 from (select pg_advisory_xact_lock(hashtext('shipping_address'), hashtext(:userId))) l",
            nativeQuery = true)
    Integer lockBookOf(@Param("userId") String externalUserId);
}
