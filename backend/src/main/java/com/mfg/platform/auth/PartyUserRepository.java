package com.mfg.platform.auth;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface PartyUserRepository extends JpaRepository<PartyUser, UUID> {

    Optional<PartyUser> findByEmailIgnoreCase(String email);

    Optional<PartyUser> findByPhone(String phone);
}
