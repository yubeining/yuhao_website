package com.mfg.domain.address;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.UUID;

/**
 * 客户个人地址簿里的一条收货地址（2026-11-26）。字段和订单上的收货地址一一对应。
 *
 * <p>按个人账号归属（{@code externalUserId}），同一公司的同事之间互不可见。
 * 订单只存地址快照、不引用这张表，所以删除是物理删除。
 */
@Entity
@Table(name = "shipping_address")
class ShippingAddress extends BaseEntity {

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "external_user_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID externalUserId;

    /** ISO 3166-1 两位代码。 */
    @Column(name = "country", nullable = false)
    private String country;

    @Column(name = "company", nullable = false)
    private String company;

    @Column(name = "contact", nullable = false)
    private String contact;

    @Column(name = "phone", nullable = false)
    private String phone;

    @Column(name = "line1", nullable = false)
    private String line1;

    @Column(name = "line2")
    private String line2;

    @Column(name = "city", nullable = false)
    private String city;

    @Column(name = "region")
    private String region;

    @Column(name = "postal_code")
    private String postalCode;

    @Column(name = "is_default", nullable = false)
    private boolean isDefault;

    protected ShippingAddress() {
    }

    ShippingAddress(UUID externalUserId, AddressInfo a) {
        this.externalUserId = externalUserId;
        replace(a);
    }

    void replace(AddressInfo a) {
        this.country = a.country();
        this.company = a.company();
        this.contact = a.contact();
        this.phone = a.phone();
        this.line1 = a.line1();
        this.line2 = a.line2();
        this.city = a.city();
        this.region = a.region();
        this.postalCode = a.postalCode();
    }

    AddressInfo toInfo() {
        return new AddressInfo(country, company, contact, phone, line1, line2, city, region, postalCode);
    }

    UUID getExternalUserId() {
        return externalUserId;
    }

    boolean isDefault() {
        return isDefault;
    }

    void setDefault(boolean value) {
        this.isDefault = value;
    }
}
