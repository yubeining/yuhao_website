# 变更记录 —— 安全响应头(CSP + 防点击劫持/嗅探),XSS 兜底

> 2026-09-08 ｜ SecurityConfig ｜ 无 schema、无前端改动

## 为什么

之前后端没有任何安全响应头。CSP 是 XSS 的关键兜底:即便前端某处被注入脚本,
CSP 限制脚本只能同源、禁 inline/eval,注入代码跑不起来、也连不出去。

## 改了什么(`SecurityConfig`)

- 加 `.headers(...)`:
  - **Content-Security-Policy**:`default-src 'self'`;`script-src 'self'`(vite 产物全同源,不用 CDN);
    `object-src 'none'`;`base-uri/form-action 'self'`;`frame-ancestors 'none'`;
    `img-src/connect-src 'self'` + **对象存储外网 origin**(图纸/签名 URL);`style-src 'self' 'unsafe-inline'`(前端有内联样式,先放开,后续用 nonce 收紧)。
  - `X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff`、`Referrer-Policy: same-origin`。
- **OSS 域名不写死**(§C3):从 `app.storage.s3.public-endpoint`(回落 `endpoint`)推出 origin 拼进 CSP;没配就只留 `'self'`。

## 验证(跑过)

- `SecurityHeadersIT`:探针响应带 CSP/X-Frame-Options/nosniff/Referrer-Policy,内容正确。
- 真机:后端托管构建产物(:3001)在 CSP 下加载登录页 —— **控制台零 CSP 违规,样式完整**。
- 全套 `mvn verify` 绿(单测 21 + 集成 23)。

## 遗留(下一步)

- `style-src 'unsafe-inline'` 用 nonce/hash 收紧。
- token 换 httpOnly cookie + CSRF(XSS 治本项,单独做)。
- 提交闸门禁止新增 `dangerouslySetInnerHTML`。
