package com.mfg.domain.order;

import com.mfg.common.dto.PageQuery;
import com.mfg.common.dto.PagedResponse;
import com.mfg.common.security.CurrentUser;
import com.mfg.common.security.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 客户端：订单。全部在 {@code /customer/**} 下，端级闸门按路径前缀只放 CUSTOMER 进来。
 * 租户 id 一律取自 principal，不从路径或请求体收（§3 铁律 3）。
 */
@RestController
class CustomerOrderController {

    private final CustomerOrderService service;

    CustomerOrderController(CustomerOrderService service) {
        this.service = service;
    }

    /**
     * 订单上的收货地址（订单自己的一份，2026-11-27：可以直接改，不连地址簿）。
     * 必填项和地址簿一样：国家（ISO 两位大写）、公司、收货人、电话、地址行 1、城市。
     */
    public record ShipToFields(@NotBlank @Pattern(regexp = "[A-Z]{2}") String country,
                               @NotBlank @Size(max = 200) String company,
                               @NotBlank @Size(max = 200) String contact,
                               @NotBlank @Size(max = 50) String phone,
                               @NotBlank @Size(max = 200) String line1,
                               @Size(max = 200) String line2,
                               @NotBlank @Size(max = 100) String city,
                               @Size(max = 100) String region,
                               @Size(max = 20) String postalCode) {
        ShipTo toShipTo() {
            return new ShipTo(country, company.trim(), contact.trim(), phone.trim(), line1.trim(), blankToNull(line2),
                    city.trim(), blankToNull(region), blankToNull(postalCode));
        }
    }

    /**
     * 整张保存里的一行。{@code id} 为空 = 新加的行；带 id = 已有的行，按这次的内容整体替换。
     * 草稿里图号 / 名称 / 数量都可以空着（2026-11-27），提交时才检查；填了的数量必须是正整数。
     * {@code removeFileIds}：这一行要删的图纸，随这次保存一起删。
     */
    public record LineRequest(UUID id,
                              @Size(max = 200) String code,
                              @Size(max = 200) String name,
                              @Positive Integer quantity,
                              @Size(max = 200) String material,
                              @Size(max = 200) String surfaceTreatment,
                              @Size(max = 50) String customerRev,
                              List<@NotNull UUID> removeFileIds) {
        CustomerOrderService.DraftLine toDraftLine() {
            return new CustomerOrderService.DraftLine(id, code, name, quantity, material, surfaceTreatment, customerRev,
                    removeFileIds == null ? List.of() : removeFileIds);
        }
    }

    /**
     * 整张订单（2026-11-27：订单页整页编辑，一次保存）。★ 整体替换：没带的字段清空，没带的已有行删掉。
     * {@code lines} 不传等于空列表。
     */
    public record SaveOrderRequest(@Size(max = 200) String title,
                                   LocalDate wantedDate,
                                   @Valid ShipToFields shipTo,
                                   List<@NotNull @Valid LineRequest> lines) {
        CustomerOrderService.Draft toDraft() {
            return new CustomerOrderService.Draft(title, wantedDate, shipTo == null ? null : shipTo.toShipTo(),
                    lines == null ? List.of() : lines.stream().map(LineRequest::toDraftLine).toList());
        }
    }

    /** 新建：第一次保存才建单（2026-11-27），名称、交期、地址、零件一起进一个事务。 */
    @PostMapping("/customer/orders")
    SavedOrderView create(@CurrentUser UserPrincipal user, @Valid @RequestBody SaveOrderRequest request) {
        return service.create(user.partyId(), user.id(), request.toDraft());
    }

    /** 新建的排在前面。排序由后端定，不从请求收。 */
    @GetMapping("/customer/orders")
    PagedResponse<OrderSummaryView> list(@CurrentUser UserPrincipal user, PageQuery page) {
        return service.list(user.partyId(), page.toPageable(Sort.by(Sort.Direction.DESC, "createdAt")));
    }

    @GetMapping("/customer/orders/{orderId}")
    OrderView get(@CurrentUser UserPrincipal user, @PathVariable UUID orderId) {
        return service.get(user.partyId(), orderId);
    }

    /** 保存草稿：整张替换，一个事务。只有草稿能存。 */
    @PutMapping("/customer/orders/{orderId}")
    SavedOrderView save(@CurrentUser UserPrincipal user, @PathVariable UUID orderId,
                        @Valid @RequestBody SaveOrderRequest request) {
        return service.save(user.partyId(), user.id(), orderId, request.toDraft());
    }

    /** 提交以后单独改收货地址（订单就绪 READY 之前都能改）。草稿走整张保存。 */
    @PutMapping("/customer/orders/{orderId}/ship-to")
    OrderView updateShipTo(@CurrentUser UserPrincipal user, @PathVariable UUID orderId,
                           @Valid @RequestBody ShipToFields r) {
        return service.updateShipTo(user.partyId(), orderId, r.toShipTo());
    }

    @PostMapping("/customer/orders/{orderId}/submit")
    OrderView submit(@CurrentUser UserPrincipal user, @PathVariable UUID orderId) {
        return service.submit(user.partyId(), orderId);
    }

    /** 删除草稿（真删）。只有 DRAFT 能删；提交之后客户没有删除/取消权限。 */
    @DeleteMapping("/customer/orders/{orderId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteDraft(@CurrentUser UserPrincipal user, @PathVariable UUID orderId) {
        service.deleteDraft(user.partyId(), orderId);
    }

    @PostMapping("/customer/orders/{orderId}/cancel")
    OrderView cancel(@CurrentUser UserPrincipal user, @PathVariable UUID orderId) {
        return service.cancel(user.partyId(), orderId);
    }

    @GetMapping("/customer/orders/{orderId}/lines/{lineId}/files/{fileId}/view-url")
    ViewUrl lineFileViewUrl(@CurrentUser UserPrincipal user, @PathVariable UUID orderId, @PathVariable UUID lineId,
                            @PathVariable UUID fileId) {
        return service.lineFileViewUrl(user.partyId(), user.id(), user.partyType(), orderId, lineId, fileId);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
