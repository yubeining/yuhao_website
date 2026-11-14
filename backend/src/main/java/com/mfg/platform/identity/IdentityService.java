package com.mfg.platform.identity;

import com.mfg.common.exception.BusinessException;
import com.mfg.platform.identity.dto.RegisterRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * 组织 / 用户的读写(注册、查询)。注册只对外部,每次建一个<b>新组织 + 首个用户</b>;
 * 同事加入同一公司走邀请流程(缓办)。查询遵守 §5:租户范围查询必须带 orgId 作条件。
 */
@Service
public class IdentityService {

    private final OrganizationRepository organizations;
    private final ExternalUserRepository externalUsers;
    private final PasswordEncoder passwordEncoder;

    public IdentityService(OrganizationRepository organizations,
                           ExternalUserRepository externalUsers,
                           PasswordEncoder passwordEncoder) {
        this.organizations = organizations;
        this.externalUsers = externalUsers;
        this.passwordEncoder = passwordEncoder;
    }

    /**
     * 外部自助注册:建组织 + 首个用户。
     *
     * <h3>★ 只有客户能自助注册。供应商不行。</h3>
     *
     * <p>设计文档 1 §D5 明确:供应商<b>邀请制开户,不做自助注册</b>(供应商是个位数,
     * 靠线下谈来的)。文档 5 §2 也写着供应商端先不做。
     *
     * <p>这里原本按调用方传的 {@code portalType} 直接建 SUPPLIER 组织 ——
     * 意味着<b>公网上任何人都能给自己开一个供应商账号并登进供应商端</b>。
     * 而受众是本系统的安全边界(CLAUDE.md §3:路径前缀即受众),
     * 让匿名调用方自己填受众等于把边界交给对方。2026-09-09 堵掉。
     *
     * <p>客户注册后<b>立即 ACTIVE</b>,没有审核闸门 —— 2026-09-09 需求方当面拍板,
     * 文档 2 §4 和文档 5 Q2 已同步改掉(原先分别写的是「人工审核激活」和「下单前 KYC」)。
     *
     * <p><b>已知代价,需求方知情并接受</b>:D2 定的是「客户点接受即成单」,
     * 所以一个未验证身份的注册账号就能生成有约束力的订单。要加闸门就改这里,
     * 别在下单那一侧偷偷补一个 —— 两处各判一半是最难查的那种漏。
     *
     * @throws BusinessException 400 {@code auth.register_portal_invalid}(传了 OPERATOR 或 SUPPLIER)
     *                          / 409 {@code auth.email_taken}
     */
    @Transactional
    public ExternalUser register(RegisterRequest req) {
        Organization.Type orgType = switch (req.portalType()) {
            case CUSTOMER -> Organization.Type.CUSTOMER;
            // 供应商走邀请制(文档 1 D5),不能自助开户
            case SUPPLIER, OPERATOR -> throw new BusinessException(400, "auth.register_portal_invalid");
        };
        String email = normalizeEmail(req.email());
        // 唯一索引是最终防线;这里先查一次给出干净的 409,而不是等约束抛 DataIntegrityViolation
        if (externalUsers.existsByEmail(email)) {
            throw new BusinessException(409, "auth.email_taken");
        }
        // 公司名可以空着 —— 注册不填，提交订单前补（docs/design/14 §4）
        Organization org = organizations.save(
                new Organization(orgType, trimToNull(req.orgName()), trimToNull(req.country())));
        return externalUsers.save(new ExternalUser(
                org.getId(), email, req.displayName().trim(),
                passwordEncoder.encode(req.password())));
    }

    /**
     * 邮箱已验证后的自助注册（2026-11-14：注册只要「邮箱 + 验证码」）。
     *
     * <p>调用方必须已经校验并消费了验证码 —— 本方法不再看码，只看邮箱。
     * 建号口径：
     * <ul>
     *   <li>组织：客户类型，名字与国家都留空（提交订单前补，docs/design/14 §4）</li>
     *   <li>用户：没有密码（{@code password_hash} 允许为空），只能用验证码登录</li>
     *   <li>显示名：邮箱前缀（需求方 2026-11-14 选定；以后可在设置里改）</li>
     * </ul>
     *
     * @throws BusinessException 409 {@code auth.email_taken}
     */
    @Transactional
    public ExternalUser registerVerifiedEmail(String email) {
        String normalized = normalizeEmail(email);
        if (externalUsers.existsByEmail(normalized)) {
            throw new BusinessException(409, "auth.email_taken");
        }
        Organization org = organizations.save(
                new Organization(Organization.Type.CUSTOMER, null, null));
        int at = normalized.indexOf('@');
        String localPart = at > 0 ? normalized.substring(0, at) : normalized;
        String displayName = localPart.isBlank() ? normalized : localPart;
        return externalUsers.save(new ExternalUser(org.getId(), normalized, displayName, null));
    }

    /**
     * 补自己公司的名字 —— 注册时没填，提交订单前补（docs/design/14 §4）。
     *
     * <p>只改名字。国家、类型、状态都不在这里动：类型决定受众，国家影响合规，
     * 都不是「补个名字」该顺带改的东西。
     */
    @Transactional
    public Organization renameOwnOrganization(UUID orgId, String name) {
        Organization org = organizations.findById(orgId)
                .orElseThrow(() -> new BusinessException(404, "organization.not_found"));
        String trimmed = trimToNull(name);
        if (trimmed == null) {
            // 空名字等于没补，直接拒绝 —— 不要让「补了但补成空」变成一次静默的空操作
            throw new BusinessException(400, "organization.name_required");
        }
        org.setName(trimmed);
        return organizations.save(org);
    }

    @Transactional(readOnly = true)
    public Page<Organization> listOrganizations(Pageable pageable) {
        return organizations.findAll(pageable);
    }

    @Transactional(readOnly = true)
    public Organization getOrganization(UUID id) {
        return organizations.findById(id)
                .orElseThrow(() -> new BusinessException(404, "organization.not_found"));
    }

    /** 某组织的成员(调用方只能传自己的 orgId,§5 铁律 2)。 */
    @Transactional(readOnly = true)
    public Page<ExternalUser> listMembers(UUID orgId, Pageable pageable) {
        return externalUsers.findByOrgId(orgId, pageable);
    }

    static String normalizeEmail(String email) {
        return email == null ? null : email.trim().toLowerCase();
    }

    private static String trimToNull(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
