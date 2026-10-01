#!/usr/bin/env bash
# Builds the deployable web bundle:
#   /            -> marketing site (website/)
#   /app/        -> Flutter web app
# Used by Netlify/Vercel/CI. Reads public config from environment variables.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${SUPABASE_URL:?Set SUPABASE_URL}"
: "${SUPABASE_ANON_KEY:?Set SUPABASE_ANON_KEY}"
APP_ENV="${APP_ENV:-production}"
SITE_URL="${SITE_URL:-https://businesspilot.app}"
FLUTTER_VERSION="${FLUTTER_VERSION:-3.35.5}"

if ! command -v flutter >/dev/null 2>&1; then
  echo "→ installing Flutter $FLUTTER_VERSION"
  curl -sSfL "https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_${FLUTTER_VERSION}-stable.tar.xz" | tar -xJ -C "$HOME"
  export PATH="$HOME/flutter/bin:$PATH"
  git config --global --add safe.directory '*' || true
fi

flutter --disable-analytics >/dev/null 2>&1 || true
flutter pub get
flutter build web --release --base-href /app/ \
  --dart-define=SUPABASE_URL="$SUPABASE_URL" \
  --dart-define=SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
  --dart-define=APP_ENV="$APP_ENV" \
  --dart-define=SITE_URL="$SITE_URL" \
  --dart-define=WEB_BASE_PATH=/app/ \
  --dart-define=GOOGLE_AUTH_ENABLED="${GOOGLE_AUTH_ENABLED:-false}"

SITE_URL="$SITE_URL" APP_PATH=/app/ node website/build.mjs

rm -rf public && mkdir -p public
cp -R website/dist/. public/
mkdir -p public/app && cp -R build/web/. public/app/
echo "✓ public/ ready (site at /, app at /app/)"
