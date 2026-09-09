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
     * <p>待确认:客户注册后<b>立即 ACTIVE</b> 这件事没有出处。文档 2 §4 写的是
     * 「官网自助注册 → 人工审核激活」,文档 5 Q2 写的是「可浏览/询价,
     * <b>首次下单前必须人工完成 KYC + 条款签署</b>」。当前实现是注册完直接能登。
     * 下单功能还没建,所以暂不改动,但建之前必须先把这道闸门定下来。
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
        Organization org = organizations.save(
                new Organization(orgType, req.orgName().trim(), trimToNull(req.country())));
        return externalUsers.save(new ExternalUser(
                org.getId(), email, req.displayName().trim(),
                passwordEncoder.encode(req.password())));
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
