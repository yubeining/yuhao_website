import { chromium } from 'playwright-core'

export const BASE = process.env.BASE_URL || 'http://localhost:3001'

export async function newSession({ locale = 'zh-CN' } = {}) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale })
  // 手选语言优先于账号 locale —— 保证整站渲染中文，选择器稳定
  await ctx.addInitScript(() => { try { localStorage.setItem('mfg.lang.user', 'zh') } catch {} })
  const page = await ctx.newPage()
  // 应用里有 window.confirm（发报价、禁用账号等）。Playwright 默认自动 dismiss，
  // 那会让这些操作静默地什么都不做 —— 必须显式 accept。
  page.on('dialog', (d) => { console.log('  [dialog]', d.type(), d.message().slice(0, 120)); void d.accept() })
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 160)) })
  const field = (label) => page.locator('.field2').filter({ hasText: label }).locator('input, select, textarea').first()
  return { browser, ctx, page, field }
}

export async function shot(page, name) {
  await page.screenshot({ path: `shots/${name}.png`, fullPage: true })
}

/** 密码登录：等真的跳到目标端，而不是等 networkidle（XHR 可能还没回来）。 */
export async function login(page, email, pw, expectPath) {
  await page.goto(BASE + '/auth/signin', { waitUntil: 'networkidle' })
  await page.locator('#em').fill(email)
  await page.locator('#pw').fill(pw)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 20000 })
  if (expectPath) await page.waitForURL((u) => u.pathname.startsWith(expectPath), { timeout: 20000 })
  await page.waitForTimeout(500)
}
