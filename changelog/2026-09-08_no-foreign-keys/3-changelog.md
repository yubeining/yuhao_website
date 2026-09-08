# 变更记录 —— 落实禁止外键

> 2026-09-08 ｜ Schema + 提交闸门

## 清存量
- `database/migrations/2026-09-08_02_drop-all-foreign-keys.sql`：`DROP CONSTRAINT IF EXISTS` 掉
  全部 63 个外键（约束名从 pg_constraint 实测导出）。§4：删存量外键不走扩展-收缩，一次发布即可。
- 验证：真库应用后 `pg_constraint contype='f'` = **0**；主键 94 / 唯一 48 全保留；应用启动 health UP。

## 加闸门（三处同步）
- `scripts/check-no-foreign-keys.py`：diff-aware，只卡新增/改动行里的 `REFERENCES` / `FOREIGN KEY` /
  `ON DELETE|UPDATE CASCADE`；跳过 SQL 注释；合并提交跳过。
- `.githooks/pre-commit`：加 `gate_no_foreign_keys`（第 5 道）。
- `.github/workflows/code-quality.yml`：加「禁止数据库外键」步骤。
- 验证：对清理迁移放行（注释里的 REFERENCES 不误报）；对含真外键的迁移拒（exit 1）。

## 说明
- 关联完整性靠 service 层带租户条件显式校验（§3 铁律 3）+ 显式索引，不靠外键。
- 08-02 旧迁移文件里的 `REFERENCES` 文本仍在（不改历史迁移，hash 漂移检测），但约束已被 02 迁移删掉；
  闸门 diff-aware 不会去碰那些未改动的旧行。

## 部署清单
- 一个新迁移，开机自动应用（DROP 约束，秒级）。向后兼容：旧版本代码不依赖外键存在（§4）。
