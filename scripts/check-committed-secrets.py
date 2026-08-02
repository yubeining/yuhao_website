#!/usr/bin/env python3
"""密钥提交闸门 —— 扫描【任何文件】的新增行。

密钥一旦进了 git 历史就永远在那里，删掉后续 commit 也没用 ——
只能去供应商侧轮换（改 GCP key / 重发 Azure secret / 重签证书）。
所以这道闸门是提交前拦截，不是提交后清理。

两类检测：
  1. 已知厂商密钥格式（前缀足够特征，误报率低）
  2. 配置文件里的「密钥命名 + 硬编码值」启发式

正确做法：
  * 本地开发  → application-local.yml（已 gitignore）
  * 部署环境  → 环境变量 / Secret Manager，配置里写 ${ENV_VAR:}

用法:
    check-committed-secrets.py              # 校验暂存区
    check-committed-secrets.py BASE HEAD    # 校验 diff（CI）
"""
import re
import subprocess
import sys

# --- 1. 厂商密钥格式 ---------------------------------------------------------
VENDOR_PATTERNS = [
    (re.compile(r"sk-ant-[A-Za-z0-9_\-]{20,}"),          "Anthropic API key"),
    (re.compile(r"sk-proj-[A-Za-z0-9_\-]{20,}"),         "OpenAI project key"),
    (re.compile(r"AIza[0-9A-Za-z_\-]{35}"),              "Google API key"),
    (re.compile(r"GOCSPX-[0-9A-Za-z_\-]{20,}"),          "Google OAuth client secret"),
    (re.compile(r"SG\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}"), "SendGrid API key"),
    (re.compile(r"gh[pousr]_[A-Za-z0-9]{36}"),           "GitHub token"),
    (re.compile(r"xox[baprs]-[A-Za-z0-9\-]{10,}"),       "Slack token"),
    (re.compile(r"AKIA[0-9A-Z]{16}"),                    "AWS access key id"),
    (re.compile(r"-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----"), "私钥 PEM"),
    # Azure client secret 家族：38-40 字符，含 "8Q~" / "~" 样式
    (re.compile(r"[A-Za-z0-9._~\-]{3}8Q~[A-Za-z0-9._~\-]{30,}"), "Azure client secret"),
    # 微信/企微 —— 本项目会用到
    (re.compile(r"corpsecret[\"'\s:=]+[A-Za-z0-9_\-]{40,}"), "企业微信 corpsecret"),
]

# --- 2. 配置文件里的硬编码启发式 ----------------------------------------------
SECRET_NAME = re.compile(
    r"(?i)\b("
    r"password|passwd|secret|api[_\-]?key|access[_\-]?key|private[_\-]?key|"
    r"client[_\-]?secret|auth[_\-]?token|credential"
    r")\b"
)
# 赋值形式：key: value / key = value / "key": "value"
ASSIGNMENT = re.compile(r"""[:=]\s*["']?([^"'\s#,}]{8,})["']?\s*$""")

CONFIG_SUFFIXES = (
    ".yml", ".yaml", ".properties", ".env", ".conf", ".ini",
    ".json", ".toml", ".tf", ".tfvars",
)

# 明显不是真密钥的值
PLACEHOLDER = re.compile(
    r"(?i)^("
    r"\$\{.*\}|"            # ${ENV:default}  ← 正确做法
    r"<.*>|"                # <your-secret>
    r"changeme|change_me|placeholder|example|sample|dummy|todo|tbd|"
    r"xxx+|\*+|\.\.\.|"
    r"null|none|empty|"
    r"true|false"
    r")$"
)


def added_lines(argv):
    """返回 [(文件路径, 行号, 行内容)]，只含新增行。"""
    if len(argv) >= 3:
        cmd = ["git", "diff", "--unified=0", argv[1], argv[2]]
    else:
        cmd = ["git", "diff", "--cached", "--unified=0"]
    diff = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout

    results, path, lineno = [], None, 0
    for line in diff.splitlines():
        if line.startswith("+++ b/"):
            path = line[6:]
        elif line.startswith("@@"):
            m = re.search(r"\+(\d+)", line)
            lineno = int(m.group(1)) if m else 0
        elif line.startswith("+") and not line.startswith("+++"):
            if path:
                results.append((path, lineno, line[1:]))
            lineno += 1
    return results


def scan(path, lineno, text):
    """返回该行的告警列表。"""
    hits = []

    for pattern, label in VENDOR_PATTERNS:
        if pattern.search(text):
            hits.append(label)

    if path.endswith(CONFIG_SUFFIXES) and SECRET_NAME.search(text):
        m = ASSIGNMENT.search(text)
        if m:
            value = m.group(1).strip()
            if not PLACEHOLDER.match(value):
                hits.append("配置项疑似硬编码密钥值")

    return hits


def main():
    findings = []
    for path, lineno, text in added_lines(sys.argv):
        # 允许在本闸门自己和示例配置里出现样例
        if path.endswith("check-committed-secrets.py"):
            continue
        if path.endswith(".example") or path.endswith(".example.yml"):
            continue
        for label in scan(path, lineno, text):
            findings.append((path, lineno, label, text.strip()[:100]))

    if findings:
        print("\n✗ 密钥提交闸门未通过\n", file=sys.stderr)
        for path, lineno, label, snippet in findings:
            print(f"  {path}:{lineno}  [{label}]", file=sys.stderr)
            print(f"    {snippet}\n", file=sys.stderr)
        print("  密钥进了 git 历史就删不掉，只能去供应商侧轮换。", file=sys.stderr)
        print("  正确做法：配置里写 ${ENV_VAR:}，真值放", file=sys.stderr)
        print("    * 本地 → application-local.yml（已 gitignore）", file=sys.stderr)
        print("    * 部署 → 环境变量 / Secret Manager\n", file=sys.stderr)
        print("  确认是误报？在 PR 里说明，不要用 --no-verify。\n", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
