package com.mfg.domain.order;

import java.util.List;
import java.util.UUID;

/**
 * 图纸版本对外视图。{@code revNo} 是我方编号，{@code customerRev} 是客户自己的 A/B/C，只展示。
 * {@code locked}：已被提交的订单锁定，不能再加 / 删文件。{@code files} 只含传完并校验通过的文件。
 */
public record RevisionView(UUID id, int revNo, String customerRev, boolean locked, List<FileView> files) {

    static RevisionView of(PartRevision revision, List<FileView> files) {
        return new RevisionView(revision.getId(), revision.getRevNo(), revision.getCustomerRev(),
                revision.isLocked(), files);
    }
}
