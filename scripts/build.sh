#!/bin/bash
set -e

echo "=== Building Next.js ==="
npx next build

echo "=== Copying static assets into standalone ==="
cp -r .next/static .next/standalone/.next/static
[ -d public ] && cp -r public .next/standalone/public || true

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

echo "=== Packaging with electron-builder ==="
npx electron-builder --config electron-builder.yml

echo "=== Copying standalone into packaged app ==="
if [ -d "dist-electron/mac-arm64" ]; then
  APP="dist-electron/mac-arm64/UCL Study Manager.app/Contents/Resources/standalone"
  rm -rf "$APP"
  cp -r .next/standalone "$APP"
  echo "  copied to $APP"
fi

echo "=== Done ==="
du -sh "dist-electron/mac-arm64/UCL Study Manager.app" 2>/dev/null || true
