# 测试用例 — 订单详情页整页编辑（2026-11-27）

对应提交 `4e9159c`（整页编辑、整张保存）。需求与拍板见 `changelog/2026-11-26_batch-add-parts/1-requirement.md` 第二轮。

「覆盖」一列：
- **IT** = `backend/src/test/java/com/mfg/domain/order/CustomerOrderFlowIT.java` 里的方法
- **UT** = `portal/src/lib/orderDraft.test.ts` 里的用例
- **人工** = 浏览器实测（仓库没有 e2e 框架，页面流程只能人工测）
- 标 ★ 的是这次补测新加的（原来是缺口）

用例名按 `should_<预期>_when_<条件>`；IT 方法名沿用本仓库的写法，两者在「覆盖」列对应。

## 后端：POST /customer/orders — 新建（整张一次建好）

| # | 用例名称 | 前置条件 | 操作 | 预期结果 | 优先级 | 类型 | 覆盖 |
|---|---|---|---|---|---|---|---|
| 1 | should_create_order_with_lines_when_request_valid | 已登录客户 | 带地址 + 3 行（两行同图号） | 200；3 行；`createdLineIds` 3 个，顺序同请求；同图号是两个零件 | P0 | 功能 | IT creatingWithLinesBuildsTheWholeOrderAtOnce |
| 2 | should_create_empty_draft_when_lines_omitted | 已登录 | 不带 `lines` | 200 DRAFT，0 行 | P1 | 边界 | IT draftCanBeCreatedAndEdited |
| 3 | should_return_404_when_new_line_has_id | 已登录 | 某行带随机 id | 404 `order.line_not_found`，不留订单 | P1 | 参数校验 | ★ IT createRejectsLineIdsAndFileRemovalsAndLeavesNoOrder |
| 4 | should_return_404_when_new_line_has_removeFileIds | 已登录 | 新行带 `removeFileIds` | 404 `part.file_not_found`，不留订单 | P1 | 参数校验 | ★ 同上 |
| 5 | should_reject_when_shipTo_incomplete | 已登录 | 城市为空 | 400，不留订单 | P0 | 参数校验 | ★ IT createRejectsAnIncompleteAddressOrTooLongTitle |
| 6 | should_reject_when_title_over_200 | 已登录 | 名称 201 字符 | 400 | P2 | 参数校验 | ★ 同上 |
| 7 | should_return_401_when_no_token | 未登录 | 提交 | 401 | P0 | 安全 | ★ IT orderEndpointsRejectAnonymousAndOtherPortals |
| 8 | should_return_403_when_supplier_or_ops_token | 供应商 / 运营身份 | 新建、保存 | 403 | P1 | 安全 | ★ 同上 |

## 后端：PUT /customer/orders/{id} — 保存草稿（整张替换）

