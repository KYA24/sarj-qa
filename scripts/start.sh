#!/usr/bin/env bash
# Default portable reviewer experience. The private device service is independent.
set -euo pipefail
exec "$(dirname "$0")/start-demo.sh" "$@"
