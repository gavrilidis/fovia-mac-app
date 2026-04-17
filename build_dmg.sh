#!/bin/bash
# Build a signed release DMG for FaceFlow.
# Signing credentials are loaded from ~/.tauri/faceflow.env (never committed).
set -euo pipefail

ENV_FILE="$HOME/.tauri/faceflow.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Run 'npm run tauri signer generate' first." >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

FACEFLOW_SECRET="${FACEFLOW_SECRET:-dev_secret}"

echo "Building FaceFlow release DMG…"
cd "$(dirname "$0")/faceflow-client"
FACEFLOW_SECRET="$FACEFLOW_SECRET" npm run tauri build

echo ""
echo "Done. DMG:"
ls -lh src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null || true
