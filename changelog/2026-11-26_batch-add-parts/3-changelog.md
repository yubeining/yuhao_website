# 变更记录

## 实际改动

### 图号不再唯一（取代 D16）
- 后端 `CustomerOrderService.addLine` 每次新建零件 + 第 1 版；删 `GET /customer/parts?code=`、`PartDrawingService.findPartByCode`、
  `PartDesignRepository.findByCustomerOrgIdAndCode / existsByCustomerOrgIdAndCode`、
  `PartRevisionRepository.findTopBy…LockedAtIsNotNull…`；`insertPart` 去掉查重和 `part.code_taken`。
- 迁移 `2026-11-26_02_part-code-not-unique.sql` 删唯一索引；`schema.sql`、迁移 README 同步。
- 前端「添加零件」页去掉已有零件查询、提示和「重复使用会复用已有零件」的说明；删对应文案和 `part.code_taken` 错误文案。
- 设计文档 11 D16 加「已被取代」说明。

### 批量添加
- 后端 `POST /customer/orders/{id}/lines/batch`（`AddLinesRequest`）：一个事务建全部行，校验订单归属与草稿状态。
- 前端：
  - `lib/batchImport.ts`（纯函数：认表头、读清单行、按图号归组、清单行配文件）+ `batchImport.test.ts`（vitest，15 个）。
  - `lib/batchFiles.ts`：展开文件夹、解压 zip（文件名非 UTF-8 时按 GB18030 解）、读 xlsx / xls / csv（CSV 同样回退 GB18030）。
    读表库按需加载，单独打包（约 500 KB）。
  - `pages/customer/BatchPartsPage.tsx`，路由 `orders/:id/parts/batch`；订单详情零件卡加「批量添加」。
  - `drawing.ts` 的 `readablePartNo` 改为导出；紧凑写法 `LB860062384` 也当作客户写的图号。
- 依赖：`jszip@3.10.1`；`xlsx@0.20.3` 来自 SheetJS 官方 CDN，安装包放在 `portal/vendor/xlsx-0.20.3.tgz`
  （npm 上的 0.18.5 有已知漏洞；官方修复版只在 CDN 发，CDN 在本机很不稳定，所以按官方建议放进仓库）；`vitest@3.2.4`，新增 `npm test`。
- Dockerfile：`npm ci` 前先拷 `portal/vendor`。

## 测试
- `CustomerOrderFlowIT`：原「同图号再下单沿用版本」改为 `sameCodeAlwaysCreatesANewPart`；新增批量 3 个（成功 / 一行不合法整批不收 + 空列表 / 别家 404 + 非草稿 409）。
- `PartDrawingFlowIT`：「同图号建第二个 409」改为「建出两个零件」；删「按图号查零件」用例。
- `mvn verify`：210 个集成测试 1 个失败 —— `CustomerOrderFlowIT.malformedRequestsAreClientErrorsNotServerErrors`
  （`PUT /customer/orders` 期望 405 实际 404）。在干净的 main（d933cc7）上单跑同样失败，与本次改动无关，见遗留。
- 前端 `npm run type-check`、`npm test`（31 通过：解析 20 + 读文件层 11）、`npm run build` 通过。
  读文件层测试：xlsx / xls（BIFF8）/ 多工作表 / UTF-8 带 BOM 的 CSV / GBK CSV；zip 解一层、跳过 `__MACOSX` 和隐藏文件、
  GBK 文件名的 zip、超 20MB（单文件和 zip 内）挑出、坏 zip 不拖垮整批；拖入文件夹逐层读、超过 100 个条目分批读。
  测试用的 xlsx / xls 是 SheetJS 自己生成的，本机没有 Excel 做出来的真实文件。临时弄坏 GBK 回退和 20MB 判断各一次，对应测试都变红。
- 提交闸门：会话隔离不让直接跑 `.githooks/pre-commit`，改为对暂存区逐个跑它调用的 8 个 `scripts/check-*.py`，全部通过。
  i18n 闸门起初拦下了表头关键词和测试样本里的中文 —— 它们是匹配客户清单的数据，不是界面文案，用 `i18n-exempt-start/-end` 标出。
