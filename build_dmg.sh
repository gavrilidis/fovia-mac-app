#!/bin/bash
# Build a signed release DMG for FaceFlow.
# Signing credentials are loaded from ~/.tauri/faceflow.env (never committed).
#
# After Tauri produces the DMG, this script repacks it with an extra
# read-only file ("Инструкция по установке.txt") visible alongside the
# FaceFlow.app icon and the /Applications symlink, so end users see the
# installation guide directly inside the disk image window.
set -euo pipefail

ENV_FILE="$HOME/.tauri/faceflow.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Run 'npm run tauri signer generate' first." >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

# Do NOT set FACEFLOW_SECRET — build.rs reads activation.secret automatically.
unset FACEFLOW_SECRET

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
INSTRUCTION_SRC="$REPO_ROOT/docs/Инструкция по установке.txt"

if [ ! -f "$INSTRUCTION_SRC" ]; then
  echo "ERROR: install instruction file not found at $INSTRUCTION_SRC" >&2
  exit 1
fi

echo "Building FaceFlow release DMG…"
cd "$REPO_ROOT/faceflow-client"
npm run tauri build

DMG_PATH=$(ls -t src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null | head -1 || true)
if [ -z "${DMG_PATH:-}" ] || [ ! -f "$DMG_PATH" ]; then
  echo "ERROR: no DMG produced by Tauri." >&2
  exit 1
fi

echo ""
echo "Injecting install instructions into $DMG_PATH…"

# Workflow: convert the read-only DMG produced by Tauri to a writable
# format, mount it, copy the instructions file into its root, unmount,
# then convert back to a compressed read-only image (UDZO) so the final
# size stays small. The file is laid out at the DMG root, the same level
# as FaceFlow.app and the /Applications symlink.
TMP_RW="$(mktemp -t faceflow_rw).dmg"
hdiutil convert "$DMG_PATH" -format UDRW -o "$TMP_RW" -ov >/dev/null

MOUNT_DIR="$(mktemp -d -t faceflow_mnt)"
hdiutil attach "$TMP_RW" -nobrowse -mountpoint "$MOUNT_DIR" >/dev/null
trap 'hdiutil detach "$MOUNT_DIR" >/dev/null 2>&1 || true; rm -f "$TMP_RW"' EXIT

cp "$INSTRUCTION_SRC" "$MOUNT_DIR/"

# Detach explicitly so the next convert step has exclusive access. The
# trap will still run, but its detach call becomes a no-op once the
# volume is gone.
hdiutil detach "$MOUNT_DIR" >/dev/null

# Repack as compressed read-only and atomically replace the original.
hdiutil convert "$TMP_RW" -format UDZO -imagekey zlib-level=9 -o "$DMG_PATH" -ov >/dev/null
rm -f "$TMP_RW"
trap - EXIT

# Re-sign the modified DMG so notarisation/Gatekeeper still trust it.
# The Apple-issued Developer ID certificate is expected to live in the
# default keychain; if APPLE_SIGNING_IDENTITY is set we honour it.
if [ -n "${APPLE_SIGNING_IDENTITY:-}" ]; then
  echo "Re-signing DMG with $APPLE_SIGNING_IDENTITY…"
  codesign --force --sign "$APPLE_SIGNING_IDENTITY" "$DMG_PATH"
fi

echo ""
echo "Done. DMG (with installation instructions inside):"
ls -lh "$DMG_PATH"
