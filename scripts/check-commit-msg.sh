#!/usr/bin/env bash
# 提交消息格式校验：<Ticket>, <type>, <describe>
#
#   MFG-12, feat, [quote] add validity-period guard on acceptance
#   #0, doc, [docs] update migration naming rules
#
# 规则见 CLAUDE.md > 12. 提交与审查
# 被拒时改消息，不改本脚本。永远不用 git commit --no-verify。

set -u

MSG_FILE="${1:?usage: check-commit-msg.sh <path-to-COMMIT_EDITMSG>}"
[ -f "$MSG_FILE" ] || { echo "commit-msg: 找不到消息文件 $MSG_FILE" >&2; exit 1; }

# 剥掉 git 自己写的注释行。
# ★ 只剥 "#" + 空白 或 单独一个 "#" —— git 的注释永远是 "# Please enter..." 这种形状。
#   不能简单用 ^# ，否则会把合法的 "#0, fix, ..." 整条剥掉，#0 逃生口就废了。
STRIPPED=$(grep -Ev '^#([[:space:]]|$)' "$MSG_FILE")
SUBJECT=$(printf '%s\n' "$STRIPPED" | grep -v '^[[:space:]]*$' | head -n 1)

fail() {
    echo "" >&2
    echo "✗ 提交消息不符合规范" >&2
    echo "" >&2
    echo "  收到: $SUBJECT" >&2
    echo "" >&2
    echo "  $1" >&2
    echo "" >&2
    echo "  格式: <Ticket>, <type>, <describe>" >&2
    echo "  示例: MFG-12, feat, [quote] add validity guard on acceptance" >&2
    echo "        #0, fix, [sourcing] strip customer name from supplier DTO" >&2
    echo "" >&2
    echo "  Ticket  : 工单号 ABC-123，无工单的紧急修复用 #0" >&2
    echo "  type    : feat fix perf refactor style merge revert test doc" >&2
    echo "  describe: 英文，模块用 [scope] 前缀，不能为空" >&2
    echo "" >&2
    exit 1
}

# 标准 merge commit 直接放行
if printf '%s' "$SUBJECT" | grep -qE "^Merge (branch|tag|remote-tracking branch|commit) '.*'"; then
    :
else
    PATTERN='^[[:space:]]*(#0|[A-Z]+-[0-9]+)[[:space:]]*,[[:space:]]*(feat|fix|perf|refactor|style|merge|revert|test|doc)[[:space:]]*,[[:space:]]*[^[:space:]].*$'
    printf '%s' "$SUBJECT" | grep -qE "$PATTERN" \
        || fail "标题不匹配格式（注意逗号是英文逗号，describe 不能只有空白）"
fi

# 整条消息（含正文）不许有中文 —— 见 CLAUDE.md §7
#
# ★ 用 python3 而不是 grep -P：macOS 自带的 BSD grep 不支持 -P，
#   会静默失败（返回非 0），导致这道检查形同虚设。
#   本仓库其他闸门本来就依赖 python3，这里保持一致。
if command -v python3 >/dev/null 2>&1; then
    if printf '%s' "$STRIPPED" | python3 -c '
import re, sys
text = sys.stdin.read()
sys.exit(1 if re.search(r"[一-鿿㐀-䶿]", text) else 0)
'; then
        :
    else
        fail "提交消息里出现中文。整条消息（含正文）必须是英文。"
    fi
else
    echo "commit-msg: 警告 —— 未找到 python3，跳过中文检查" >&2
fi

exit 0
