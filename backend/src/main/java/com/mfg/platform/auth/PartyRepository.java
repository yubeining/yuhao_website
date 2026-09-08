package com.mfg.platform.auth;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface PartyRepository extends JpaRepository<Party, UUID> {
}
