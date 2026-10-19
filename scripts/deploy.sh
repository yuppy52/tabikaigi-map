#!/bin/sh
# 本番に出す（npm run deploy）。手順は docs/design/deploy.md の「ふだんのデプロイ」。
# 途中のどれかが失敗したら、そこで止まって wrangler deploy まで進まない（set -e）
set -e

# 1. main の最新から出す（マージしていないブランチや、pull し忘れた古い main を出さない）
if [ "$(git branch --show-current)" != "main" ]; then
  echo "main ではないブランチです。git switch main && git pull をしてから出してください" >&2
  exit 1
fi
if ! git fetch --quiet origin main; then
  echo "GitHub の main を取りに行けませんでした（ネットにつながっているか確かめてください）。main が最新か分からないので止めます" >&2
  exit 1
fi
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "手元の main が GitHub の main と違います。git pull をしてから出してください" >&2
  exit 1
fi

# 2. コミットしていない変更が混ざらないようにする（出したものと main を一致させる）
if [ -n "$(git status --porcelain)" ]; then
  echo "コミットしていない変更があります（git status で見てください）" >&2
  exit 1
fi

# 3. 型、lint、テスト（CI と同じもの）
npm run typecheck
npm run lint
npm test

# 4. 画面のビルド（dist/ に作り直す）
npm run build

# 5. 出す
wrangler deploy
