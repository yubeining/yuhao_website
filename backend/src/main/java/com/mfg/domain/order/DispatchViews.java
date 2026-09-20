package com.mfg.domain.order;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 派单相关的对外视图（白名单字段，CLAUDE.md §3 铁律 5）。
 *
 * <p>★ 分两组：{@code Ops*} 给运营，带客户信息；{@code Supplier*} 给供应商，<b>不含任何客户信息</b>
 * （客户组织 id / 名称、客户订单 id / 名称都不给，D8 / D13；2026-09-18 定供应商只看得到零件名称 + 图号、材料、表面处理、数量、交期、图纸）。
 * 新加字段先想清楚是哪一组的。
 */
public final class DispatchViews {

    private DispatchViews() {
    }

    // ---------- 运营 ----------

    /** 派单池里的一行：已确认报价、还没分配的客户零件行。 */
    public record PoolLine(UUID customerOrderPartId, UUID customerOrderId, UUID customerOrgId, String customerName,
                           String orderTitle, String code, String partName, int quantity, String material,
                           String surfaceTreatment, Instant submittedAt) {
    }

    public record OpsOrderSummary(UUID id, String status, String dispatchMode, LocalDate supplierDueDate,
                                  Instant dispatchedAt, int lineCount, int totalQuantity, int customerCount,
                                  String acceptedSupplierName, Instant createdAt) {
    }

    public record OpsOrderDetail(UUID id, String status, String dispatchMode, int dispatchRound,
                                 LocalDate supplierDueDate, Instant dispatchedAt, Instant createdAt,
                                 List<OpsLine> lines, List<OpsOffer> offers, List<OpsSupplierOrder> supplierOrders) {
    }

    public record OpsLine(UUID id, UUID customerOrderPartId, UUID customerOrderId, UUID customerOrgId,
                          String customerName, String orderTitle, String code, String partName, int quantity,
                          String material, String surfaceTreatment) {
    }

    public record OpsOffer(UUID supplierOrgId, String supplierName, int dispatchRound, String status,
                           Instant respondedAt) {
    }

    /** {@code signByDeadline}：接单时间 + 7 天，到点没签字系统自动取消（2026-09-20 拍板）。 */
    public record OpsSupplierOrder(UUID id, UUID supplierOrgId, String supplierName, String status,
                                   LocalDate supplierDueDate, Instant acceptedAt, Instant contractCreatedAt,
                                   Instant signedAt, Instant signByDeadline, Instant cancelledAt,
                                   String cancelReason) {
    }

    public record Allocation(UUID customerOrderPartId, List<AllocatedPart> parts) {
    }

    public record AllocatedPart(UUID opsOrderId, UUID opsOrderLineId, int quantity) {
    }

    // ---------- 供应商（不含客户信息） ----------

    public record SupplierOfferSummary(UUID id, String dispatchMode, LocalDate supplierDueDate, Instant dispatchedAt,
                                       int lineCount, int totalQuantity) {
    }

    public record SupplierOffer(UUID id, String dispatchMode, LocalDate supplierDueDate, Instant dispatchedAt,
                                List<SupplierLine> lines) {
    }

    /** {@code code} 是客户的图号（2026-09-18 定可以给供应商看）。 */
    public record SupplierLine(UUID id, String code, String partName, int quantity, String material,
                               String surfaceTreatment, List<FileView> files) {
    }

    /** {@code signByDeadline}：接单时间 + 7 天，到点没签字系统自动取消（2026-09-20 拍板）。 */
    public record SupplierOrderView(UUID id, UUID opsOrderId, String status, LocalDate supplierDueDate,
                                    Instant acceptedAt, Instant contractCreatedAt, Instant signedAt,
                                    Instant signByDeadline, Instant cancelledAt, String cancelReason,
                                    List<SupplierLine> lines) {
    }

    public record Declined(UUID id, String status) {
    }
}