- 浏览器实测（本地 dev，测试库 `mfg_batch_dev`）：拖入 GBK 编码 CSV 清单 + zip + 纯数字文件名 PDF → 认出表头第 2 行、三列自动对上、跳过合计行；
  同图号两行各挂同一组文件；`__MACOSX` 跳过；改行、补数量后保存 → 5 行一次落库，5 个文件传上，`.prt` 被后端类型校验拒收并提示；
  保存前库里 0 行 0 文件。
- 补测（中文界面）：「导入文件」「导入文件夹」两个选择框；多工作表 xlsx（切工作表、改表头行、改列、按清单添加）；xls；
  「当作普通文件」；GBK 文件名 zip；手动加行（连点两次保存只出一行）；删行；弹框里加文件（含 zip）/ 删文件；
  超 20MB 挑出并提示、正好 20MB 的 STEP 传上去（库里 20971520 字节，COMPLETED）；不带文件的手动行能保存；深色主题；375 宽手机。
  补测中修掉的：默认工作表选封面页 → 改为第一张认得出表头的；先导清单后导图纸配不上 → 后导入的文件按图号配到已有行；
  保存行改为按 key 判断，防连点出两行。
- 真实的操作系统拖文件夹、原生文件选择框没法自动化，只测了它们背后的处理代码（脚本构造 DataTransfer / input.files）。
- ★ 没按 TDD 顺序：批量接口和前端解析是先写实现、后跑测试（依赖当时没装上），测试补齐后才看到绿，没有先看到红。

## 部署
- 一次发布：迁移只删索引。**回滚风险（已确认接受）**：库里一旦有同客户同图号的多个零件，回滚到旧 jar 后旧代码按图号取唯一零件会报错。
- 镜像构建依赖仓库里的 `portal/vendor/xlsx-0.20.3.tgz`。

## 遗留
- `POST /customer/orders/{id}/lines/{lineId}/new-revision`（「换图纸开新版本」）和 `PartFormPage` 里对应的分支：
  现在草稿行的版本永远没锁，这条路走不到了。没删，等你决定。
- `lib/drawing.ts` 的 `groupByPart` 原本就没有调用方，这次也没用（它会把 File 展开成普通对象，丢掉文件内容）。没删。
- `malformedRequestsAreClientErrorsNotServerErrors` 在 main 上就失败（见测试）。
- 迁移 README 的列表里没有别的分支加的 `2026-11-26_01_shipping-address.sql`，不是本次改的，没补。
- 本地测试容器里建了临时库 `mfg_batch_dev`，没删。
- 全站弹框在手机上偏右：`.modal-mask` 有 20px 内边距，`.modal` 又是 `max-width:94vw`，宽于约 335px 的弹框右边只剩几像素（本页 480 宽的编辑框、账号设置 400 宽的弹框都这样）。改要动全站样式，没动。
- 先导图纸、后导清单时，清单行不会去认领之前按图纸开的行（会出现同图号的两行，要客户自己删一行）。只做了反方向（先清单后图纸）。

---

# 第二轮（2026-11-27）：订单详情页整页编辑

## 实际改动
- 迁移 `2026-11-27_01_draft-part-fields-nullable.sql`：零件明细的 `part_no / part_name / quantity`、零件主表的 `code / name` 放开非空；`schema.sql` 同步。
- 后端（`domain/order`）：
  - `POST /customer/orders` 收整张订单一次建好；新增 `PUT /customer/orders/{id}` 草稿整张替换（`SaveOrderRequest` / `LineRequest` / `ShipToFields`），
    返回 `SavedOrderView {order, createdLineIds}`。行 id、文件 id 不属于这张订单一律 404。
  - 删图纸在保存事务里改状态、事务提交后删对象（`PartDrawingService.removeFileOnCommit`）。
    ★ 改文件状态的 SQL 会清空持久化上下文，所以放在行 / 零件改动 flush 之后再做 —— 第一版放在前面，行和零件的改动被静默丢掉，集成测试抓到的。
  - 挂着已锁定版本的草稿行（11-26 之前 D16 沿用的）：改客户版本、删文件 409 `part.revision_locked`，改行上字段照常。
  - `PUT /ship-to` 改收地址内容；提交检查加 400 `order.line_incomplete`。
  - 删旧接口：改订单名称交期、逐行加 / 批量加 / 改行 / 删行、开新版本；订单服务不再依赖 `AddressBook`。
  - 数量改 `Integer`，图号 / 名称可空；`PartDesign.rename`、`PartRevision.changeCustomerRev`、`CustomerOrder.clearShipTo`。
