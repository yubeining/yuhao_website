#!/usr/bin/env bash
# 激活仓库自带的 git hooks。
#
# core.hooksPath 是本地配置，git clone 不会带过来 ——
# 每个新 clone / 每个 git worktree add 都要跑一次这个脚本。
#
#   ./scripts/setup-hooks.sh

set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

chmod +x .githooks/* scripts/*.sh scripts/*.py 2>/dev/null || true

git config core.hooksPath .githooks

echo "✓ git hooks 已激活 (core.hooksPath = .githooks)"
echo ""
echo "  commit-msg  : 提交消息格式 <Ticket>, <type>, <describe>"
echo "  pre-commit  : 迁移文件名 / 密钥扫描 / 冲突标记 / Java 非 ASCII 字面量"
echo ""
echo "  自检：git config --get core.hooksPath"
