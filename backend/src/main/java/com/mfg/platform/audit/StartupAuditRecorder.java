package com.mfg.platform.audit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.info.BuildProperties;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 应用启动完成时写一条审计。
 *
 * <p><b>为什么这是一条值得记的审计</b>：部署和重启是生命周期事件，
 * 而这个系统的部署会自动执行数据库迁移。半年后如果出现
 * "这张表是什么时候多出来的"、"这个字段什么时候变的"，
 * {@code audit_event} 里按时间排一遍就能对上是哪次发布。
 *
 * <p>另外它顺便解决了一个运维问题：容器被 OOMKilled 后会静默重启，
 * 进程视角看不出来。审计表里多出一条 {@code platform.app.start} 就是证据。
 *
 * <p>★ 用 {@link ApplicationReadyEvent} 而不是 {@code @PostConstruct}：
 * 后者在 bean 初始化阶段执行，那时事务基础设施可能还没就绪，
 * 而且一旦抛异常会让整个应用起不来 —— 一条审计不该有这个权力。
 */
@Component
public class StartupAuditRecorder {

    private static final Logger log = LoggerFactory.getLogger(StartupAuditRecorder.class);

    private static final String ACTION = "platform.app.start";
    private static final String TARGET_TYPE = "application";

    private final AuditService auditService;
    private final ObjectProvider<BuildProperties> buildProperties;
    private final String serverPort;

    public StartupAuditRecorder(AuditService auditService,
                                ObjectProvider<BuildProperties> buildProperties,
                                @Value("${server.port:0}") String serverPort) {
        this.auditService = auditService;
        this.buildProperties = buildProperties;
        this.serverPort = serverPort;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void recordStartup() {
        BuildProperties build = buildProperties.getIfAvailable();
        String commit = build == null ? "unknown" : String.valueOf(build.get("commit"));
        String version = build == null ? "dev" : build.getVersion();

        // payload 只放 ID / 枚举 / 计数 —— 这里是版本标识和端口，没有任何 PII
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("commit", commit);
        payload.put("version", version);
        payload.put("port", serverPort);

        // 系统动作，没有操作人 —— actorUserId / actorPartyId 都是 null
        auditService.record(ACTION, TARGET_TYPE, commit, null, null, payload);
        log.info("recorded startup audit: commit={}", commit);
    }
}
