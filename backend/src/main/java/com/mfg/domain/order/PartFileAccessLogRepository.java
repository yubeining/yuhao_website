package com.mfg.domain.order;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.UUID;

/** 图纸访问审计。只增不改,本轮只有写入(导出推迟)。 */
interface PartFileAccessLogRepository extends JpaRepository<PartFileAccessLog, Long> {

    /** 硬删草稿时连带清掉这些文件的审计行（文件本身已经不在了）。 */
    void deleteByPartFileIdIn(Collection<UUID> partFileIds);
}
