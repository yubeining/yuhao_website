package com.mfg.domain.address;

import com.mfg.common.security.CurrentUser;
import com.mfg.common.security.UserPrincipal;
import com.mfg.platform.ratelimit.RateLimit;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * 客户端：我的收货地址簿（账号设置页）。所有者一律取自 principal，不从请求收（§3 铁律 3）。
 */
@RestController
class CustomerShippingAddressController {

    /**
     * 字段和长度上限照订单上的收货地址（{@code CustomerOrderController} 原来的 ShipToRequest）。
     * {@code makeDefault} 可空，空 = false。
     */
    public record AddressRequest(@NotBlank @Pattern(regexp = "[A-Z]{2}") String country,
                                 @NotBlank @Size(max = 200) String company,
                                 @NotBlank @Size(max = 200) String contact,
                                 @NotBlank @Size(max = 50) String phone,
                                 @NotBlank @Size(max = 200) String line1,
                                 @Size(max = 200) String line2,
                                 @NotBlank @Size(max = 100) String city,
                                 @Size(max = 100) String region,
                                 @Size(max = 20) String postalCode,
                                 Boolean makeDefault) {

        AddressInfo info() {
            return new AddressInfo(country, company, contact, phone, line1, line2, city, region, postalCode);
        }

        boolean wantsDefault() {
            return Boolean.TRUE.equals(makeDefault);
        }
    }

    /** 智能粘贴的原文。1000 字够放一整段地址加联系人，再长就不是一条地址了。 */
    public record ParseRequest(@NotBlank @Size(max = 1000) String text) {
    }

    private final ShippingAddressService service;
    private final AddressParser parser;

    CustomerShippingAddressController(ShippingAddressService service, AddressParser parser) {
        this.service = service;
        this.parser = parser;
    }

    @GetMapping("/customer/shipping-addresses")
    List<ShippingAddressView> list(@CurrentUser UserPrincipal user) {
        return service.list(user.id());
    }

    @PostMapping("/customer/shipping-addresses")
    ShippingAddressView create(@CurrentUser UserPrincipal user, @Valid @RequestBody AddressRequest r) {
        return service.create(user.id(), r.info(), r.wantsDefault());
    }

    /** ★ 整体替换：没带的选填项会被清空。 */
    @PutMapping("/customer/shipping-addresses/{addressId}")
    ShippingAddressView update(@CurrentUser UserPrincipal user, @PathVariable UUID addressId,
                               @Valid @RequestBody AddressRequest r) {
        return service.update(user.id(), addressId, r.info(), r.wantsDefault());
    }

    @DeleteMapping("/customer/shipping-addresses/{addressId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@CurrentUser UserPrincipal user, @PathVariable UUID addressId) {
        service.delete(user.id(), addressId);
    }

    /**
     * 智能粘贴：拆成表单字段返回，不保存（2026-11-26 P2）。每次都调外部 AI、按次计费，所以按用户限流：
     * 每人每小时 30 次 —— 工程取值，正常填地址一次一两下，30 次只拦脚本。
     */
    @PostMapping("/customer/shipping-addresses/parse")
    @RateLimit(scope = "address-parse", key = "#user.id().toString()", limit = "30", windowSeconds = "3600")
    ParsedAddressView parse(@CurrentUser UserPrincipal user, @Valid @RequestBody ParseRequest r) {
        return parser.parse(r.text().trim());
    }

    @PostMapping("/customer/shipping-addresses/{addressId}/default")
    ShippingAddressView makeDefault(@CurrentUser UserPrincipal user, @PathVariable UUID addressId) {
        return service.makeDefault(user.id(), addressId);
    }
}
