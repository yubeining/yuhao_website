package com.mfg.platform.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * 全局业务配置(KV)—— 配置读取四层链的<b>第 3 层</b>(env/nacos → yml → <b>app_setting</b> → 代码默认)。
 *
 * <p>{@code configValue} 用 jsonb,数字 / 字符串 / 对象 / 数组都能存;读的时候由 ConfigService
 * 按请求类型取值并校验,类型不符要报错、不静默强转。
 *
 * <p><b>基建 / 密钥不进这里</b>(走 env / yml,第 1/2 层)。{@code configKey} 用点号命名,
 * 与 yml 属性路径保持一致,同一个 key 才能在层间 fallthrough。
 */
@Entity
@Table(name = "app_setting")
public class AppSetting extends BaseEntity {

    /** 仅用于写入校验 / 后台展示,不参与存储形态(值一律 jsonb)。 */
    public enum ValueType {
        STRING, NUMBER, BOOL, JSON
    }

    @Column(name = "config_key", nullable = false)
    private String configKey;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "config_value", columnDefinition = "jsonb", nullable = false)
    private JsonNode configValue;

    @Enumerated(EnumType.STRING)
    @Column(name = "value_type", nullable = false)
    private ValueType valueType = ValueType.STRING;

    @Column(name = "description")
    private String description;

    protected AppSetting() {
        // JPA
    }

    public AppSetting(String configKey, JsonNode configValue, ValueType valueType, String description) {
        this.configKey = configKey;
        this.configValue = configValue;
        this.valueType = valueType;
        this.description = description;
    }

    public String getConfigKey() {
        return configKey;
    }

    public JsonNode getConfigValue() {
        return configValue;
    }

    public void setConfigValue(JsonNode configValue) {
        this.configValue = configValue;
    }

    public ValueType getValueType() {
        return valueType;
    }

    public void setValueType(ValueType valueType) {
        this.valueType = valueType;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }
}
