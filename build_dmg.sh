#!/bin/bash
# Build a release DMG for FaceFlow.
#
# Two signing modes are supported, auto-selected based on whether a real
# Developer ID certificate is available:
#
#   1. OFFICIAL  — when $APPLE_SIGNING_IDENTITY points at a Developer ID
#      certificate in the keychain (populated from ~/.tauri/faceflow.env).
#      Both the .app bundle inside the DMG and the DMG itself are signed
#      with the Developer ID, and Tauri's notarisation pipeline can take
#      over from there.
#
#   2. AD-HOC    — when no Developer ID is configured (beta / internal
#      builds distributed through Telegram, TestFlight-free testing, etc).
#      The .app and DMG are signed with `codesign --force --deep --sign -`
#      which produces a locally-valid signature with no identity. This
#      does NOT bypass Gatekeeper on its own, but it's a hard requirement
#      for the "Right-click → Open" / System Settings → "Open Anyway"
#      escape hatch on modern macOS (Sonoma / Sequoia). An unsigned .app
#      just refuses to launch outright on these releases.
#
# The end result is a DMG that:
#   • has the installation instructions file inside it,
#   • contains a properly-signed .app (ad-hoc by default),
#   • is itself signed, so macOS accepts the "Open Anyway" override.
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

# Resolve the signing identity ONCE up-front so every codesign invocation
# in this script uses the same value. Falls back to "-" (ad-hoc) when no
# Developer ID is configured.
SIGN_IDENTITY="${APPLE_SIGNING_IDENTITY:--}"
if [ "$SIGN_IDENTITY" = "-" ]; then
  echo "NOTE: no APPLE_SIGNING_IDENTITY configured — using ad-hoc signing (\"-\")."
  echo "      Suitable for beta distribution; final App Store build will need a real cert."
else
  echo "NOTE: signing with \"$SIGN_IDENTITY\"."
fi

echo "Building FaceFlow release DMG..."
cd "$REPO_ROOT/faceflow-client"
npm run tauri build

DMG_PATH=$(ls -t src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null | head -1 || true)
if [ -z "${DMG_PATH:-}" ] || [ ! -f "$DMG_PATH" ]; then
  echo "ERROR: no DMG produced by Tauri." >&2
  exit 1
fi

echo ""
echo "Repacking ${DMG_PATH} (inject instructions + sign .app)..."

# Workflow: convert the read-only DMG produced by Tauri to a writable
# format, mount it, copy the instructions file into its root AND sign the
# bundled .app, unmount, then convert back to a compressed read-only
# image (UDZO) so the final size stays small.
TMP_RW="$(mktemp -t faceflow_rw).dmg"
hdiutil convert "$DMG_PATH" -format UDRW -o "$TMP_RW" -ov >/dev/null

MOUNT_DIR="$(mktemp -d -t faceflow_mnt)"
hdiutil attach "$TMP_RW" -nobrowse -mountpoint "$MOUNT_DIR" >/dev/null
trap 'hdiutil detach "$MOUNT_DIR" >/dev/null 2>&1 || true; rm -f "$TMP_RW"' EXIT

cp "$INSTRUCTION_SRC" "$MOUNT_DIR/"

# ── Sign the .app bundle that lives inside the mounted DMG ───────────────
# Gatekeeper on macOS 14+ refuses to run an unsigned .app even via the
# Right-click → Open override, so ad-hoc signing is mandatory here. The
# `--force` flag overwrites any existing signature Tauri produced, and
# `--deep` walks nested helper bundles / frameworks (there aren't any
# currently, but this stays robust if we add a sidecar binary later).
# `--options=runtime` enables the Hardened Runtime so the same command
# works when we later swap `-` for a real Developer ID.
APP_IN_DMG=$(find "$MOUNT_DIR" -maxdepth 2 -name "*.app" -print -quit)
if [ -z "$APP_IN_DMG" ] || [ ! -d "$APP_IN_DMG" ]; then
  echo "ERROR: could not locate .app bundle inside mounted DMG at $MOUNT_DIR" >&2
  exit 1
fi
echo "Signing $(basename "$APP_IN_DMG") with identity: ${SIGN_IDENTITY}..."
# --timestamp=none is required for ad-hoc ("-") signing; Apple's timestamp
# server rejects unauthenticated requests. For real Developer ID builds
# the timestamp flag is re-enabled below.
if [ "$SIGN_IDENTITY" = "-" ]; then
  codesign --force --deep --sign "-" --timestamp=none "$APP_IN_DMG"
else
  codesign --force --deep --sign "$SIGN_IDENTITY" --options=runtime --timestamp "$APP_IN_DMG"
fi

# Quick self-check so a broken signature fails the build immediately,
# rather than leaving us to discover it in the field.
codesign --verify --verbose=2 "$APP_IN_DMG" || {
  echo "ERROR: codesign verification failed for $APP_IN_DMG" >&2
  exit 1
}

# Detach explicitly so the next convert step has exclusive access.
hdiutil detach "$MOUNT_DIR" >/dev/null

# Repack as compressed read-only and atomically replace the original.
hdiutil convert "$TMP_RW" -format UDZO -imagekey zlib-level=9 -o "$DMG_PATH" -ov >/dev/null
rm -f "$TMP_RW"
trap - EXIT

# ── Sign the DMG itself ──────────────────────────────────────────────────
# macOS checks the DMG's signature when the user double-clicks it. For
# ad-hoc mode we still sign — it keeps the "unidentified developer"
# dialog on its intended code path (which permits "Open Anyway") instead
# of the stricter "cannot be opened because Apple cannot check it for
# malicious software" path that may hide the override entirely.
echo "Signing DMG with identity: ${SIGN_IDENTITY}..."
if [ "$SIGN_IDENTITY" = "-" ]; then
  codesign --force --sign "-" --timestamp=none "$DMG_PATH"
else
  codesign --force --sign "$SIGN_IDENTITY" --timestamp "$DMG_PATH"
fi

echo ""
echo "Done. DMG (with installation instructions inside):"
ls -lh "$DMG_PATH"
codesign --display --verbose=2 "$DMG_PATH" 2>&1 | sed 's/^/  /'