| # | 用例名称 | 前置条件 | 操作 | 预期结果 | 优先级 | 类型 | 覆盖 |
|---|---|---|---|---|---|---|---|
| 9 | should_update_add_delete_lines_and_remove_files_when_saved | 2 行，一行 2 份图纸 | 改全部字段 + 删 1 图纸、加 1 行、不带另一行 | 2 行；字段生效；图纸 REMOVED、对象已删；`createdLineIds` 1 个 | P0 | 功能 | IT savingReplacesTheDraftInOneGo |
| 10 | should_save_line_without_code_name_qty_when_draft | 草稿 | 新行三项都空 | 200，三字段不出现 | P0 | 功能 | IT draftCanHoldIncompleteLinesButCannotSubmitThem |
| 11 | should_clear_shipTo_when_saved_without_address | 有地址 | `shipTo: null` | 地址清空 | P1 | 功能 | ★ IT savingWithoutAnAddressClearsIt |
| 12 | should_reject_when_quantity_zero | 草稿 | 数量 0 | 400 | P0 | 参数校验 | IT quantityMustBePositive |
| 13 | should_reject_when_quantity_fractional | 草稿 | 数量 1.5 | 400，行数不变 | P1 | 参数校验 | IT fractionalQuantityIsRejectedInsteadOfTruncated |
| 14 | should_reject_when_customerRev_over_50 | 草稿 | 客户版本 51 字符 | 400，没加上行 | P2 | 参数校验 | ★ IT customerRevLongerThan50IsRejected |
| 15 | should_rollback_all_when_one_line_id_unknown | 1 行 | 改它 + 带不存在的 id | 404，原行没变 | P0 | 异常 | IT saveRejectsTheWholeRequestWhenOneLineIsInvalid |
| 16 | should_return_404_when_same_line_id_sent_twice | 1 行 | 同一 id 两次 | 404 `order.line_not_found`，还是 1 行 | P1 | 边界 | ★ IT sameLineIdTwiceIsRejected |
| 17 | should_return_404_when_line_belongs_to_other_order | 同客户两张草稿 | A 里带 B 的行 | 404 | P0 | 安全 | IT saveRejectsLinesAndFilesFromAnotherOrder |
| 18 | should_return_404_when_removeFileId_from_other_line | 同上 | A 的行删 B 的图纸 | 404，B 图纸仍 COMPLETED | P0 | 安全 | IT 同上 |
| 19 | should_return_404_when_other_customer_saves | 别家客户 | 保存 | 404，行数不变 | P0 | 安全 | IT saveOnlyWorksOnYourOwnDraft / anotherCustomerCannotSeeOrTouchTheOrder |
| 20 | should_return_409_when_order_submitted | 已提交 | 保存 | 409 `order.not_draft` | P0 | 异常（非法转换） | IT submittingLocksTheRevisionAndFreezesTheOrder |
| 21 | should_return_409_when_changing_rev_on_locked_revision | 行挂已锁版本 | 改客户版本 | 409 `part.revision_locked` | P1 | 异常 | IT aLineOnALockedRevisionKeepsItsDrawingsAndRevision |
| 22 | should_return_409_when_removing_file_on_locked_revision | 同上 | 删图纸 | 409 `part.revision_locked` | P1 | 异常 | IT 同上 |
| 23 | should_update_line_fields_when_revision_locked | 同上 | 只改数量 | 200，生效 | P1 | 边界 | IT 同上 |
| 24 | should_keep_file_in_storage_when_save_rolls_back | 行有图纸 | 删它 + 删别的订单的图纸（第一份改完才失败） | 404；图纸仍 COMPLETED、对象还在 | P0 | 异常 | ★ IT aFailedSaveKeepsTheDrawingItWasAskedToRemove（临时把删对象改成立即删，此用例变红，确认有效） |
| 25 | should_persist_line_edits_when_files_removed_in_same_save | 行有图纸 | 同一次改名称 + 删图纸 | 名称生效 | P0 | 边界 | IT savingReplacesTheDraftInOneGo |
| 26 | should_be_idempotent_when_removing_already_removed_file | 图纸已 REMOVED | 再删 | 200 | P2 | 边界 | ★ IT removingAnAlreadyRemovedFileAgainIsHarmless |
| 27 | should_keep_last_write_when_two_saves_race | 同一草稿 | 两个保存同时发（10 轮） | 都 200；结果是其中一份完整内容 | P2 | 边界 | ★ IT concurrentSavesLeaveOneCompleteVersion |
| 28 | should_never_leave_unlocked_line_when_save_races_submit | 可提交 | 保存加行 + 提交同时发 | 已提交的单里没有未锁定行 | P0 | 异常 | IT addingALineWhileSubmittingNeverLeavesAnUnlockedLineOnASubmittedOrder |

## 后端：PUT /customer/orders/{id}/ship-to — 提交后单独改地址

