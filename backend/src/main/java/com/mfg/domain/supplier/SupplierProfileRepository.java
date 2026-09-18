package com.mfg.domain.supplier;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * ★ 写入一律一条 {@code INSERT … ON CONFLICT DO UPDATE}，不「先查、没有再 save」：
 * 两个运营同时第一次给同一家录资料，后插的会撞唯一索引报 500（第 3 步加成率踩过，见 CustomerMarkupRepository）。
 * 折率和能力分两条语句，各自只改自己那几列，同时录也不会互相覆盖。UUID 参数显式 cast（全局按 varchar 绑定）。
 */
interface SupplierProfileRepository extends JpaRepository<SupplierProfile, UUID> {

    Optional<SupplierProfile> findBySupplierOrgId(UUID supplierOrgId);

    List<SupplierProfile> findBySupplierOrgIdIn(Collection<UUID> supplierOrgIds);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = "insert into supplier_profile (id, supplier_org_id, discount_rate, created_at, updated_at, version)"
            + " values (cast(:id as uuid), cast(:orgId as uuid), :rate, :now, :now, 0)"
            + " on conflict (supplier_org_id) do update set discount_rate = excluded.discount_rate,"
            + " updated_at = excluded.updated_at, version = supplier_profile.version + 1", nativeQuery = true)
    int upsertDiscount(@Param("id") UUID id, @Param("orgId") UUID supplierOrgId, @Param("rate") BigDecimal rate,
                       @Param("now") Instant now);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = "insert into supplier_profile (id, supplier_org_id, processes, materials, size_range,"
            + " precision_grade, created_at, updated_at, version)"
            + " values (cast(:id as uuid), cast(:orgId as uuid), :processes, :materials, :sizeRange, :precisionGrade,"
            + " :now, :now, 0)"
            + " on conflict (supplier_org_id) do update set processes = excluded.processes,"
            + " materials = excluded.materials, size_range = excluded.size_range,"
            + " precision_grade = excluded.precision_grade, updated_at = excluded.updated_at,"
            + " version = supplier_profile.version + 1", nativeQuery = true)
    int upsertCapability(@Param("id") UUID id, @Param("orgId") UUID supplierOrgId,
                         @Param("processes") String processes, @Param("materials") String materials,
                         @Param("sizeRange") String sizeRange, @Param("precisionGrade") String precisionGrade,
                         @Param("now") Instant now);
}
