package com.mfg.domain.order;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.UUID;

/**
 * 客户订单里的零件行 —— 溯源链的根(无上游)。
 *
 * <p>★ {@code partRevisionId} 是这一行<b>锁定的图纸版本</b>,不是父零件 —— CLAUDE.md §3 铁律 7。
 * 版本在订单提交时被锁({@link PartRevision#lock}),之后这一版的文件不许再变。
 *
 * <p>{@code partName} 是快照:草稿里改名只改这一行,不回写零件主数据,
 * 否则改一次名,历史订单的显示就跟着变(CLAUDE.md §10 C2)。
 * 材料 / 表面处理放在行上而不是版本上:改材料不应该逼出一个新图纸版本。
 *
 * <p>{@code partNo} 的编号规则至今没定。暂时填这一行自己的 id,界面上不显示。
 */
@Entity
@Table(name = "customer_order_part")
class CustomerOrderPart extends BaseEntity {

    /**
     * 客户看得到的进度 —— <b>只有四态</b>(设计文档 12 §7)。返工、报废、供应商侧的取消一律折成「进行中」：
     * 客户看不到供应侧的波折,状态也不倒退。
     *
     * <p>这一列由叶子零件行在同一个事务里回写({@code ProductionService}),不是读的时候现算 ——
     * 客户端要按它筛,现算要跨三层零件链。
     */
    enum FulfillmentStatus {
        /** 还没安排下去 */
        PENDING,
        /** 在做了 */
        IN_PROGRESS,
        /** 全部质检合格 */
        FULFILLED,
        /** 取消(本轮没有触发路径:提交后的取消归运营,还没做) */
        CANCELLED
    }

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "customer_order_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID customerOrderId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "customer_org_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID customerOrgId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "part_design_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID partDesignId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "part_revision_id", columnDefinition = "uuid", nullable = false)
    private UUID partRevisionId;

    @Column(name = "part_no", nullable = false)
    private String partNo;

    @Column(name = "part_name", nullable = false)
    private String partName;

    /**
     * 这一行要做多少件 —— 一行零件是<b>一批</b>,不是一个物理件(设计文档 12 §1)。
     *
     * <p>库里这一列<b>没有默认值</b>,是刻意的:忘了填会当场报错,而不是静默变成 1 ——
     * 数量要拿去算钱和排产,静默默认值是最难查的那种错。
     */
    @Column(name = "quantity", nullable = false)
    private int quantity;

    @Column(name = "material")
    private String material;

    @Column(name = "surface_treatment")
    private String surfaceTreatment;

    @Enumerated(EnumType.STRING)
    @Column(name = "fulfillment_status", nullable = false)
    private FulfillmentStatus fulfillmentStatus = FulfillmentStatus.PENDING;

    protected CustomerOrderPart() {
    }

    CustomerOrderPart(UUID customerOrderId, UUID customerOrgId, UUID partDesignId, UUID partRevisionId,
                      String partNo, String partName, int quantity, String material, String surfaceTreatment) {
        this.customerOrderId = customerOrderId;
        this.customerOrgId = customerOrgId;
        this.partDesignId = partDesignId;
        this.partRevisionId = partRevisionId;
        this.partNo = partNo;
        this.partName = partName;
        this.quantity = quantity;
        this.material = material;
        this.surfaceTreatment = surfaceTreatment;
    }

    void updateDraft(String partName, int quantity, String material, String surfaceTreatment) {
        this.partName = partName;
        this.quantity = quantity;
        this.material = material;
        this.surfaceTreatment = surfaceTreatment;
    }

    void moveTo(FulfillmentStatus fulfillmentStatus) {
        this.fulfillmentStatus = fulfillmentStatus;
    }

    void repointRevision(UUID partRevisionId) {
        this.partRevisionId = partRevisionId;
    }

    UUID getCustomerOrderId() {
        return customerOrderId;
    }

    UUID getCustomerOrgId() {
        return customerOrgId;
    }

    UUID getPartDesignId() {
        return partDesignId;
    }

    UUID getPartRevisionId() {
        return partRevisionId;
    }

    String getPartNo() {
        return partNo;
    }

    String getPartName() {
        return partName;
    }

    int getQuantity() {
        return quantity;
    }

    String getMaterial() {
        return material;
    }

    String getSurfaceTreatment() {
        return surfaceTreatment;
    }

    FulfillmentStatus getFulfillmentStatus() {
        return fulfillmentStatus;
    }
}
