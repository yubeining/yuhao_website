package com.mfg.platform.identity;

import com.mfg.common.dto.PageQuery;
import com.mfg.common.dto.PagedResponse;
import com.mfg.platform.identity.dto.OrganizationView;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * 运营端:浏览全部组织。挂在 {@code /ops/**} 下,端级闸门保证只有运营 principal 能进。
 * 只读(这轮不做写操作,建/改组织的业务规则未定,§4)。
 */
@RestController
@RequestMapping("/ops/organizations")
public class OpsOrganizationController {

    private final IdentityService identityService;

    public OpsOrganizationController(IdentityService identityService) {
        this.identityService = identityService;
    }

    @GetMapping
    public PagedResponse<OrganizationView> list(PageQuery page) {
        return PagedResponse.of(identityService.listOrganizations(page.toPageable()), OrganizationView::of);
    }

    @GetMapping("/{id}")
    public OrganizationView get(@PathVariable UUID id) {
        return OrganizationView.of(identityService.getOrganization(id));
    }
}
