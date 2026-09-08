package com.mfg.platform.auth;

import com.mfg.common.exception.BusinessException;
import com.mfg.common.security.PartyType;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 认证分支的单测 —— mock 掉三张用户表的仓库，只验逻辑（哪个表、端匹配、失败一律 bad_credentials）。
 * 真库真 Redis 的端到端登录/刷新在 RefreshTokenServiceIT 和手工验证里覆盖。
 */
class AuthServiceTest {

    private final OpsUserRepository opsUsers = mock(OpsUserRepository.class);
    private final PartyUserRepository partyUsers = mock(PartyUserRepository.class);
    private final PartyRepository parties = mock(PartyRepository.class);
    private final PasswordEncoder encoder = mock(PasswordEncoder.class);
    private final AuthService auth = new AuthService(opsUsers, partyUsers, parties, encoder);

    // ---------- 运营 ----------

    @Test
    void opsLoginSucceeds() {
        OpsUser ops = mock(OpsUser.class);
        when(ops.getStatus()).thenReturn(OpsUser.Status.ACTIVE);
        when(ops.getPasswordHash()).thenReturn("hash");
        when(ops.getEmail()).thenReturn("ops@x.com");
        when(ops.getDisplayName()).thenReturn("Ops");
        when(opsUsers.findByEmailIgnoreCase("ops@x.com")).thenReturn(Optional.of(ops));
        when(encoder.matches("pw", "hash")).thenReturn(true);

        AuthService.Authenticated result = auth.authenticate(PartyType.OPERATOR, "ops@x.com", "pw");

        assertThat(result.principal().partyType()).isEqualTo(PartyType.OPERATOR);
        assertThat(result.principal().partyId()).isNull();  // 运营无 partyId（D23）
        assertThat(result.displayName()).isEqualTo("Ops");
    }

    @Test
    void opsWrongPasswordIsBadCredentials() {
        OpsUser ops = mock(OpsUser.class);
        when(ops.getStatus()).thenReturn(OpsUser.Status.ACTIVE);
        when(ops.getPasswordHash()).thenReturn("hash");
        when(opsUsers.findByEmailIgnoreCase(any())).thenReturn(Optional.of(ops));
        when(encoder.matches(any(), any())).thenReturn(false);

        assertBadCredentials(() -> auth.authenticate(PartyType.OPERATOR, "ops@x.com", "wrong"));
    }

    @Test
    void opsUnknownAccountIsBadCredentials() {
        when(opsUsers.findByEmailIgnoreCase(any())).thenReturn(Optional.empty());
        assertBadCredentials(() -> auth.authenticate(PartyType.OPERATOR, "nobody@x.com", "pw"));
    }

    // ---------- 外部 ----------

    @Test
    void customerLoginSucceedsWhenPartyTypeMatches() {
        PartyUser user = externalUser("cust@x.com", "ADMIN");
        Party party = party("CUSTOMER", "ACTIVE");
        when(partyUsers.findByEmailIgnoreCase("cust@x.com")).thenReturn(Optional.of(user));
        when(encoder.matches("pw", "hash")).thenReturn(true);
        when(parties.findById(any())).thenReturn(Optional.of(party));

        AuthService.Authenticated result = auth.authenticate(PartyType.CUSTOMER, "cust@x.com", "pw");

        assertThat(result.principal().partyType()).isEqualTo(PartyType.CUSTOMER);
        assertThat(result.principal().partyId()).isNotNull();
        assertThat(result.principal().roles()).containsExactly("ADMIN");
    }

    @Test
    void customerAccountOnSupplierPortalIsRejected() {
        PartyUser user = externalUser("cust@x.com", "ADMIN");
        Party party = party("CUSTOMER", "ACTIVE");
        when(partyUsers.findByEmailIgnoreCase("cust@x.com")).thenReturn(Optional.of(user));
        when(encoder.matches(any(), any())).thenReturn(true);
        when(parties.findById(any())).thenReturn(Optional.of(party));

        // 用供应商端登客户账号 → party.type 不匹配 → bad_credentials
        assertBadCredentials(() -> auth.authenticate(PartyType.SUPPLIER, "cust@x.com", "pw"));
    }

    @Test
    void suspendedPartyIsRejected() {
        PartyUser user = externalUser("cust@x.com", "ADMIN");
        Party party = party("CUSTOMER", "SUSPENDED");
        when(partyUsers.findByEmailIgnoreCase(any())).thenReturn(Optional.of(user));
        when(encoder.matches(any(), any())).thenReturn(true);
        when(parties.findById(any())).thenReturn(Optional.of(party));

        assertBadCredentials(() -> auth.authenticate(PartyType.CUSTOMER, "cust@x.com", "pw"));
    }

    @Test
    void lookupFallsBackToPhone() {
        PartyUser user = externalUser(null, "MEMBER");
        Party party = party("SUPPLIER", "ACTIVE");
        when(partyUsers.findByEmailIgnoreCase("13800000000")).thenReturn(Optional.empty());
        when(partyUsers.findByPhone("13800000000")).thenReturn(Optional.of(user));
        when(encoder.matches(any(), any())).thenReturn(true);
        when(parties.findById(any())).thenReturn(Optional.of(party));

        AuthService.Authenticated result = auth.authenticate(PartyType.SUPPLIER, "13800000000", "pw");
        assertThat(result.principal().partyType()).isEqualTo(PartyType.SUPPLIER);
    }

    // ---------- helpers ----------

    private PartyUser externalUser(String email, String role) {
        PartyUser user = mock(PartyUser.class);
        when(user.getStatus()).thenReturn("ACTIVE");
        when(user.getPasswordHash()).thenReturn("hash");
        when(user.getEmail()).thenReturn(email);
        when(user.getPartyId()).thenReturn(UUID.randomUUID());
        when(user.getDisplayName()).thenReturn("User");
        when(user.getLocale()).thenReturn("en");
        when(user.getRole()).thenReturn(role);
        return user;
    }

    private Party party(String type, String status) {
        Party party = mock(Party.class);
        when(party.getType()).thenReturn(type);
        when(party.getStatus()).thenReturn(status);
        return party;
    }

    private void assertBadCredentials(org.assertj.core.api.ThrowableAssert.ThrowingCallable call) {
        assertThatThrownBy(call)
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getMessageCode()).isEqualTo("auth.bad_credentials"));
    }
}
