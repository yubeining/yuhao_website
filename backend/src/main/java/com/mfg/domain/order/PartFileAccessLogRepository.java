package com.mfg.domain.order;

import org.springframework.data.jpa.repository.JpaRepository;

/** 图纸访问审计。只增不改,本轮只有写入(导出推迟)。 */
interface PartFileAccessLogRepository extends JpaRepository<PartFileAccessLog, Long> {
}
