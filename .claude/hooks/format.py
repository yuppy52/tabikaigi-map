#!/usr/bin/env python3
"""PostToolUse フック：Claude が書いた・直したファイルに Prettier を当てる（ADR 0009）。

CI の prettier --check で、見た目の差だけで落ちる手戻りを減らすためのもの。
.prettierignore に入っているファイル（docs の Markdown など）と、Prettier が知らない種類のファイルは何もしない。
Prettier が失敗しても Claude の作業は止めない（CI で見つかる）。
"""
import json
import os
import subprocess
import sys


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    path = (data.get("tool_input") or {}).get("file_path")
    project = os.environ.get("CLAUDE_PROJECT_DIR", "")
    if not path or not project or not os.path.isfile(path):
        return
    # リポジトリの外（scratchpad など）のファイルは整えない
    if not os.path.realpath(path).startswith(os.path.realpath(project) + os.sep):
        return
    prettier = os.path.join(project, "node_modules", ".bin", "prettier")
    if not os.path.exists(prettier):
        return
    subprocess.run([prettier, "--write", "--ignore-unknown", "--log-level", "silent", path],
                   cwd=project, timeout=20, check=False)


if __name__ == "__main__":
    main()