| # | 用例名称 | 前置条件 | 操作 | 预期结果 | 优先级 | 类型 | 覆盖 |
|---|---|---|---|---|---|---|---|
| 29 | should_update_shipTo_when_status_submitted_quoted_confirmed | 三种状态 | 改地址 | 200 | P0 | 功能 | IT shipToCanBeChangedAfterSubmitUntilTheOrderIsReady |
| 30 | should_return_409_when_status_ready_or_cancelled | READY / CANCELLED | 改地址 | 409 `order.ship_to_locked` | P0 | 异常（非法转换） | IT 同上 |
| 31 | should_reject_when_country_not_iso2_or_city_blank | 草稿 | 国家 "Germany" / 城市空 | 400 | P0 | 参数校验 | IT shipToRejectsAnIncompleteAddress |
| 32 | should_return_404_when_other_customer | 别家 | 改地址 | 404 | P0 | 安全 | IT anotherCustomerCannotSeeOrTouchTheOrder |
| 33 | should_not_touch_address_book_when_order_address_changed | 地址簿有一条 | 单独改 + 整张保存都改地址 | 地址簿那条不变 | P1 | 功能 | ★ IT changingTheOrderAddressLeavesTheAddressBookAlone |

## 后端：POST /customer/orders/{id}/submit — 提交

| # | 用例名称 | 前置条件 | 操作 | 预期结果 | 优先级 | 类型 | 覆盖 |
|---|---|---|---|---|---|---|---|
| 34 | should_return_400_line_incomplete_with_ids_when_line_missing_fields | 一行齐一行空（都有图纸） | 提交 | 400 `order.line_incomplete`，`data` 只有空行 id | P0 | 异常 | IT draftCanHoldIncompleteLinesButCannotSubmitThem |
| 35 | should_report_line_incomplete_before_missing_drawing | 一行没填齐、一行缺图纸 | 提交 | 400 `order.line_incomplete` | P1 | 边界 | ★ IT incompleteLinesAreReportedBeforeMissingDrawings |
| 36 | should_return_400_when_only_quantity_missing | 只缺数量 | 提交 | 400 `order.line_incomplete` | P1 | 边界 | ★ IT aLineWithoutQuantityBlocksSubmit |
| 37 | should_submit_when_all_complete | 都齐 | 提交 | SUBMITTED，版本锁定 | P0 | 功能（DRAFT→SUBMITTED） | IT submittingLocksTheRevisionAndFreezesTheOrder；人工 |
| 38 | should_return_409_when_already_submitted | 已提交 | 再提交 | 409 `order.not_draft` | P0 | 异常（非法转换） | IT 同上 |

## 前端纯函数：lib/orderDraft.ts

| # | 用例名称 | 操作 | 预期结果 | 优先级 | 类型 | 覆盖 |
|---|---|---|---|---|---|---|
| 39 | should_map_saved_lines_to_rows_when_fromOrder | 订单有缺字段的行 | 缺字段为空串，图纸映射为已保存文件 | P0 | 功能 | UT fromOrder |
| 40 | should_not_be_dirty_when_only_whitespace_changed | 名称前后加空格 | false | P1 | 边界 | UT isDirty |
| 41 | should_be_dirty_when_title_date_or_shipTo_changed | 改名称 / 交期 / 地址 / 清地址 | 都 true | P0 | 功能 | ★ UT #41 |
| 42 | should_be_dirty_when_row_removed_or_file_added_or_removed | 删行、加删图纸 | 都 true | P0 | 功能 | UT isDirty |
| 43 | should_not_be_dirty_for_new_order_with_default_address | 新单只带默认地址 | false | P1 | 边界 | UT isDirty |
| 44 | should_build_line_inputs_with_ids_removals_and_new_index | 已有行 + 新行 | id、`removeFileIds`、新行编号正确 | P0 | 功能 | UT toSavePlan |
| 45 | should_send_null_when_wantedDate_empty | 交期空串 | `wantedDate: null` | P1 | 边界 | ★ UT #45 |
| 46 | should_reject_zero_negative_decimal_qty | 0 / -1 / 1.5 / abc / 1e3 | 都 invalid；空、" 12 " 合法 | P0 | 参数校验 | UT qtyInvalid |
| 47 | should_attach_files_to_saved_rows_with_same_number | 已保存行 + 新导入图纸 | 挂到已有行，保留 lineId | P0 | 功能 | UT mergeImport |
| 48 | should_attach_one_file_to_every_list_row_with_same_number | 清单两行同图号 + 一份图纸 | 两行各挂一份 | P1 | 边界 | ★ UT #48 |
| 49 | should_count_invalid_qty_as_incomplete | 数量 "0" | incompleteRows = 1 | P1 | 边界 | ★ UT #49 |
| 50 | should_have_problems_when_only_company_missing | 只缺公司名 | hasProblems = true | P1 | 边界 | ★ UT #50 |

