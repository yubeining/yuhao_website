-- 收货地址簿（2026-11-26 需求方拍板，changelog/2026-11-26_shipping-address-book）：
--
--   * 地址在账号设置里维护，下单时自动带默认地址，订单页从地址簿换。
--   * 按个人账号归属（external_user_id），同一公司的同事之间互不可见。
--   * 字段和订单上的收货地址（customer_order.ship_to_*）一一对应：国家（ISO 3166-1 两位代码）、
--     收货公司、收货人、电话、地址、城市必填；地址第二行、州/省、邮编选填。
--   * 订单只存地址快照，不引用这张表（CLAUDE.md §10 C2），所以删地址是物理删除。
--   * 每人最多一个默认地址，由下面的部分唯一索引兜底。条数上限（20）由 service 管。
--
-- 归属：domain/address（地址域）。订单域经 AddressBook 接口读，不联表。
-- 只新建表，旧版本代码不认识这张表也照常运行，无需扩展-收缩。

CREATE TABLE IF NOT EXISTS shipping_address (
    id                uuid        PRIMARY KEY,
    external_user_id  uuid        NOT NULL,
    country           text        NOT NULL,
    company           text        NOT NULL,
    contact           text        NOT NULL,
    phone             text        NOT NULL,
    line1             text        NOT NULL,
    line2             text,
    city              text        NOT NULL,
    region            text,
    postal_code       text,
    is_default        boolean     NOT NULL DEFAULT false,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    version           bigint      NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS shipping_address_user_idx ON shipping_address (external_user_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS shipping_address_one_default_uk ON shipping_address (external_user_id) WHERE is_default;
