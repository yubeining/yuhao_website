package com.mfg.platform.fx;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 运营端：查看最近一次拉到的汇率。{@code /ops/**} 端级闸门只放 OPERATOR 进来。 */
@RestController
class OpsFxRateController {

    private final FxRateService service;

    OpsFxRateController(FxRateService service) {
        this.service = service;
    }

    @GetMapping("/ops/fx-rates/latest")
    List<FxRateView> latest() {
        return service.latestEcbRates();
    }
}
