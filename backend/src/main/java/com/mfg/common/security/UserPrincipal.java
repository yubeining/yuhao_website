package com.mfg.common.security;

import java.util.Set;
import java.util.UUID;

/**
 * 当前登录用户。由 {@code JwtAuthFilter} 从 JWT 解析后放进 SecurityContext。
 *
 * <p><b>★ {@code id} 和 {@code partyId} 都是 {@link UUID} 而不是 {@code String}</b>
 * —— 这是刻意的类型选择，见 CLAUDE.md §11 C6。
 *
 * <p>参考系统把 principal id 存成 String（JWT 的 {@code sub} 本来就是字符串），
 * 而实体主键是 UUID。两者 {@code .equals()} 跨类型<b>恒为 false 且没有编译警告</b>，
 * 因此出过两次水平越权 bug（"这条记录是不是你的" 判断永远为否 → 走进了不该走的分支），
 * 最后不得不加一道专门的静态检查闸门。
 *
 * <p>从源头用对类型，比事后加闸门好。JWT 解析时 {@code UUID.fromString(sub)} 一次，
 * 之后全程类型安全。
 *
 * @param id        用户 id
 * @param partyId   所属交易方 id ★所有租户隔离查询的入参
 * @param partyType 交易方类型，决定能进哪个端
 * @param email     登录邮箱，可能为 null（供应商用手机号登录）
 * @param locale    界面语言，用于选翻译表
 * @param roles     端内角色。客户/供应商端只有 ADMIN|MEMBER；
 *                  OPERATOR 端才有 SALES/SOURCING/QC/LOGISTICS/FINANCE/ADMIN
 */
public record UserPrincipal(
        UUID id,
        UUID partyId,
        PartyType partyType,
        String email,
        String locale,
        Set<String> roles) {

    public boolean isOperator() {
        return partyType == PartyType.OPERATOR;
    }

    public boolean hasRole(String role) {
        return roles != null && roles.contains(role);
    }

    /**
     * 判断某条数据是否属于本人的交易方。
     *
     * <p>注意：这只是<b>辅助</b>判断。真正的隔离必须在 repository 层做
     * （{@code findByIdAndPartyId}），而不是查出来再判 —— 见 CLAUDE.md §5 铁律 2。
     * 先查后判的写法在并发下有 TOCTOU 问题，而且很容易漏。
     */
    public boolean ownsParty(UUID otherPartyId) {
        return partyId != null && partyId.equals(otherPartyId);
    }
}
