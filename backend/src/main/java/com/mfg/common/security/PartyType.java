package com.mfg.common.security;

/**
 * 交易方类型。这是本系统最重要的一个枚举 —— 它决定了调用方能进哪个端。
 *
 * <p>端级隔离由 {@code PortalGuardInterceptor} 按 URL 路径前缀执行：
 * <pre>
 *   /api/v1/customer/**  →  CUSTOMER
 *   /api/v1/supplier/**  →  SUPPLIER
 *   /api/v1/ops/**       →  OPERATOR
 * </pre>
 *
 * <p>为什么用粗粒度的路径前缀而不是细粒度权限：
 * 跨端信息泄露（客户身份泄给供应商 / 对客价泄给供应商）是本系统的头号风险，
 * 而路径前缀是最难写错、最容易审计的边界。细粒度权限只在 OPERATOR 端内部才需要。
 */
public enum PartyType {

    /** 欧洲买方 */
    CUSTOMER("customer"),

    /** 中国供应商 */
    SUPPLIER("supplier"),

    /** 我们自己（内部后台） */
    OPERATOR("ops");

    private final String pathSegment;

    PartyType(String pathSegment) {
        this.pathSegment = pathSegment;
    }

    /** 该类型对应的 URL 路径段（不含前后斜杠）。 */
    public String pathSegment() {
        return pathSegment;
    }

    /**
     * 由路径段反查类型。
     *
     * @return 该路径段对应的类型；不是三个受众路径之一时返回 {@code null}
     *         （例如 {@code public} / {@code auth} —— 这些不受端级闸门管辖）
     */
    public static PartyType fromPathSegment(String segment) {
        for (PartyType t : values()) {
            if (t.pathSegment.equals(segment)) {
                return t;
            }
        }
        return null;
    }
}
