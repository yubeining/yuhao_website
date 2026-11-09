package com.mfg.platform.identity;

import com.mfg.common.dto.PageQuery;
import com.mfg.common.dto.PagedResponse;
import com.mfg.platform.identity.dto.AccountView;
import com.mfg.platform.identity.dto.StaffView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * 运营端账号管理：外部用户（{@code /ops/users}）与运营账号（{@code /ops/staff}）。
 *
 * <p>挂在 {@code /ops/**} 下，端级闸门保证只有 OPERATOR 能进（CLAUDE.md §3）。
 *
 * <h3>删除 = 禁用</h3>
 * <p>{@code DELETE} 不物理删数据，只把 {@code status} 置 {@code DISABLED} —— 账号上挂着订单、
 * 报价、图纸，物理删会留下孤儿数据。这也是 2026-11-09 需求方定下的口径。
 *
 * <h3>为什么外部用户和运营账号分成两组路径</h3>
 * <p>它们来自两张物理隔离的表（{@code external_user} / {@code ops_user}），
 * 受众也完全不同。合成一个 {@code /ops/accounts} 会让「这条记录属于哪类账号」
 * 只能靠一个 type 字段猜，而两类账号的字段集本来就不同。
 */
@RestController
class OpsAccountController {

    private final AccountAdminService service;

    OpsAccountController(AccountAdminService service) {
        this.service = service;
    }

    // ---------- 外部用户 ----------

    public record CreateExternalUser(@NotNull UUID orgId,
                                     @NotBlank @Email @Size(max = 320) String email,
                                     @NotBlank @Size(max = 100) String displayName,
                                     @NotBlank @Size(min = 8, max = 100) String password,
                                     @Size(max = 20) String locale) {
    }

    /** 邮箱与所属公司刻意不在这里 —— 它们不可改（2026-11-09 决定）。 */
    public record UpdateExternalUser(@Size(max = 100) String displayName,
                                     @Size(max = 20) String locale,
                                     @Size(max = 20) String status) {
    }

    @GetMapping("/ops/users")
    PagedResponse<AccountView> listUsers(@RequestParam(required = false) String q, PageQuery page) {
        return service.listExternalUsers(q, page);
    }

    @GetMapping("/ops/users/{id}")
    AccountView getUser(@PathVariable UUID id) {
        return service.getExternalUser(id);
    }

    @GetMapping("/ops/organizations/{orgId}/users")
    PagedResponse<AccountView> listOrgUsers(@PathVariable UUID orgId, PageQuery page) {
        return service.listExternalUsersOfOrg(orgId, page);
    }

    @PostMapping("/ops/users")
    AccountView createUser(@Valid @RequestBody CreateExternalUser request) {
        return service.createExternalUser(request.orgId(), request.email(), request.displayName(),
                request.password(), request.locale());
    }

    @PatchMapping("/ops/users/{id}")
    AccountView updateUser(@PathVariable UUID id, @RequestBody UpdateExternalUser request) {
        return service.updateExternalUser(id, request.displayName(), request.locale(), request.status());
    }

    @DeleteMapping("/ops/users/{id}")
    AccountView disableUser(@PathVariable UUID id) {
        return service.disableExternalUser(id);
    }

    // ---------- 运营账号 ----------

    public record CreateStaff(@NotNull UUID orgId,
                              @NotBlank @Email @Size(max = 320) String email,
                              @NotBlank @Size(max = 100) String displayName,
                              @NotBlank @Size(min = 8, max = 100) String password,
                              @Size(max = 20) String locale) {
    }

    public record UpdateStaff(@Size(max = 100) String displayName,
                              @Size(max = 20) String locale,
                              @Size(max = 20) String status) {
    }

    @GetMapping("/ops/staff")
    PagedResponse<StaffView> listStaff(@RequestParam(required = false) String q, PageQuery page) {
        return service.listStaff(q, page);
    }

    @GetMapping("/ops/staff/{id}")
    StaffView getStaff(@PathVariable UUID id) {
        return service.getStaff(id);
    }

    /**
     * 建运营账号。★ 目前没有任何角色校验 —— 任何运营都能建（2026-11-09 决定）。
     * 这是已知的提权通道，等 ADMIN 角色落地时收口。
     */
    @PostMapping("/ops/staff")
    StaffView createStaff(@Valid @RequestBody CreateStaff request) {
        return service.createStaff(request.orgId(), request.email(), request.displayName(),
                request.password(), request.locale());
    }

    @PatchMapping("/ops/staff/{id}")
    StaffView updateStaff(@PathVariable UUID id, @RequestBody UpdateStaff request) {
        return service.updateStaff(id, request.displayName(), request.locale(), request.status());
    }

    @DeleteMapping("/ops/staff/{id}")
    StaffView disableStaff(@PathVariable UUID id) {
        return service.disableStaff(id);
    }
}
