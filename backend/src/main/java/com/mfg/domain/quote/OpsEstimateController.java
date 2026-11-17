package com.mfg.domain.quote;

import com.mfg.common.security.CurrentUser;
import com.mfg.common.security.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/** 运营端：AI 成本估算 + 费率表。{@code /ops/**} 端级闸门只放 OPERATOR 进来。 */
@RestController
class OpsEstimateController {

    private final EstimateService estimates;
    private final CostRateService rates;

    OpsEstimateController(EstimateService estimates, CostRateService rates) {
        this.estimates = estimates;
        this.rates = rates;
    }

    /** 费率：同类别下名称唯一；单价 CNY，大于 0，最多 2 位小数。 */
    public record CostRateRequest(@NotNull @Pattern(regexp = "MATERIAL|PROCESS|OUTSOURCE") String kind,
                                  @NotBlank @Size(max = 200) String name,
                                  @NotNull @Pattern(regexp = "KG|HOUR|PIECE|BATCH") String unit,
                                  @NotNull @DecimalMin(value = "0", inclusive = false)
                                  @Digits(integer = 10, fraction = 2) BigDecimal unitPriceCny,
                                  @Size(max = 500) String note) {

        CostRateService.Input input() {
            return new CostRateService.Input(CostRate.Kind.valueOf(kind), name, CostRate.Unit.valueOf(unit),
                    unitPriceCny, note);
        }
    }

    @PostMapping("/ops/customer-orders/{orderId}/lines/{lineId}/estimates")
    PriceEstimateView estimate(@CurrentUser UserPrincipal user, @PathVariable UUID orderId,
                               @PathVariable UUID lineId) {
        return estimates.estimate(user.id(), user.partyId(), orderId, lineId);
    }

    /** 每一行最新的一次估算；没估过的行不在结果里。 */
    @GetMapping("/ops/customer-orders/{orderId}/estimates")
    List<PriceEstimateView> latest(@PathVariable UUID orderId) {
        return estimates.latest(orderId);
    }

    @GetMapping("/ops/cost-rates")
    List<CostRateView> listRates() {
        return rates.list();
    }

    @PostMapping("/ops/cost-rates")
    CostRateView createRate(@Valid @RequestBody CostRateRequest request) {
        return rates.create(request.input());
    }

    @PutMapping("/ops/cost-rates/{id}")
    CostRateView updateRate(@PathVariable UUID id, @Valid @RequestBody CostRateRequest request) {
        return rates.update(id, request.input());
    }

    @DeleteMapping("/ops/cost-rates/{id}")
    void deleteRate(@PathVariable UUID id) {
        rates.delete(id);
    }
}
