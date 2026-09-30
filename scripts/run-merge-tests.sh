#!/usr/bin/env bash
# 合并引擎纯函数场景测试：用 esbuild 打包 TS 后在 Node 运行
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FE="$ROOT/frontend"
TMP="$FE/node_modules/.tmp"
mkdir -p "$TMP"
"$FE/node_modules/.bin/esbuild" "$FE/src/utils/merge.ts" \
  --bundle --format=esm --outfile="$TMP/merge.bundle.mjs" --log-level=warning
sed "s|../frontend/src/utils/merge.ts|$TMP/merge.bundle.mjs|" \
  "$ROOT/scripts/test-merge.mjs" > "$TMP/test-merge.run.mjs"
node "$TMP/test-merge.run.mjs"
