#!/usr/bin/env bash
NUZUL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$NUZUL_ROOT/.tools/dotnet:$NUZUL_ROOT/.tools/dart-sdk/bin:$PATH"
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
export NUZUL_ROOT
