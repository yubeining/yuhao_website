/**
 * 主流程 E2E —— 客户 / 运营 / 供应商 三方跑完一条真实订单。
 *
 * 前置：本地后端（mfg_e2e 库）+ s3-mock（9001）+ 一个运营账号（seed-ops.sh）。
 * 跑法：node e2e-main.mjs
 *
 * 每一步都截图（shots/<序号>-<名字>.png），失败即停并保留当时的页面。
 * 断言尽量断言"服务端状态/页面上的事实"，而不是"点到了按钮"。
 */
import fs from 'node:fs'
import { newSession, shot, BASE, login } from './lib.mjs'

const stamp = Date.now()
const CUSTOMER = { email: `e2e-c-${stamp}@example.com`, pw: 'password123', name: 'E2E Buyer', company: `E2E GmbH ${stamp}` }
const SUPPLIER = { email: `e2e-s-${stamp}@example.com`, pw: 'password123', name: 'E2E Supplier', company: `E2E 精工 ${stamp}` }
const OPS = { email: 'ops-e2e@example.com', pw: 'password123' }

fs.mkdirSync('shots', { recursive: true })
const results = []
let stepNo = 0

function ok(name, detail = '') {
  stepNo += 1
  results.push({ step: stepNo, name, status: 'PASS', detail })
  console.log(`  ✅ [${stepNo}] ${name}${detail ? ' — ' + detail : ''}`)
}

function fail(name, err) {
  results.push({ step: stepNo + 1, name, status: 'FAIL', detail: String(err).slice(0, 300) })
  console.log(`  ❌ [${stepNo + 1}] ${name} — ${err}`)
}

async function run(name, fn) {
  try {
    const detail = await fn()
    ok(name, detail || '')
  } catch (e) {
    fail(name, e)
    throw e
  }
}

const text = async (page) => (await page.locator('.appmain').innerText()).replace(/\n+/g, ' | ')

const { browser, page, field } = await newSession()
let orderUrl = ''

