#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE_DIR="$ROOT_DIR/site"
OUT_DIR="$ROOT_DIR/_site"
PORT="${1:-${PORT:-4173}}"

if [ ! -d "$SITE_DIR/node_modules" ]; then
  echo "Installing site dependencies..."
  npm --prefix "$SITE_DIR" ci
fi

echo "Building site..."
npm --prefix "$SITE_DIR" run build

echo "Serving site at http://localhost:$PORT (Ctrl+C to stop)"
exec python3 -m http.server "$PORT" --directory "$OUT_DIR"
