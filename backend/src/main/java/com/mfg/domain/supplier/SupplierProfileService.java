package com.mfg.domain.supplier;

import com.mfg.common.exception.BusinessException;
import com.mfg.platform.identity.Organization;
import com.mfg.platform.identity.OrganizationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/** 运营录供应商折率和能力；对订单域、报价域提供 {@link SupplierDirectory}。 */
@Service
class SupplierProfileService implements SupplierDirectory {

    private final SupplierProfileRepository profiles;
    private final OrganizationRepository organizations;

    SupplierProfileService(SupplierProfileRepository profiles, OrganizationRepository organizations) {
        this.profiles = profiles;
        this.organizations = organizations;
    }

    // ---------- 运营 ----------

    @Transactional(readOnly = true)
    public List<SupplierView> list() {
        List<Organization> suppliers = organizations.findByTypeOrderByCreatedAtDesc(Organization.Type.SUPPLIER);
        Map<UUID, SupplierProfile> byOrg = profilesOf(suppliers);
        return suppliers.stream().map(o -> view(o, byOrg.get(o.getId()))).toList();
    }

    @Transactional
    public SupplierView setDiscount(UUID supplierOrgId, BigDecimal discountRate) {
        Organization org = requireSupplier(supplierOrgId);
        profiles.upsertDiscount(UUID.randomUUID(), supplierOrgId, discountRate, Instant.now());
        return view(org, profiles.findBySupplierOrgId(supplierOrgId).orElse(null));
    }

    /** 整体替换：没带的项会被清空。 */
    @Transactional
    public SupplierView setCapability(UUID supplierOrgId, String processes, String materials, String sizeRange,
                                      String precisionGrade) {
        Organization org = requireSupplier(supplierOrgId);
        profiles.upsertCapability(UUID.randomUUID(), supplierOrgId, blankToNull(processes), blankToNull(materials),
                blankToNull(sizeRange), blankToNull(precisionGrade), Instant.now());
        return view(org, profiles.findBySupplierOrgId(supplierOrgId).orElse(null));
    }

    // ---------- SupplierDirectory ----------

    @Override
    @Transactional(readOnly = true)
    public Optional<BigDecimal> discountOf(UUID supplierOrgId) {
        return organizations.findById(supplierOrgId)
                .filter(SupplierProfileService::activeSupplier)
                .flatMap(o -> profiles.findBySupplierOrgId(o.getId()))
                .map(SupplierProfile::getDiscountRate);
    }

    @Override
    @Transactional(readOnly = true)
    public List<DispatchableSupplier> dispatchable() {
        List<Organization> suppliers = organizations.findByTypeOrderByCreatedAtDesc(Organization.Type.SUPPLIER);
        Map<UUID, SupplierProfile> byOrg = profilesOf(suppliers);
        return suppliers.stream()
                .filter(o -> dispatchable(o, byOrg.get(o.getId())))
                .map(o -> new DispatchableSupplier(o.getId(), o.getName(), byOrg.get(o.getId()).getDiscountRate()))
                .toList();
    }

    // ---------- helpers ----------

    private Map<UUID, SupplierProfile> profilesOf(List<Organization> suppliers) {
        if (suppliers.isEmpty()) {
            return Map.of();
        }
        return profiles.findBySupplierOrgIdIn(suppliers.stream().map(Organization::getId).toList()).stream()
                .collect(Collectors.toMap(SupplierProfile::getSupplierOrgId, Function.identity()));
    }

    private Organization requireSupplier(UUID orgId) {
        return organizations.findById(orgId)
                .filter(o -> o.getType() == Organization.Type.SUPPLIER)
                .orElseThrow(() -> BusinessException.notFound("supplier.not_found"));
    }

    private static boolean activeSupplier(Organization o) {
        return o.getType() == Organization.Type.SUPPLIER && o.getStatus() == Organization.Status.ACTIVE;
    }

    private static boolean dispatchable(Organization o, SupplierProfile p) {
        return activeSupplier(o) && p != null && p.getDiscountRate() != null;
    }

    private static SupplierView view(Organization o, SupplierProfile p) {
        return new SupplierView(o.getId(), o.getName(), o.getStatus().name(),
                p == null ? null : p.getDiscountRate(), p == null ? null : p.getProcesses(),
                p == null ? null : p.getMaterials(), p == null ? null : p.getSizeRange(),
                p == null ? null : p.getPrecisionGrade(), dispatchable(o, p), o.getCreatedAt());
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
