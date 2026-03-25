#!/bin/bash
set -e

# Parse platform flag (default: current platform)
PLATFORM=""
for arg in "$@"; do
  case $arg in
    --win) PLATFORM="--win" ;;
    --mac) PLATFORM="--mac" ;;
    --linux) PLATFORM="--linux" ;;
  esac
done

echo "=== Building Next.js ==="
npx next build

echo "=== Copying static assets into standalone ==="
cp -r .next/static .next/standalone/.next/static
[ -d public ] && cp -r public .next/standalone/public || true

echo "=== Removing .env from standalone (config comes from Electron) ==="
rm -f .next/standalone/.env

echo "=== Resolving symlinks in standalone ==="
cd .next/standalone
find . -type l | while read -r link; do
  target=$(readlink "$link")
  if [ -e "$link" ]; then
    rm "$link"
    cp -r "$(dirname "$link")/$target" "$link"
    echo "  resolved: $link"
  fi
done
cd ../..

echo "=== Packaging with electron-builder ${PLATFORM} ==="
npx electron-builder ${PLATFORM} --config electron-builder.yml

echo "=== Copying standalone into packaged app ==="
# macOS
if [ -d "dist-electron/mac-arm64" ]; then
  APP="dist-electron/mac-arm64/UCL Study Manager.app/Contents/Resources/standalone"
  rm -rf "$APP"
  cp -r .next/standalone "$APP"
  echo "  copied to macOS app"
fi
# Windows
if [ -d "dist-electron/win-unpacked" ]; then
  APP="dist-electron/win-unpacked/resources/standalone"
  rm -rf "$APP"
  cp -r .next/standalone "$APP"
  echo "  copied to Windows app"
fi

echo "=== Done ==="
ls -lh dist-electron/*.exe dist-electron/*.dmg 2>/dev/null || true
du -sh dist-electron/mac-arm64/*.app dist-electron/win-unpacked 2>/dev/null || true
