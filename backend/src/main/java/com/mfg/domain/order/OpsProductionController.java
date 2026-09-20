package com.mfg.domain.order;

import jakarta.validation.Valid;
import jakarta.validation.constraints.PositiveOrZero;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** 运营端：看生产进度、按件数质检、报废件原厂重做。{@code /ops/**} 端级闸门只放 OPERATOR 进来。 */
@RestController
class OpsProductionController {

    private final ProductionService service;

    OpsProductionController(ProductionService service) {
        this.service = service;
    }

    /** 三个数之和必须等于该行件数（服务层判，这里只挡负数）。 */
    public record QcRequest(@PositiveOrZero int pass, @PositiveOrZero int rework, @PositiveOrZero int scrap) {
    }

    /** 已签字之后的供应商订单：生产中 / 待质检 / 已完成。 */
    @GetMapping("/ops/production")
    List<DispatchViews.OpsProductionOrder> list() {
        return service.list();
    }

    @PostMapping("/ops/supplier-orders/{id}/lines/{lineId}/qc")
    DispatchViews.OpsProductionOrder qc(@PathVariable UUID id, @PathVariable UUID lineId,
                                        @Valid @RequestBody QcRequest request) {
        return service.qc(id, lineId, new ProductionService.QcInput(request.pass(), request.rework(),
                request.scrap()));
    }

    /** 报废件补料：本轮只做原厂重做（同一家、不加钱）。 */
    @PostMapping("/ops/supplier-orders/{id}/lines/{lineId}/remake")
    DispatchViews.OpsProductionOrder remake(@PathVariable UUID id, @PathVariable UUID lineId) {
        return service.remake(id, lineId);
    }
}
