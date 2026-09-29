#!/usr/bin/env python3
"""PostToolUse フック：Claude が使ったツールを .claude/logs/tool-use.jsonl に1行ずつ記録する。

「ファイルを読みました」と言ったときに、本当に読んだかを後から確かめるためのもの。
ファイルの中身やツールの結果は記録しない（どのツールを、何に対して使ったかだけ）。
"""
import json
import os
import sys
from datetime import datetime, timezone

MAX_LEN = 300


def short(value):
    s = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    return s if len(s) <= MAX_LEN else s[:MAX_LEN] + "…"


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    tool_input = data.get("tool_input") or {}
    target = {
        k: short(tool_input[k])
        for k in ("file_path", "path", "pattern", "glob", "offset", "limit",
                  "command", "url", "query", "description", "subagent_type", "skill")
        if k in tool_input
    }
    entry = {
        "ts": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "session": data.get("session_id"),
        "agent": data.get("agent_id") or data.get("agent_type") or "main",
        "tool": data.get("tool_name"),
        "target": target,
    }
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or "."
    log_dir = os.path.join(project_dir, ".claude", "logs")
    os.makedirs(log_dir, exist_ok=True)
    with open(os.path.join(log_dir, "tool-use.jsonl"), "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass  # ログの失敗で作業を止めない
