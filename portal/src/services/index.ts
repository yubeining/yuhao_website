/**
 * services 聚合导出。★ 每新增一个 service 文件，在这里加一行 `export *`（CLAUDE.md §2）。
 */

export * from './core/http'
export * from './auth'
export * from './customer/parts'
export * from './customer/orders'
export * from './customer/organization'
export * from './customer/quotes'
export * from './ops/orders'
export * from './ops/quotes'
export * from './ops/suppliers'
export * from './ops/dispatch'
export * from './ops/dashboard'
export * from './ops/accounts'
export * from './ops/production'
export * from './supplier/offers'
export * from './supplier/organization'
