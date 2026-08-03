package com.mfg.platform.audit;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * 审计事件仓储。
 *
 * <p>★ 本表<b>只增不改不删</b>。审计记录一旦写入就不能被修改 ——
 * 它存在的意义就是"事后能查到当时发生了什么"，可改的审计等于没有审计。
 * 所以这里不提供任何 update / delete 方法，也不要加。
 *
 * <p>Repository 泛型的第二个参数必须匹配实体 {@code @Id} 的类型（这里是 Long）——
 * 不匹配时自定义 {@code @Query} 的参数绑定会在运行时才炸（CLAUDE.md §6）。
 */
public interface AuditEventRepository extends JpaRepository<AuditEvent, Long> {

    List<AuditEvent> findTop10ByActionOrderByIdDesc(String action);

    long countByAction(String action);
}
