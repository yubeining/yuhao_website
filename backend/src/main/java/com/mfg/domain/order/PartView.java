package com.mfg.domain.order;

import java.util.List;
import java.util.UUID;

/** 零件对外视图 —— 白名单字段（CLAUDE.md §3 铁律 5）。不含归属组织、创建人等内部字段。 */
public record PartView(UUID id, String code, String name, List<RevisionView> revisions) {

    static PartView of(PartDesign part, List<RevisionView> revisions) {
        return new PartView(part.getId(), part.getCode(), part.getName(), revisions);
    }
}
