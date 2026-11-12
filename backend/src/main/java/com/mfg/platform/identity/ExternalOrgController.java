package com.mfg.platform.identity;

import com.mfg.common.dto.PageQuery;
import com.mfg.common.dto.PagedResponse;
import com.mfg.common.security.CurrentParty;
import com.mfg.platform.identity.dto.OrganizationView;
import com.mfg.platform.identity.dto.UserView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * 外部端:看<b>自己公司</b>的信息 + 本公司成员。客户和供应商行为一致,一个 handler 映射到两条路径 ——
 * 各自的端级闸门保证只有对应受众能进,{@link CurrentParty} 注入调用方自己的 orgId。
 *
 * <p><b>租户隔离靠 orgId 来自 principal,不来自路径参数</b>(§3/§5):调用方只能看到自己那家公司,
 * 传不了别家的 id。
 */
@RestController
public class ExternalOrgController {

    private final IdentityService identityService;

    public ExternalOrgController(IdentityService identityService) {
        this.identityService = identityService;
    }

    @GetMapping({"/customer/organization", "/supplier/organization"})
    public OrganizationView myOrganization(@CurrentParty UUID orgId) {
        return OrganizationView.of(identityService.getOrganization(orgId));
    }

    /**
     * 补公司名。只有客户端有这条路 —— 供应商的公司名是运营在发邀请时给的，
     * 自助改名的规则还没定（docs/design/14 Q8 附近）。
     */
    @PatchMapping("/customer/organization")
    public OrganizationView rename(@CurrentParty UUID orgId,
                                   @Valid @RequestBody RenameRequest request) {
        return OrganizationView.of(identityService.renameOwnOrganization(orgId, request.name()));
    }

    public record RenameRequest(@NotBlank @Size(max = 200) String name) {
    }

    @GetMapping({"/customer/organization/members", "/supplier/organization/members"})
    public PagedResponse<UserView> myMembers(@CurrentParty UUID orgId, PageQuery page) {
        return PagedResponse.of(identityService.listMembers(orgId, page.toPageable()), UserView::of);
    }
}
