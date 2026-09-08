package com.mfg.platform.auth;

import com.mfg.common.exception.BusinessException;
import com.mfg.common.security.PartyType;
import org.junit.jupiter.api.Test;
import com.mfg.support.AbstractIntegrationTest;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Refresh token 对着<b>真实 Redis</b> 的测试（§9）：签发、轮换、旧的作废、撤销。
 */
class RefreshTokenServiceIT extends AbstractIntegrationTest {

    @Autowired
    private RefreshTokenService refreshTokens;

    @Test
    void issueThenRotateInvalidatesTheOldToken() {
        UUID userId = UUID.randomUUID();
        String token = refreshTokens.issue(PartyType.OPERATOR, userId);

        RefreshTokenService.Rotation rotation = refreshTokens.rotate(token);

        // 解出的身份正确
        assertThat(rotation.resolved().portal()).isEqualTo(PartyType.OPERATOR);
        assertThat(rotation.resolved().userId()).isEqualTo(userId);
        // 换了一个新 token
        assertThat(rotation.newToken()).isNotBlank().isNotEqualTo(token);
        // 旧 token 立即作废
        assertThatThrownBy(() -> refreshTokens.rotate(token)).isInstanceOf(BusinessException.class);
        // 新 token 可用
        assertThat(refreshTokens.rotate(rotation.newToken()).resolved().userId()).isEqualTo(userId);
    }

    @Test
    void revokeMakesTokenUnusable() {
        String token = refreshTokens.issue(PartyType.CUSTOMER, UUID.randomUUID());
        refreshTokens.revoke(token);
        assertThatThrownBy(() -> refreshTokens.rotate(token)).isInstanceOf(BusinessException.class);
    }

    @Test
    void unknownTokenIsRejected() {
        assertThatThrownBy(() -> refreshTokens.rotate("does-not-exist"))
                .isInstanceOf(BusinessException.class);
    }
}
