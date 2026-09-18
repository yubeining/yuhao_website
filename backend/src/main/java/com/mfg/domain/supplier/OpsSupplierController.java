package com.mfg.domain.supplier;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/** 运营端：供应商列表、折率、能力。{@code /ops/**} 端级闸门只放 OPERATOR 进来。 */
@RestController
class OpsSupplierController {

    private final SupplierProfileService service;

    OpsSupplierController(SupplierProfileService service) {
        this.service = service;
    }

    /** 折率：大于 0，最多 4 位小数（列是 numeric(8,4)）。0.8 = 对供价乘 0.8。 */
    public record DiscountRequest(@NotNull @DecimalMin(value = "0", inclusive = false)
                                  @Digits(integer = 4, fraction = 4) BigDecimal discountRate) {
    }

    /** 自由文本，每项最多 500 字；整体替换。 */
    public record CapabilityRequest(@Size(max = 500) String processes, @Size(max = 500) String materials,
                                    @Size(max = 500) String sizeRange, @Size(max = 500) String precisionGrade) {
    }

    /** 新入驻的在前。 */
    @GetMapping("/ops/suppliers")
    List<SupplierView> list() {
        return service.list();
    }

    @PutMapping("/ops/suppliers/{orgId}/discount")
    SupplierView setDiscount(@PathVariable UUID orgId, @Valid @RequestBody DiscountRequest request) {
        return service.setDiscount(orgId, request.discountRate());
    }

    @PutMapping("/ops/suppliers/{orgId}/capability")
    SupplierView setCapability(@PathVariable UUID orgId, @Valid @RequestBody CapabilityRequest request) {
        return service.setCapability(orgId, request.processes(), request.materials(), request.sizeRange(),
                request.precisionGrade());
    }
}
