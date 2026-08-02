package com.mfg.platform.auth;

import com.mfg.common.security.CurrentUser;
import com.mfg.common.security.UserPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * 返回当前 principal。三个端各一份，路径不同、实现相同。
 *
 * <h3>为什么要写三遍而不是一个 {@code /whoami}</h3>
 *
 * <p>因为<b>路径前缀即受众</b>。写成一个共用的 {@code /whoami}，
 * 它就不在任何一个端的管辖之下，{@code PortalGuardInterceptor} 不会管它 ——
 * 于是它成了三个端的公共入口，也就成了「这个模式有例外」的第一个先例。
 *
 * <p>本系统里凡是「客户端和供应商端都要」的接口，都必须各写一份。
 * 重复三行代码，换来的是<b>任何一个端点的受众都能从 URL 直接读出来</b>，
 * 不用去翻实现。跨端泄露是头号风险，这个代价是划算的。
 *
 * <p>前端 {@code PortalProbe} 会拿同一个 token 依次敲这三个路径 ——
 * 自己的端 200，另外两个 403。这是端级隔离的活体验证。
 */
@RestController
public class WhoAmIController {

    /**
     * @param userId    用户 id
     * @param partyId   所属交易方 id
     * @param partyType 交易方类型
     * @param roles     端内角色
     */
    public record WhoAmIResponse(UUID userId, UUID partyId, String partyType, List<String> roles) {

        static WhoAmIResponse of(UserPrincipal p) {
            return new WhoAmIResponse(p.id(), p.partyId(), p.partyType().name(), List.copyOf(p.roles()));
        }
    }

    @GetMapping("/customer/whoami")
    public WhoAmIResponse customer(@CurrentUser UserPrincipal principal) {
        return WhoAmIResponse.of(principal);
    }

    @GetMapping("/supplier/whoami")
    public WhoAmIResponse supplier(@CurrentUser UserPrincipal principal) {
        return WhoAmIResponse.of(principal);
    }

    @GetMapping("/ops/whoami")
    public WhoAmIResponse ops(@CurrentUser UserPrincipal principal) {
        return WhoAmIResponse.of(principal);
    }
}
