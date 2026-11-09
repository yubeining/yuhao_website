package com.mfg.platform.identity;

import com.mfg.common.dto.PageQuery;
import com.mfg.common.dto.PagedResponse;
import com.mfg.platform.identity.dto.OrganizationAdminView;
import com.mfg.platform.identity.dto.OrganizationView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * 运营端:浏览与管理组织（公司）。挂在 {@code /ops/**} 下,端级闸门保证只有运营 principal 能进。
 *
 * <p>2026-11-09 之前这里只有读端点,注释写着「建/改组织的业务规则未定,§4」。
 * 现在需求方定了规则,写端点按下面三条实现:
 * <ul>
 *   <li><b>删除 = 禁用</b>:{@code DELETE} 只把 {@code status} 置 {@code DISABLED},不物理删 ——
 *       公司上挂着用户、订单、报价,物理删会留下孤儿数据</li>
 *   <li><b>类型不可改</b>:{@code CUSTOMER ↔ SUPPLIER ↔ INTERNAL} 等于换受众,权限全变</li>
 *   <li>可改的只有名称 / 国家 / 状态</li>
 * </ul>
 */
@RestController
@RequestMapping("/ops/organizations")
public class OpsOrganizationController {

    private final IdentityService identityService;
    private final AccountAdminService accountAdmin;

    public OpsOrganizationController(IdentityService identityService, AccountAdminService accountAdmin) {
        this.identityService = identityService;
        this.accountAdmin = accountAdmin;
    }

    public record CreateOrganization(@NotBlank @Size(max = 20) String type,
                                     @NotBlank @Size(max = 200) String name,
                                     @Size(max = 2) String country) {
    }

    /** 类型刻意不在这里 —— 它不可改。 */
    public record UpdateOrganization(@Size(max = 200) String name,
                                     @Size(max = 2) String country,
                                     @Size(max = 20) String status) {
    }

    @GetMapping
    public PagedResponse<OrganizationAdminView> list(@RequestParam(required = false) String q,
                                                     @RequestParam(required = false) String type,
                                                     PageQuery page) {
        return accountAdmin.listOrganizations(q, type, page);
    }

    @GetMapping("/{id}")
    public OrganizationView get(@PathVariable UUID id) {
        return OrganizationView.of(identityService.getOrganization(id));
    }

    @PostMapping
    public OrganizationAdminView create(@Valid @RequestBody CreateOrganization request) {
        return accountAdmin.createOrganization(request.type(), request.name(), request.country());
    }

    @PatchMapping("/{id}")
    public OrganizationAdminView update(@PathVariable UUID id, @RequestBody UpdateOrganization request) {
        return accountAdmin.updateOrganization(id, request.name(), request.country(), request.status());
    }

    @DeleteMapping("/{id}")
    public OrganizationAdminView disable(@PathVariable UUID id) {
        return accountAdmin.disableOrganization(id);
    }
}
