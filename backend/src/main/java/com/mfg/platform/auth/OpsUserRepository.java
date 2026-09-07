package com.mfg.platform.auth;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/**
 * 运营员工仓库。登录（企微 / 邮箱密码）做完后由登录服务使用。
 *
 * <p>查询按登录标识取，天然只在运营命名空间里找 —— 外部用户在另一张表，
 * 不可能被这里查到。
 */
public interface OpsUserRepository extends JpaRepository<OpsUser, UUID> {

    Optional<OpsUser> findByEmailIgnoreCase(String email);

    Optional<OpsUser> findByWeworkId(String weworkId);
}
