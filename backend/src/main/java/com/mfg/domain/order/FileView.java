package com.mfg.domain.order;

import java.util.UUID;

/**
 * 图纸文件对外视图。存储 key、判出的类型、上传人都不对外 ——
 * key 是内部细节，拿到它不应该有任何用处，但也没理由给。
 */
public record FileView(UUID id, String originalFilename, String uploadStatus, Long sizeBytes) {

    static FileView of(PartFile file) {
        return new FileView(file.getId(), file.getOriginalFilename(), file.getUploadStatus().name(),
                file.getSizeBytes());
    }
}
