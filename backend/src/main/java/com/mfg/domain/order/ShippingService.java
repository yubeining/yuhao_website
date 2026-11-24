package com.mfg.domain.order;

import com.mfg.common.exception.BusinessException;
import com.mfg.common.security.PartyType;
import com.mfg.common.web.RequestContext;
import com.mfg.platform.storage.StorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * 发给客户（2026-11-24 需求方拍板，设计文档 12 §2 的 SHIP / CONFIRM_RECEIPT）：
 * <ul>
 *   <li>运营整单发货：只有待发货（READY）的单能发，承运商（自由文本）+ 运单号必填。</li>
 *   <li>客户确认收货：只有已发货的单能确认，确认后订单完成。</li>
 *   <li>随货文件：运营上传，不分类，只收 PDF / JPG / PNG（按文件内容判）；待发货和已发货时都能传，
 *       确认收货后就不能再传。客户和运营都能下载，每签发一次下载链接先校验归属、再落审计（§3 铁律 6）。</li>
 * </ul>
 *
 * <p>客户侧每个方法都显式收 {@code customerOrgId}，查询带这个条件（§3 铁律 1 / 2），别人的订单一律 404。
 * 运营跨客户，按订单 id 取，再用订单上的客户组织去查它的文件。
 */
@Service
class ShippingService {

    private static final Logger log = LoggerFactory.getLogger(ShippingService.class);

    /** 随货文件只收这几种（2026-11-24 拍板）。JPEG 是 JPG 的另一个扩展名。 */
    private static final Set<String> DOCUMENT_TYPES = Set.of("PDF", "JPG", "JPEG", "PNG");
    /** 能传随货文件的订单状态：待发货、已发货；确认收货之后不能再传。 */
    private static final Set<CustomerOrder.Status> DOCUMENTS_OPEN =
            Set.of(CustomerOrder.Status.READY, CustomerOrder.Status.SHIPPED);
    private static final int HEAD_BYTES = 8192;

    private final CustomerOrderRepository orders;
    private final CustomerOrderDocumentRepository documents;
    private final CustomerOrderDocumentAccessLogRepository accessLog;
    private final CustomerOrderService customerOrders;
    private final OpsCustomerOrderService opsOrders;
    private final StorageService storage;
    private final Duration signedUrlTtl;
    private final DrawingTypeGuard typeGuard = new DrawingTypeGuard(DOCUMENT_TYPES);

    ShippingService(CustomerOrderRepository orders, CustomerOrderDocumentRepository documents,
                    CustomerOrderDocumentAccessLogRepository accessLog, CustomerOrderService customerOrders,
                    OpsCustomerOrderService opsOrders, StorageService storage,
                    @Value("${app.storage.signed-url-ttl-seconds}") long signedUrlTtlSeconds) {
        this.orders = orders;
        this.documents = documents;
        this.accessLog = accessLog;
        this.customerOrders = customerOrders;
        this.opsOrders = opsOrders;
        this.storage = storage;
        this.signedUrlTtl = Duration.ofSeconds(signedUrlTtlSeconds);
    }

    // ---------- 发货 / 确认收货 ----------

    @Transactional
    public OpsOrderView ship(UUID orderId, UUID opsUserId, String carrier, String trackingNo) {
        CustomerOrder order = requireSubmitted(orderId);
        if (orders.ship(orderId, order.getCustomerOrgId(), carrier.trim(), trackingNo.trim(), opsUserId,
                Instant.now()) != 1) {
            throw BusinessException.conflict("order.not_ready");
        }
        return opsOrders.get(orderId);
    }

    @Transactional
    public OrderView confirmReceipt(UUID customerOrgId, UUID orderId) {
        orders.findByIdAndCustomerOrgId(orderId, customerOrgId)
                .orElseThrow(() -> BusinessException.notFound("order.not_found"));
        if (orders.confirmReceipt(orderId, customerOrgId, Instant.now()) != 1) {
            throw BusinessException.conflict("order.not_shipped");
        }
        return customerOrders.get(customerOrgId, orderId);
    }

    // ---------- 随货文件：上传（两段式，同图纸） ----------

    /** 申请上传：锁住订单判状态（和确认收货互斥），扩展名先过一道白名单，建 PENDING 行，给签名 PUT。 */
    @Transactional
    public UploadTicket requestUpload(UUID orderId, UUID opsUserId, String filename, String contentType) {
        CustomerOrder order = orders.lockSubmittedById(orderId)
                .orElseThrow(() -> BusinessException.notFound("order.not_found"));
        requireDocumentsOpen(order);
        if (!typeGuard.isAllowedExtension(filename)) {
            throw BusinessException.badRequest("order.document_type_not_allowed");
        }
        String signedType = contentType == null || contentType.isBlank() ? contentTypeOf(filename) : contentType.trim();
        // 对象名服务端生成，不含文件名（设计文档 2 §5.1）
        String key = "shipping-doc/" + UUID.randomUUID();
        CustomerOrderDocument doc = documents.save(new CustomerOrderDocument(orderId, order.getCustomerOrgId(), key,
                filename, signedType, opsUserId));
        return new UploadTicket(doc.getId(), storage.presignedPut(key, signedUrlTtl, signedType).toString(),
                signedType, Instant.now().plus(signedUrlTtl));
    }

