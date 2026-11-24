package com.mfg.domain.order;

import org.springframework.data.jpa.repository.JpaRepository;

/** 随货文件下载审计。只增不改。 */
interface CustomerOrderDocumentAccessLogRepository extends JpaRepository<CustomerOrderDocumentAccessLog, Long> {
}
