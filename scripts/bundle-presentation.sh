#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/env.sh"
mkdir -p "$NUZUL_ROOT/frontend/public/presentation"
cp "$NUZUL_ROOT/presentation/index.html" "$NUZUL_ROOT/frontend/public/presentation/index.html"
cp -R "$NUZUL_ROOT/presentation/composition" "$NUZUL_ROOT/frontend/public/presentation/"