try {
  // ───────── 客户 ─────────
  await run('客户注册', async () => {
    await page.goto(BASE + '/auth/register', { waitUntil: 'networkidle' })
    await field('公司名称').fill(CUSTOMER.company)
    await field('国家 / 地区').selectOption('Germany')
    await field('联系人姓名').fill(CUSTOMER.name)
    await field('企业邮箱').fill(CUSTOMER.email)
    await field('设置密码').fill(CUSTOMER.pw)
    await page.locator('input[type=checkbox]').check()
    await page.getByRole('button', { name: '创建账号' }).click()
    await page.waitForURL(/\/auth\/signin/, { timeout: 20000 })
    await shot(page, '01-register')
  })

  await run('客户登录', async () => {
    await login(page, CUSTOMER.email, CUSTOMER.pw, '/customer')
    await shot(page, '02-customer-home')
    return page.url()
  })

  await run('新建订单', async () => {
    await page.goto(BASE + '/customer/orders', { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: /新建订单/ }).first().click()
    await page.getByPlaceholder('订单名称（可选）').fill('E2E 订单')
    await page.getByRole('button', { name: '创建', exact: true }).click()
    await page.waitForURL(/\/customer\/orders\/[0-9a-f-]{36}/, { timeout: 20000 })
    orderUrl = page.url().split('/parts')[0]
    await shot(page, '03-order-created')
    return orderUrl.replace(BASE, '')
  })

  await run('录入零件 + 上传图纸', async () => {
    await page.goto(orderUrl + '/parts/new', { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)
    await page.getByPlaceholder('可从文件名自动识别').fill('E2E-PART-001')
    await page.locator('.field2').filter({ hasText: '名称' }).locator('input').first().fill('E2E 法兰盘')
    await page.locator('.field2').filter({ hasText: '数量' }).locator('input').first().fill('5')
    await page.locator('input[type=file]').setInputFiles('fixtures/part.pdf')
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: '加进订单' }).click()
    await page.waitForURL((u) => !u.pathname.endsWith('/parts/new'), { timeout: 20000 })
    await page.waitForTimeout(1500)
    await page.goto(orderUrl, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    if ((await text(page)).includes('缺图纸')) throw new Error('图纸上传失败')
    await shot(page, '04-part-uploaded')
  })

  await run('提交订单', async () => {
    await page.getByRole('button', { name: /提交订单/ }).click()
    await page.waitForTimeout(2000)
    const t = await text(page)
    if (!t.includes('已提交')) throw new Error('订单未变为已提交：' + t.slice(0, 120))
    await shot(page, '05-order-submitted')
  })

  // ───────── 运营报价 ─────────
  const opsLogin = async () => {
    await page.evaluate(() => localStorage.clear()).catch(() => {})
    await page.goto(BASE + '/auth/internal/signin', { waitUntil: 'networkidle' })
    await page.locator('#em').fill(OPS.email)
    await page.locator('#pw').fill(OPS.pw)
    await page.getByRole('button', { name: /登录/ }).first().click()
    await page.waitForURL((u) => u.pathname.startsWith('/ops'), { timeout: 20000 })
  }

  let quoteWorkUrl = ''
  await run('运营登录并进入报价', async () => {
    await opsLogin()
    await page.goto(BASE + '/ops/quotes', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    if (!(await page.locator('tbody tr').count())) throw new Error('待报价列表为空')
    await page.locator('tbody tr').first().click()
    await page.waitForTimeout(1500)
    quoteWorkUrl = page.url()
    await shot(page, '06-ops-quote-work')
    return quoteWorkUrl.replace(BASE, '')
  })

  await run('设客户加成率并保存', async () => {
    await page.getByPlaceholder('如 1.2').fill('1.2')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await page.waitForTimeout(1500)
    if (!(await text(page)).includes('1.2')) throw new Error('加成率未保存')
  })

  await run('填原价、币种、交期并试算', async () => {
    await page.getByPlaceholder('¥ / 件').first().fill('100')
    await page.locator('.fld').filter({ hasText: '对客币种' }).locator('select').selectOption('EUR')
    await page.getByPlaceholder('天').fill('30')
    await page.getByRole('button', { name: '按当前汇率试算' }).click()
    await page.waitForTimeout(1800)
    if (!/€/.test(await text(page))) throw new Error('试算没有出对客价')
    await shot(page, '07-quote-preview')
  })

  await run('发出报价', async () => {
    await page.getByRole('button', { name: '发出报价' }).click()
    await page.waitForTimeout(2500)
    if (!(await text(page)).includes('报价记录')) throw new Error('报价记录未出现')
    await shot(page, '08-quote-sent')
  })

  // ───────── 客户确认 ─────────
  await run('客户确认报价', async () => {
    await page.evaluate(() => localStorage.clear()).catch(() => {})
    await login(page, CUSTOMER.email, CUSTOMER.pw, '/customer')
    await page.goto(BASE + '/customer/quotes', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    await page.locator('tbody tr').first().click()
    await page.waitForTimeout(1500)
    await page.getByRole('button', { name: /确认价格/ }).click()
    await page.waitForTimeout(2500)
    if (!(await text(page)).includes('已确认')) throw new Error('报价未确认')
    await shot(page, '09-quote-confirmed')
  })

  // ───────── 运营派单 ─────────
  await run('新建生产订单并分配零件', async () => {
    await opsLogin()
    await page.goto(BASE + '/ops/dispatch', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    await page.getByRole('button', { name: /新建生产订单/ }).click()
    await page.waitForTimeout(1800)
    await page.getByRole('button', { name: '分配', exact: true }).first().click()
    await page.waitForTimeout(800)
    await page.getByPlaceholder('件').first().fill('5')
    await page.getByRole('button', { name: '确认分配' }).click()
    await page.waitForTimeout(2000)
    if (!(await text(page)).includes('已分配')) throw new Error('分配失败')
    await shot(page, '10-allocated')
  })

  // ───────── 供应商入驻 ─────────
  let inviteUrl = ''
  await run('运营生成供应商邀请链接', async () => {
    await page.goto(BASE + '/ops/onboarding', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)
    await page.getByPlaceholder('企业名称').fill(SUPPLIER.company)
    await page.getByPlaceholder('对方登录邮箱').fill(SUPPLIER.email)
    await page.getByRole('button', { name: '生成邀请链接' }).click()
    await page.waitForTimeout(1800)
    const m = (await page.locator('.appmain').innerText()).match(/http\S+token=[A-Za-z0-9_-]+/)
    if (!m) throw new Error('没拿到邀请链接')
    inviteUrl = m[0]
    await shot(page, '11-invite')
    return inviteUrl.replace(BASE, '')
  })

  await run('供应商凭邀请注册', async () => {
    await page.evaluate(() => localStorage.clear()).catch(() => {})
    await page.goto(inviteUrl, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    await page.getByPlaceholder('姓名').fill(SUPPLIER.name)
    await page.getByPlaceholder('至少 8 位').fill(SUPPLIER.pw)
    await page.locator('input[type=password]').nth(1).fill(SUPPLIER.pw)
    await page.getByRole('button', { name: '创建供应商账号' }).click()
    await page.waitForTimeout(2000)
    if (!(await page.locator('body').innerText()).includes('注册成功')) throw new Error('注册失败')
    await shot(page, '12-supplier-registered')
  })

  await run('运营给供应商录折率', async () => {
    await opsLogin()
    await page.goto(BASE + '/ops/parties', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    await page.getByRole('button', { name: '编辑', exact: true }).first().click()
    await page.waitForTimeout(800)
    await page.getByPlaceholder('如 0.8').fill('0.8')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await page.waitForTimeout(1500)
    if (!(await text(page)).includes('可派单')) throw new Error('折率未生效')
    await shot(page, '13-discount')
  })

  await run('挂全市场派单', async () => {
    await page.goto(BASE + '/ops/dispatch', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    await page.locator('table').last().locator('tbody tr').first().click()
    await page.waitForTimeout(1500)
    await page.locator('input').last().fill('2026-12-31')
    await page.getByRole('button', { name: '挂全市场' }).click()
    await page.waitForTimeout(2500)
    if (!(await text(page)).includes('已挂全市场')) throw new Error('挂单失败')
    await shot(page, '14-published')
  })

  // ───────── 供应商接单 + 合同 ─────────
  await run('供应商接单', async () => {
    await page.evaluate(() => localStorage.clear()).catch(() => {})
    await login(page, SUPPLIER.email, SUPPLIER.pw, '/supplier')
    await page.goto(BASE + '/supplier/hall', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    await page.locator('tbody tr').first().click()
    await page.waitForTimeout(1200)
    await page.getByRole('button', { name: '接单', exact: true }).click()
    await page.waitForTimeout(2500)
    if (!(await text(page)).includes('已接单')) throw new Error('接单失败')
    await shot(page, '15-accepted')
  })

  await run('运营建合同', async () => {
    await opsLogin()
    await page.goto(BASE + '/ops/dispatch', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    await page.locator('table').last().locator('tbody tr').first().click()
    await page.waitForTimeout(1500)
    await page.getByRole('button', { name: '建合同' }).click()
    await page.waitForTimeout(2500)
    if (!(await text(page)).includes('等供应商签字')) throw new Error('合同未建')
    await shot(page, '16-contract')
  })

  await run('供应商签合同', async () => {
    await page.evaluate(() => localStorage.clear()).catch(() => {})
    await login(page, SUPPLIER.email, SUPPLIER.pw, '/supplier')
    await page.goto(BASE + '/supplier/orders', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)
    await page.locator('tbody tr').first().click()
    await page.waitForTimeout(1200)
    await page.getByRole('button', { name: '签字确认' }).click()
    await page.waitForTimeout(2500)
    if (!(await text(page)).includes('已签字')) throw new Error('签字失败')
    await shot(page, '17-signed')
  })

  await run('供应商开工 / 完工 / 发给平台', async () => {
    await page.getByRole('button', { name: '开工', exact: true }).first().click()
    await page.waitForTimeout(2000)
    await page.getByRole('button', { name: '完工', exact: true }).first().click()
    await page.waitForTimeout(2000)
    await page.getByRole('button', { name: '发给平台' }).click()
    await page.waitForTimeout(2500)
    if (!(await text(page)).includes('待质检')) throw new Error('发货后状态不对')
    await shot(page, '18-shipped')
  })

  // ───────── 质检 ─────────
  await run('运营质检通过', async () => {
    await opsLogin()
    await page.goto(BASE + '/ops/production', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    await page.getByRole('button', { name: '提交', exact: true }).first().click()
    await page.waitForTimeout(800)
    await page.getByPlaceholder('合格').fill('5')
    await page.getByPlaceholder('返工').fill('0')
    await page.getByPlaceholder('报废').fill('0')
    await page.getByRole('button', { name: '提交', exact: true }).click()
    await page.waitForTimeout(2500)
    if (!(await text(page)).includes('已全部合格')) throw new Error('质检未通过')
    await shot(page, '19-qc-done')
  })

  // ───────── 账号管理 ─────────
  await run('账号管理：新建外部用户 → 禁用 → 启用', async () => {
    await page.goto(BASE + '/ops/accounts', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    const newEmail = `e2e-managed-${stamp}@example.com`
    await page.getByRole('button', { name: /新建/ }).first().click()
    await page.waitForTimeout(600)
    await page.locator('.field2').filter({ hasText: '登录邮箱' }).locator('input').fill(newEmail)
    await page.locator('.field2').filter({ hasText: '姓名' }).locator('input').fill('Managed User')
    await page.locator('.field2').filter({ hasText: '初始密码' }).locator('input').fill('password123')
    await page.locator('.field2').filter({ hasText: '所属公司' }).locator('select').selectOption({ index: 1 })
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await page.waitForTimeout(2000)
    if (!(await text(page)).includes(newEmail)) throw new Error('新用户没出现在列表')
    await shot(page, '20-accounts-created')

    const row = page.locator('tbody tr').filter({ hasText: newEmail })
    await row.getByRole('button', { name: '禁用' }).click()
    await page.waitForTimeout(2000)
    if (!(await row.innerText()).includes('已禁用')) throw new Error('禁用没生效')
    await shot(page, '21-accounts-disabled')

    await row.getByRole('button', { name: '启用' }).click()
    await page.waitForTimeout(2000)
    if (!(await row.innerText()).includes('正常')) throw new Error('启用没生效')
    await shot(page, '22-accounts-enabled')
    return newEmail
  })

  // ───────── 终态 ─────────
  await run('客户订单进入 READY', async () => {
    await page.evaluate(() => localStorage.clear()).catch(() => {})
    await login(page, CUSTOMER.email, CUSTOMER.pw, '/customer')
    await page.goto(orderUrl, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)
    const t = await text(page)
    await shot(page, '23-customer-final')
    if (!t.includes('已全部合格') && !t.includes('待发货') && !t.includes('READY')) {
      throw new Error('客户侧状态未推进：' + t.slice(0, 150))
    }
    return t.slice(0, 80)
  })
} catch (e) {
  console.log('\n流程中断：', e.message)
  await shot(page, 'FAILED')
  fs.writeFileSync('report.json', JSON.stringify({
    finishedAt: new Date().toISOString(), ok: false,
    customer: CUSTOMER, supplier: SUPPLIER, order: orderUrl, steps: results,
  }, null, 2))
  await browser.close()
  process.exit(1)
}

fs.writeFileSync('report.json', JSON.stringify({
  finishedAt: new Date().toISOString(), ok: true,
  customer: CUSTOMER, supplier: SUPPLIER, order: orderUrl, steps: results,
}, null, 2))

console.log(`\n全部通过：${results.length} 步`)
await browser.close()
