#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/env.sh"
cd "$NUZUL_ROOT"
START=$SECONDS
mkdir -p .tools .demo-data evidence reports
chmod 700 .demo-data
if ! command -v dotnet >/dev/null || ! dotnet --list-sdks | grep -q "^10\."; then
 curl -fsSL https://dot.net/v1/dotnet-install.sh -o .tools/dotnet-install.sh
 bash .tools/dotnet-install.sh --channel 10.0 --install-dir "$NUZUL_ROOT/.tools/dotnet"
fi
if ! command -v dart >/dev/null; then
 case "$(uname -m)" in x86_64) ARCH=x64;; aarch64) ARCH=arm64;; *) echo 'Install Dart SDK manually for this architecture'; exit 1;; esac
 case "$(uname -s)" in Linux) NUZUL_DART_OS=linux;; Darwin) NUZUL_DART_OS=macos;; *) echo "Install Dart manually on this OS"; exit 1;; esac
 curl -fL "https://storage.googleapis.com/dart-archive/channels/stable/release/latest/sdk/dartsdk-$NUZUL_DART_OS-$ARCH-release.zip" -o .tools/dart.zip
 unzip -q .tools/dart.zip -d .tools
fi
node --version
dotnet --version
dart --version
npm --prefix frontend ci
dotnet build backend -c Release
dotnet build runners/csharp -c Release
npm --prefix frontend run build
printf 'Setup elapsed: %s seconds\n' "$((SECONDS-START))"
