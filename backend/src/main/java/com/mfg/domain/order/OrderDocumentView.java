package com.mfg.domain.order;

import java.time.Instant;
import java.util.UUID;

/** 随货文件对外视图（白名单）：存储 key、上传人、判出的类型都不对外。 */
public record OrderDocumentView(UUID id, String originalFilename, String uploadStatus, Long sizeBytes,
                                Instant completedAt) {

    static OrderDocumentView of(CustomerOrderDocument d) {
        return new OrderDocumentView(d.getId(), d.getOriginalFilename(), d.getUploadStatus().name(),
                d.getSizeBytes(), d.getCompletedAt());
    }
}
