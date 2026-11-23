package com.mfg.platform.config;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

/**
 * app_setting 的读写。
 *
 * <p>★ 这里刻意走原生 SQL、拿 {@code jsonb::text}，不经过 {@link AppSetting} 实体：
 * 写这两条原生 SQL 时，Hibernate 的 jsonb 映射器还是 Jackson 2，读 Jackson 3 的 JsonNode 字段会抛异常；
 * 2026-11-23 起映射器改成了 Jackson 3（application.yml 的 hibernate.type.json_format_mapper），
 * 这里的原生 SQL 保持不变，照样能用。
 */
interface AppSettingRepository extends JpaRepository<AppSetting, UUID> {

    /** 拿原始 JSON 文本（number 就是 "1.25"）。 */
    @Query(value = "select config_value::text from app_setting where config_key = :key", nativeQuery = true)
    Optional<String> findRawValue(@Param("key") String key);

    /** 有就改、没有就建。 */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = "insert into app_setting (id, config_key, config_value, value_type, description,"
            + " created_at, updated_at, version)"
            + " values (cast(:id as uuid), :key, cast(:value as jsonb), 'NUMBER', :description, now(), now(), 0)"
            + " on conflict (config_key) do update set config_value = cast(:value as jsonb),"
            + " updated_at = now(), version = app_setting.version + 1", nativeQuery = true)
    int upsertNumber(@Param("id") UUID id, @Param("key") String key, @Param("value") String value,
                     @Param("description") String description);
}