## 页面流程（人工，中文界面，本地后端）

| # | 用例名称 | 操作 | 预期结果 | 优先级 | 类型 | 覆盖 |
|---|---|---|---|---|---|---|
| 51 | should_restore_order_when_cancel_confirmed | 编辑改数量 → 取消 → 撤销改动 | 回只读，数值恢复 | P0 | 功能 | 人工 |
| 52 | should_create_order_on_first_save_when_new | 新建 → 导入 → 保存 | 跳 `/orders/:id`，图纸传上 | P0 | 功能 | 人工 |
| 53 | should_leave_no_order_when_new_cancelled_untouched | 新建 → 取消 | 订单数不变 | P0 | 功能 | 人工 |
| 54 | should_block_navigation_when_dirty | 编辑中点侧栏 | 弹「离开这个页面？」 | P0 | 功能 | 人工 |
| 55 | should_keep_failed_files_red_when_upload_fails | 页面里让上传请求失败 → 保存 → 恢复 → 再保存 | 第一次：留在编辑、文件标红、提示；第二次：传上、退出编辑 | P0 | 异常 | ★ 人工 |
| 56 | should_highlight_missing_when_fix_clicked | 提交检查 → 去完善 | 缺的地方标红 | P0 | 功能 | 人工 |
| 57 | should_go_to_settings_when_only_company_missing | 只缺公司名（页面里把组织接口返回的名称改空）→ 去完善 | 弹框只列「公司名称」；跳 `/customer/settings` | P1 | 功能 | ★ 人工 |
| 58 | should_add_to_book_as_default_when_book_empty | 地址簿空 → 选择地址 | 直接新增；进地址簿且为默认；用在订单 | P0 | 功能 | 人工 |
| 59 | should_show_lock_note_and_no_buttons_when_ready | READY 状态 | 地址卡没按钮，显示锁定说明 | P1 | 功能 | ★ 人工 |
| 60 | should_download_when_file_not_previewable | 点 `.step` 文件名 | 只请求下载链接，不开预览，不离开页面（PDF 仍开预览） | P2 | 功能 | ★ 人工 |
| 61 | should_block_save_and_mark_cell_when_qty_invalid | 数量填 abc → 保存 | 不发请求；只把这一格标红；显示提示 | P1 | 参数校验 | ★ 人工（发现并修了一个问题，见下） |

## 补测结果（2026-11-27）

- 后端：`CustomerOrderFlowIT` 41 个（新增 12 个）全部通过。
- 前端：`npx vitest run` 47 个（新增 5 个）全部通过；`npm run type-check` 通过。
- 人工：#55 #57 #59 #60 #61 通过，顺带验证了：日期选择器能选日期并保存；提交成功后「编辑」消失、地址仍可单独「修改」且立即生效、刷新后还在。
- **发现并修复**：#61 保存时有数量不合法，原来会把整张表所有空的名称 / 数量格子一起标红（等于在草稿里提示必填，违反 11-27 拍板）。
  改成只标不合法的数量格，「全部缺项标红」只在提交检查「去完善」之后出现。
- **记录的现象**：#55 上传失败那一次，服务端会留下一条 PENDING 状态的图纸记录（客户看不到、不影响提交判断）。

## 覆盖统计

```yaml
coverage:
  targets: 14          # 4 个接口 + 10 个 orderDraft 函数
  covered: 14
  ratio: 100%
cases: 61              # P0: 37 / P1: 19 / P2: 5
distribution: { unit: 12, integration: 38, manual_e2e: 11, p0: 37, p1: 19, p2: 5 }
gaps_before: 25        # 后端 15 / 纯函数 5 / 页面 5
gaps_after: 0
```
