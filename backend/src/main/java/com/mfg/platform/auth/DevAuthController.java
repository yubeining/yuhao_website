package com.mfg.platform.auth;

import com.mfg.common.security.PartyType;
import com.mfg.common.security.UserPrincipal;
import jakarta.annotation.PostConstruct;
import jakarta.validation.constraints.NotNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Set;
import java.util.UUID;

/**
 * ★★★ 开发专用登录 —— 给任意端签一个 token，不校验任何凭据。
 *
 * <h3>这是一个后门。默认关闭，上线前必须删除。</h3>
 *
 * <p>启用条件：{@code app.auth.dev-login.enabled=true}（默认 false，不配就是关）。
 * 关闭时这个 bean 根本不存在，路径返回 404 —— 不是「返回 403」，是「不存在」。
 *
 * <p><b>为什么存在</b>：三端真实登录方式各不相同（客户邮箱密码 / 供应商手机验证码 /
 * 内部企微扫码），都还没做。没有它就没法验证端级隔离、参数解析器、
 * response 外壳这些已经写好的东西是否真的工作 —— 而这些恰恰是最该早验证的部分。
 *
 * <p><b>为什么危险</b>：任何人 POST 一下就能拿到 OPERATOR token，
 * 也就是内部后台的完全访问权。一旦在生产环境启用，
 * 前面所有的隔离设计（端级闸门、数据隔离六条铁律、白名单序列化）全部作废 ——
 * 攻击者根本不需要越权，他直接就是管理员。
 *
 * <p><b>删除时机</b>：{@code platform/auth} 下真实登录接口完成的那个 PR，
 * 同一个 PR 删掉本文件和前端的 {@code services/auth.ts#devLogin}。
 * 不要留着「以防万一」—— 留下的后门最后都会被启用。
 */
@RestController
@ConditionalOnProperty(name = "app.auth.dev-login.enabled", havingValue = "true")
public class DevAuthController {

    private static final Logger log = LoggerFactory.getLogger(DevAuthController.class);

    /** ops 端给 ADMIN，这样 AccessInterceptor 不用去查 access_grant 表就能放行。 */
    private static final Set<String> OPERATOR_ROLES = Set.of("ADMIN");
    private static final Set<String> PORTAL_ROLES = Set.of("ADMIN");

    private final JwtService jwtService;

    public DevAuthController(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @PostConstruct
    void warnLoudly() {
        log.warn("=======================================================================");
        log.warn("DEV LOGIN IS ENABLED. Anyone can mint an OPERATOR token via");
        log.warn("POST /auth/dev-login. This must NEVER be enabled outside local dev.");
        log.warn("Delete DevAuthController together with the real login endpoints.");
        log.warn("=======================================================================");
    }

    public record DevLoginRequest(@NotNull PartyType partyType) {
    }

    /**
     * @param accessToken JWT
     * @param partyType   交易方类型，前端据此决定落地页
     * @param displayName 展示名
     * @param locale      界面语言
     */
    public record DevLoginResponse(String accessToken, String partyType,
                                   String displayName, String locale) {
    }

    /**
     * 签一个指定端的 token。
     *
     * <p><b>★ 每次调用生成新的随机 userId / partyId</b>，且这两个 id
     * 在数据库里<b>并不存在</b>。这是刻意的：
     * 一旦某个接口开始真的按 partyId 查数据，它会立刻返回空 ——
     * 那正是提醒你「该做真实登录了」的信号，而不是让假身份悄悄混过去。
     */
    @PostMapping("/auth/dev-login")
    public DevLoginResponse devLogin(@RequestBody DevLoginRequest request) {
        PartyType partyType = request.partyType();
        UserPrincipal principal = new UserPrincipal(
                UUID.randomUUID(),
                UUID.randomUUID(),
                partyType,
                "dev@example.com",
                "zh",
                partyType == PartyType.OPERATOR ? OPERATOR_ROLES : PORTAL_ROLES);

        log.warn("dev login issued for partyType={}", partyType);

        return new DevLoginResponse(
                jwtService.issueAccessToken(principal),
                partyType.name(),
                "dev-" + partyType.name().toLowerCase(),
                "zh");
    }
}
