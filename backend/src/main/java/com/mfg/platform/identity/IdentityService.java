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
     * 外部自助注册:建组织 + 首个用户,立即 ACTIVE。
     *
     * @throws BusinessException 400 {@code auth.register_portal_invalid}(传了 OPERATOR)
     *                          / 409 {@code auth.email_taken}
     */
    @Transactional
    public ExternalUser register(RegisterRequest req) {
        Organization.Type orgType = switch (req.portalType()) {
            case CUSTOMER -> Organization.Type.CUSTOMER;
            case SUPPLIER -> Organization.Type.SUPPLIER;
            case OPERATOR -> throw new BusinessException(400, "auth.register_portal_invalid");
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
