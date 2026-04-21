#!/bin/bash
# Build a release DMG for FaceFlow.
#
# Two signing modes, auto-selected on whether a real Developer ID
# certificate is available:
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
#   • has a beautiful install guide ("How to open FaceFlow.pdf") inside,
#   • ships a retina (@2x) background so modern displays stay pixel-perfect,
#   • positions all three Finder items (app, Applications alias, PDF)
#     via a programmatically-generated .DS_Store instead of fragile
#     AppleScript, so the layout is deterministic,
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
ICONS_DIR="$REPO_ROOT/faceflow-client/src-tauri/icons"
BG_1X="$ICONS_DIR/dmg-background.png"
BG_2X="$ICONS_DIR/dmg-background@2x.png"
INSTRUCTION_PDF="$ICONS_DIR/How to open FaceFlow.pdf"
INSTRUCTION_PDF_NAME="How to open FaceFlow.pdf"

# Regenerate DMG art + instruction PDF. Keeps the installer visuals in
# sync with the checked-in source-of-truth script on every build.
echo "Regenerating DMG assets..."
/usr/bin/python3 "$REPO_ROOT/scripts/make_dmg_assets.py"

for f in "$BG_1X" "$BG_2X" "$INSTRUCTION_PDF"; do
  if [ ! -f "$f" ]; then
    echo "ERROR: DMG asset missing: $f" >&2
    exit 1
  fi
done

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
echo "Repacking ${DMG_PATH} (inject PDF + retina background + layout)..."

# Workflow: convert the read-only DMG produced by Tauri to a writable
# format, mount it, copy assets + write a fresh .DS_Store, unmount, then
# convert back to a compressed read-only image (UDZO) so the final size
# stays small.
TMP_RW="$(mktemp -t faceflow_rw).dmg"
hdiutil convert "$DMG_PATH" -format UDRW -o "$TMP_RW" -ov >/dev/null

# Mount to the default /Volumes/<name> path. A custom -mountpoint breaks
# Finder's understanding of the image and prevents it from picking up
# our .DS_Store on first open.
ATTACH_OUT="$(hdiutil attach -readwrite -noverify -noautoopen "$TMP_RW")"
MOUNT_DIR="$(echo "$ATTACH_OUT" | sed -n 's|^.*\(/Volumes/.*\)$|\1|p' | tail -1)"
if [ -z "$MOUNT_DIR" ] || [ ! -d "$MOUNT_DIR" ]; then
  echo "ERROR: could not determine mount point for $TMP_RW" >&2
  echo "hdiutil output was:" >&2
  echo "$ATTACH_OUT" >&2
  exit 1
fi
trap 'hdiutil detach "$MOUNT_DIR" >/dev/null 2>&1 || true; rm -f "$TMP_RW"' EXIT

# 1. Instruction PDF at the root of the DMG (shows up in Finder with the
#    proper red "PDF" document icon — Preview handles it beautifully).
cp "$INSTRUCTION_PDF" "$MOUNT_DIR/$INSTRUCTION_PDF_NAME"

# 2. Ensure both 1x and 2x backgrounds live in .background/ so retina
#    Macs display the sharp version automatically. Tauri's bundler only
#    copies the 1x; we overwrite and add @2x here.
mkdir -p "$MOUNT_DIR/.background"
cp "$BG_1X" "$MOUNT_DIR/.background/dmg-background.png"
cp "$BG_2X" "$MOUNT_DIR/.background/dmg-background@2x.png"

# 3. Generate a fresh .DS_Store with precise icon positions and the
#    retina background wired in as an alias. Editing the .DS_Store that
#    Tauri ships proved unreliable (its alias records sometimes confuse
#    the `ds_store` library); writing one from scratch is deterministic.
MOUNT_DIR_PY="$MOUNT_DIR" PDF_NAME_PY="$INSTRUCTION_PDF_NAME" /usr/bin/python3 - <<'PY'
import os, sys, site
from pathlib import Path

usr = site.getusersitepackages()
for p in (usr if isinstance(usr, (list, tuple)) else [usr]):
    if p not in sys.path:
        sys.path.insert(0, p)

from ds_store import DSStore
from mac_alias import Bookmark

mount = Path(os.environ["MOUNT_DIR_PY"])
pdf_name = os.environ["PDF_NAME_PY"]
bg_rel = mount / ".background" / "dmg-background.png"
ds_path = mount / ".DS_Store"

try:
    ds_path.unlink()
except FileNotFoundError:
    pass

bookmark_bytes = Bookmark.for_file(str(bg_rel)).to_bytes()

with DSStore.open(str(ds_path), "w+") as d:
    d["."]["bwsp"] = {
        "WindowBounds": "{{10, 60}, {660, 480}}",
        "ShowStatusBar": False,
        "ShowToolbar": False,
        "ShowTabView": False,
        "ShowPathbar": False,
        "ShowSidebar": False,
    }
    d["."]["icvp"] = {
        "viewOptionsVersion": 1,
        "backgroundType": 2,
        "backgroundImageAlias": bookmark_bytes,
        "backgroundColorRed": 0.0,
        "backgroundColorGreen": 0.0,
        "backgroundColorBlue": 0.0,
        "iconSize": 96.0,
        "textSize": 12.0,
        "gridOffsetX": 0.0,
        "gridOffsetY": 0.0,
        "gridSpacing": 100.0,
        "labelOnBottom": True,
        "showItemInfo": False,
        "showIconPreview": True,
        "arrangeBy": "none",
    }
    d["FaceFlow.app"]["Iloc"] = (180, 170)
    d["Applications"]["Iloc"] = (480, 170)
    d[pdf_name]["Iloc"] = (330, 360)

print("Wrote fresh .DS_Store")
PY

# 4. Sign the .app bundle that lives inside the mounted DMG.
APP_IN_DMG=$(find "$MOUNT_DIR" -maxdepth 2 -name "*.app" -print -quit)
if [ -z "$APP_IN_DMG" ] || [ ! -d "$APP_IN_DMG" ]; then
  echo "ERROR: could not locate .app bundle inside mounted DMG at $MOUNT_DIR" >&2
  exit 1
fi
echo "Signing $(basename "$APP_IN_DMG") with identity: ${SIGN_IDENTITY}..."
if [ "$SIGN_IDENTITY" = "-" ]; then
  codesign --force --deep --sign "-" --timestamp=none "$APP_IN_DMG"
else
  codesign --force --deep --sign "$SIGN_IDENTITY" --options=runtime --timestamp "$APP_IN_DMG"
fi

codesign --verify --verbose=2 "$APP_IN_DMG" || {
  echo "ERROR: codesign verification failed for $APP_IN_DMG" >&2
  exit 1
}

sync
for _ in 1 2 3 4 5; do
  if hdiutil detach "$MOUNT_DIR" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done
hdiutil detach "$MOUNT_DIR" -force >/dev/null 2>&1 || true
trap - EXIT

hdiutil convert "$TMP_RW" -format UDZO -imagekey zlib-level=9 -o "$DMG_PATH" -ov >/dev/null
rm -f "$TMP_RW"

echo "Signing DMG with identity: ${SIGN_IDENTITY}..."
if [ "$SIGN_IDENTITY" = "-" ]; then
  codesign --force --sign "-" --timestamp=none "$DMG_PATH"
else
  codesign --force --sign "$SIGN_IDENTITY" --timestamp "$DMG_PATH"
fi

echo ""
echo "Done. DMG (with install guide and retina background):"
ls -lh "$DMG_PATH"
codesign --display --verbose=2 "$DMG_PATH" 2>&1 | sed 's/^/  /'