    /**
     * 字节进桶之后调：挪到新地址（签名 PUT 有效期内能反复传，不挪的话完成之后还能被悄悄换掉），
     * 读文件头判类型，对得上 COMPLETED，对不上 REJECTED + 删对象 + 400。
     * 故意不开事务（中间有存储网络 IO）；状态更新是只改 PENDING 行的条件更新，并发 / 重试只有一个生效。
     */
    public OrderDocumentView complete(UUID orderId, UUID documentId) {
        CustomerOrderDocument doc = documents.findByIdAndCustomerOrderId(documentId, orderId)
                .orElseThrow(() -> BusinessException.notFound("order.document_not_found"));
        if (doc.getUploadStatus() == CustomerOrderDocument.UploadStatus.COMPLETED) {
            return OrderDocumentView.of(doc);
        }
        if (doc.getUploadStatus() != CustomerOrderDocument.UploadStatus.PENDING) {
            throw BusinessException.conflict("order.document_not_pending");
        }
        requireDocumentsOpen(requireSubmitted(orderId));
        String uploadKey = doc.getStorageKey();
        if (storage.head(uploadKey).isEmpty()) {
            throw BusinessException.conflict("order.document_object_missing");
        }
        String pinnedKey = "shipping-doc/" + UUID.randomUUID();
        storage.copy(uploadKey, pinnedKey);
        long size = storage.head(pinnedKey)
                .orElseThrow(() -> BusinessException.conflict("order.document_object_missing"))
                .sizeBytes();
        DrawingTypeGuard.Verdict verdict = typeGuard.inspect(doc.getOriginalFilename(),
                storage.readRange(pinnedKey, 0, HEAD_BYTES));
        Instant now = Instant.now();
        if (!verdict.accepted()) {
            storage.delete(pinnedKey);
            if (documents.settleIfPending(documentId, CustomerOrderDocument.UploadStatus.REJECTED, uploadKey,
                    verdict.detectedType(), size, null, now) == 1) {
                storage.delete(uploadKey);
            }
            throw BusinessException.badRequest("order.document_type_not_allowed");
        }
        if (documents.settleIfPending(documentId, CustomerOrderDocument.UploadStatus.COMPLETED, pinnedKey,
                verdict.detectedType(), size, now, now) == 1) {
            deleteQuietly(uploadKey);
        } else {
            // 并发的另一次 complete 抢先了：它挪的那份才是这一行指向的
            storage.delete(pinnedKey);
        }
        CustomerOrderDocument settled = documents.findByIdAndCustomerOrderId(documentId, orderId).orElseThrow();
        if (settled.getUploadStatus() != CustomerOrderDocument.UploadStatus.COMPLETED) {
            throw BusinessException.badRequest("order.document_type_not_allowed");
        }
        return OrderDocumentView.of(settled);
    }

    // ---------- 随货文件：下载（校验 → 签名 → 审计 → 返回） ----------

    @Transactional
    public ViewUrl customerViewUrl(UUID customerOrgId, UUID userId, UUID orderId, UUID documentId) {
        orders.findByIdAndCustomerOrgId(orderId, customerOrgId)
                .orElseThrow(() -> BusinessException.notFound("order.not_found"));
        CustomerOrderDocument doc = documents.findByIdAndCustomerOrderIdAndCustomerOrgId(documentId, orderId,
                        customerOrgId)
                .filter(d -> d.getUploadStatus() == CustomerOrderDocument.UploadStatus.COMPLETED)
                .orElseThrow(() -> BusinessException.notFound("order.document_not_found"));
        return issue(doc, userId, PartyType.CUSTOMER, customerOrgId);
    }

    @Transactional
    public ViewUrl opsViewUrl(UUID opsUserId, UUID opsOrgId, UUID orderId, UUID documentId) {
        requireSubmitted(orderId);
        CustomerOrderDocument doc = documents.findByIdAndCustomerOrderId(documentId, orderId)
                .filter(d -> d.getUploadStatus() == CustomerOrderDocument.UploadStatus.COMPLETED)
                .orElseThrow(() -> BusinessException.notFound("order.document_not_found"));
        return issue(doc, opsUserId, PartyType.OPERATOR, opsOrgId);
    }

    /** 审计写不进去就抛，URL 不会离开服务端 —— 没有审计行就没有 URL。 */
    private ViewUrl issue(CustomerOrderDocument doc, UUID accessorUserId, PartyType party, UUID accessorOrgId) {
        Instant now = Instant.now();
        String url = storage.presignedGet(doc.getStorageKey(), signedUrlTtl, doc.getOriginalFilename()).toString();
        accessLog.save(new CustomerOrderDocumentAccessLog(doc.getId(), doc.getCustomerOrderId(),
                doc.getCustomerOrgId(), accessorUserId, party, accessorOrgId, RequestContext.traceId(), now));
        return new ViewUrl(url, now.plus(signedUrlTtl));
    }

    // ---------- helpers ----------

    private CustomerOrder requireSubmitted(UUID orderId) {
        return orders.findByIdAndSubmittedAtIsNotNull(orderId)
                .orElseThrow(() -> BusinessException.notFound("order.not_found"));
    }

    private static void requireDocumentsOpen(CustomerOrder order) {
        if (!DOCUMENTS_OPEN.contains(order.getStatus())) {
            throw BusinessException.conflict("order.documents_locked");
        }
    }

    private static String contentTypeOf(String filename) {
        String name = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        if (name.endsWith(".pdf")) return "application/pdf";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
        return "application/octet-stream";
    }

    private void deleteQuietly(String key) {
        try {
            storage.delete(key);
        } catch (RuntimeException e) {
            log.warn("failed to delete shipping document upload object after pinning: key={} reason={}", key,
                    e.toString());
        }
    }
}
