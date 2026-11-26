package com.mfg.domain.address;

import com.mfg.common.exception.BusinessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * 收货地址簿（2026-11-26 需求方拍板，changelog/2026-11-26_shipping-address-book）。
 *
 * <p><b>每个方法都显式收 {@code externalUserId}</b>，所有查询都带这个条件（§3 铁律 1 / 2），别人的地址一律 404。
 *
 * <p>业务规则：
 * <ul>
 *   <li>第一条自动成为默认；删掉默认后，剩下最早加的那条顶上 —— 有地址就总有一个默认（Q8）。</li>
 *   <li>默认地址不能直接取消，只能把别的地址设为默认（同上）。</li>
 *   <li>每人最多 {@value #MAX_PER_USER} 条（Q9，需求方授权按经验定：B2B 收货点通常就几个）。</li>
 * </ul>
 *
 * <p><b>并发</b>：改地址簿前先锁住这个用户的全部地址（{@link ShippingAddressRepository#lockAllByExternalUserId}），
 * 同一个人的写操作排队执行。换默认时先清掉旧默认、flush，再设新默认 —— 库里有「每人最多一个默认」的部分唯一索引，
 * 两步放在同一次 flush 里，Hibernate 可能先写新默认，当场撞索引。
 */
@Service
class ShippingAddressService implements AddressBook {

    static final int MAX_PER_USER = 20;

    private static final Set<String> ISO_COUNTRIES = Set.of(Locale.getISOCountries());

    /** 默认地址排第一，其余按添加顺序。 */
    private static final Comparator<ShippingAddress> LIST_ORDER =
            Comparator.comparing((ShippingAddress a) -> !a.isDefault());

    private final ShippingAddressRepository addresses;

    ShippingAddressService(ShippingAddressRepository addresses) {
        this.addresses = addresses;
    }

    @Transactional(readOnly = true)
    public List<ShippingAddressView> list(UUID externalUserId) {
        return addresses.findByExternalUserIdOrderByCreatedAtAsc(externalUserId).stream()
                .sorted(LIST_ORDER)
                .map(ShippingAddressView::of)
                .toList();
    }

    @Transactional
    public ShippingAddressView create(UUID externalUserId, AddressInfo info, boolean makeDefault) {
        List<ShippingAddress> existing = addresses.lockAllByExternalUserId(externalUserId);
        if (existing.size() >= MAX_PER_USER) {
            throw BusinessException.conflict("address.limit_reached");
        }
        ShippingAddress created = addresses.saveAndFlush(new ShippingAddress(externalUserId, normalize(info)));
        if (existing.isEmpty() || makeDefault) {
            moveDefault(existing, created);
        }
        return ShippingAddressView.of(created);
    }

    /** 整体替换：没带的选填项会被清空。{@code makeDefault} 为 false 时不动默认标记（默认不能直接取消）。 */
    @Transactional
    public ShippingAddressView update(UUID externalUserId, UUID addressId, AddressInfo info, boolean makeDefault) {
        List<ShippingAddress> all = addresses.lockAllByExternalUserId(externalUserId);
        ShippingAddress target = find(all, addressId);
        target.replace(normalize(info));
        addresses.saveAndFlush(target);
        if (makeDefault) {
            moveDefault(all, target);
        }
        return ShippingAddressView.of(target);
    }

    @Transactional
    public void delete(UUID externalUserId, UUID addressId) {
        List<ShippingAddress> all = addresses.lockAllByExternalUserId(externalUserId);
        ShippingAddress target = find(all, addressId);
        addresses.delete(target);
        addresses.flush();
        if (target.isDefault()) {
            // all 按创建时间升序：剩下最早加的那条顶上（Q8）
            all.stream().filter(a -> !a.getId().equals(addressId)).findFirst().ifPresent(next -> {
                next.setDefault(true);
                addresses.saveAndFlush(next);
            });
        }
    }

    @Transactional
    public ShippingAddressView makeDefault(UUID externalUserId, UUID addressId) {
        List<ShippingAddress> all = addresses.lockAllByExternalUserId(externalUserId);
        ShippingAddress target = find(all, addressId);
        moveDefault(all, target);
        return ShippingAddressView.of(target);
    }

    // ---------- AddressBook（给订单域） ----------

    @Override
    @Transactional(readOnly = true)
    public Optional<AddressInfo> findDefault(UUID externalUserId) {
        return addresses.findByExternalUserIdAndIsDefaultTrue(externalUserId).map(ShippingAddress::toInfo);
    }

    @Override
    @Transactional(readOnly = true)
    public AddressInfo require(UUID externalUserId, UUID addressId) {
        return addresses.findByIdAndExternalUserId(addressId, externalUserId)
                .map(ShippingAddress::toInfo)
                .orElseThrow(() -> BusinessException.notFound("address.not_found"));
    }

    // ---------- 内部 ----------

    private static ShippingAddress find(List<ShippingAddress> all, UUID addressId) {
        return all.stream().filter(a -> a.getId().equals(addressId)).findFirst()
                .orElseThrow(() -> BusinessException.notFound("address.not_found"));
    }

    /** 先清旧默认并 flush，再设新默认（见类注释「并发」）。 */
    private void moveDefault(List<ShippingAddress> all, ShippingAddress target) {
        for (ShippingAddress a : all) {
            if (a.isDefault() && !a.getId().equals(target.getId())) {
                a.setDefault(false);
                addresses.saveAndFlush(a);
            }
        }
        if (!target.isDefault()) {
            target.setDefault(true);
            addresses.saveAndFlush(target);
        }
    }

    /** 必填项和长度由 controller 校验；这里核国家代码，去掉首尾空白，选填项空白当没填。 */
    private static AddressInfo normalize(AddressInfo a) {
        if (!ISO_COUNTRIES.contains(a.country())) {
            throw new BusinessException(400, "address.country_invalid");
        }
        return new AddressInfo(a.country(), a.company().trim(), a.contact().trim(), a.phone().trim(),
                a.line1().trim(), blankToNull(a.line2()), a.city().trim(), blankToNull(a.region()),
                blankToNull(a.postalCode()));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
