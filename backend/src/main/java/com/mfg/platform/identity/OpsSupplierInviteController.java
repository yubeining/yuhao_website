package com.mfg.platform.identity;

import com.mfg.common.security.CurrentUser;
import com.mfg.common.security.UserPrincipal;
import com.mfg.platform.identity.dto.SupplierInviteView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** 运营端：供应商邀请。{@code /ops/**} 端级闸门只放 OPERATOR 进来。 */
@RestController
@RequestMapping("/ops/supplier-invites")
public class OpsSupplierInviteController {

    private final SupplierInviteService service;

    public OpsSupplierInviteController(SupplierInviteService service) {
        this.service = service;
    }

    public record CreateInviteRequest(@NotBlank @Size(max = 200) String orgName,
                                      @NotBlank @Email @Size(max = 200) String email) {
    }

    /** 返回里带一次性的 {@code token}，前端拼成链接给运营复制。之后再也拿不回来。 */
    @PostMapping
    public SupplierInviteView create(@CurrentUser UserPrincipal user, @Valid @RequestBody CreateInviteRequest request) {
        return service.create(user.id(), request.orgName(), request.email());
    }

    /** 新的在前。 */
    @GetMapping
    public List<SupplierInviteView> list() {
        return service.list();
    }

    @PostMapping("/{id}/revoke")
    public SupplierInviteView revoke(@PathVariable UUID id) {
        return service.revoke(id);
    }
}
