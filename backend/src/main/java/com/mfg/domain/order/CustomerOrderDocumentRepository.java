package com.mfg.domain.order;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** 随货文件。按订单取时都带订单 id，客户侧再带客户组织（§3 铁律 2）。 */
interface CustomerOrderDocumentRepository extends JpaRepository<CustomerOrderDocument, UUID> {

    Optional<CustomerOrderDocument> findByIdAndCustomerOrderId(UUID id, UUID customerOrderId);

    Optional<CustomerOrderDocument> findByIdAndCustomerOrderIdAndCustomerOrgId(UUID id, UUID customerOrderId,
                                                                             UUID customerOrgId);

    List<CustomerOrderDocument> findByCustomerOrderIdAndCustomerOrgIdAndUploadStatusOrderByCreatedAtAsc(
            UUID customerOrderId, UUID customerOrgId, CustomerOrderDocument.UploadStatus uploadStatus);

    /** 只改仍是 PENDING 的行：并发 / 重试的 complete 只有一个改到。 */
    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update CustomerOrderDocument d set d.uploadStatus = :to, d.storageKey = :key, d.detectedType = :type,"
            + " d.sizeBytes = :size, d.completedAt = :completedAt, d.updatedAt = :now, d.version = d.version + 1"
            + " where d.id = :id and d.uploadStatus = com.mfg.domain.order.CustomerOrderDocument.UploadStatus.PENDING")
    int settleIfPending(@Param("id") UUID id,
                        @Param("to") CustomerOrderDocument.UploadStatus to,
                        @Param("key") String storageKey,
                        @Param("type") String detectedType,
                        @Param("size") Long sizeBytes,
                        @Param("completedAt") Instant completedAt,
                        @Param("now") Instant now);
}