- 前端：
  - `lib/orderDraft.ts` + 测试 11 个；`OrderDetailPage` 重写；新 `OrderPartsTable`（导入逻辑和清单列确认弹框从批量页搬过来）；
    `ShipToEditor` 改受控；`AddressFormModal` 加订单地址模式；路由 `orders/new`；删 `PartFormPage`、`BatchPartsPage`。
  - 订单列表「新建订单」只跳页不建单；删副标题。
  - 运营报价页 / 估价卡：行类型的图号、名称、数量变成可空，加了兜底（运营只看得到已提交的单，这几项提交时已检查）。
  - 文案：`batchParts` 换成 `orderEdit`；删本次变成没人用的文案（零件页、旧订单页提示、地址卡「填写 / 编辑」等）；加 `order.line_incomplete`。
  - 样式：编辑表格、新行底色、行下文件、底部保存栏、标红，全部走 CSS 变量。
  - 删前端 `findPartByCode`（调的接口在本分支第一轮已删）。
- 文档：`CLAUDE.md` C7 加例外；设计文档 12 记录本轮拍板。

## 测试
- `cd backend && mvn verify`：单元 140 个、集成 210 个（跳过 5 个，原本就跳过），0 失败，BUILD SUCCESS。
  第一轮遗留的 `malformedRequestsAreClientErrorsNotServerErrors` 这次也通过了。
- 迁移从零建库：建空库 `mfg_mig_check`，用新代码启动一次，32 个迁移全部应用、应用正常启动（Hibernate 按迁移建出来的表校验通过）。
  本地开发库 `mfg_batch_dev` 启动时也应用了新迁移，五列都变成可空。
- 前端：`npm run type-check` 通过；`npm test` 42 个通过；`npm run build` 通过。
- 提交闸门 8 个检查器对暂存区逐个跑，全部通过。
- 浏览器实测（中文界面，本地后端）：只读零件表、展开文件；编辑 → 改数量 → 取消（确认框，撤销后恢复）；
  编辑 → 改数量、删一行、加一行 → 保存 → 刷新后仍在；提交检查弹框（缺图纸 / 交期 / 地址）→ 去完善标红；
  地址簿为空时「选择地址」直接新增 → 存进地址簿且为默认、同时用在订单；「修改」只改订单地址，地址簿里那条没变；
  新建订单：默认地址带上、无「有改动未保存」；导入两份 PDF → 保存 → 建单、图纸传上、地址跳到新订单；
  新建后不改就取消 → 不留订单；新建后加行再离开 → 拦截提示；深色主题；375 宽手机（整页不横向溢出，表格在卡片里横向滑动）。
- 没测到：上传失败后的重试（本地存储不会失败，只有代码路径）；DatePicker 选日期（只看了标红）；真实的系统文件选择框和拖文件夹。
- ★ 没按 TDD 顺序：`orderDraft.ts` 是先写实现再补测试；后端是先改集成测试再改实现，但没有先单独跑一次看到红。

## 部署
- 一次发布（已确认接受回滚风险）：回滚到旧 jar 后，旧代码把数量映射成 `int`，读到数量为空的草稿会报错打不开。
- 接口有删有改，前端和后端必须同一个包一起发（本来就是一个 jar）。

## 遗留
- `domain/address/AddressBook` 接口现在没有调用方了（订单服务不再用它），实现类和 `ShippingAddressFlowIT` 还在。没删，等你决定。
- 前端 `services/customer/parts.ts` 的 `getPart`、订单详情文案里 `needDrawings / missingDrawingPill / customerRev / submittedBanner` 在本分支之前就没人用，没删。
- 先导图纸、后导清单仍会出现同图号两行（第一轮遗留，没改）。
- 保存时新文件是按顺序一个个传的，文件多时慢；失败的文件留在编辑状态等重试。
- 本地测试容器里多了一个空的检查库 `mfg_mig_check`（加上第一轮的 `mfg_batch_dev`），没删 —— 删库要你确认。
