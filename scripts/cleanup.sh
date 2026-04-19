#!/usr/bin/env bash
# scripts/cleanup.sh
# ---------------------------------------------------------------
# FaceFlow disk-space cleanup.
# Run periodically (or whenever the repo grows past a few GB) to
# reclaim space without breaking active development.
#
# What it does (in order):
#   1. Removes Tauri/Cargo target/release artifacts (rebuild on next release)
#   2. Removes Cargo incremental cache (rebuild from `deps/` cache)
#   3. Removes Vite dev cache (.vite, dist)
#   4. Removes Python __pycache__ everywhere
#   5. Removes scattered .DS_Store
#   6. Optionally (--full) wipes the whole `target/` directory and
#      Python `.venv/` — use only when you're starting from scratch.
#
# Usage:
#   ./scripts/cleanup.sh         # safe cleanup
#   ./scripts/cleanup.sh --full  # nuclear: also removes target/ and .venv/
# ---------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

du_h() { du -sh "$1" 2>/dev/null | awk '{print $1}'; }

echo "==> FaceFlow cleanup starting in: $ROOT"
START_SIZE="$(du_h .)"
echo "    Current size: $START_SIZE"
echo

# 1. Tauri release artifacts
if [[ -d faceflow-client/src-tauri/target/release ]]; then
  SZ="$(du_h faceflow-client/src-tauri/target/release)"
  echo "==> Removing target/release ($SZ)"
  rm -rf faceflow-client/src-tauri/target/release
fi

# 2. Cargo incremental cache (kept under target/debug)
if [[ -d faceflow-client/src-tauri/target/debug/incremental ]]; then
  SZ="$(du_h faceflow-client/src-tauri/target/debug/incremental)"
  echo "==> Removing target/debug/incremental ($SZ)"
  rm -rf faceflow-client/src-tauri/target/debug/incremental
fi

# 3. Vite cache + dist
for dir in faceflow-client/dist faceflow-client/.vite faceflow-client/node_modules/.vite; do
  if [[ -d "$dir" ]]; then
    SZ="$(du_h "$dir")"
    echo "==> Removing $dir ($SZ)"
    rm -rf "$dir"
  fi
done

# 4. Python __pycache__
echo "==> Removing __pycache__ folders"
find . -type d -name "__pycache__" -not -path "*/.venv/*" -prune -exec rm -rf {} + 2>/dev/null || true

# 5. .DS_Store
echo "==> Removing .DS_Store"
find . -name ".DS_Store" -delete 2>/dev/null || true

# 6. Optional nuclear cleanup
if [[ "${1:-}" == "--full" ]]; then
  echo
  echo "==> --full requested: wiping target/ and .venv/"
  rm -rf faceflow-client/src-tauri/target
  rm -rf cloud-api/.venv
  rm -rf faceflow-client/node_modules
fi

echo
END_SIZE="$(du_h .)"
echo "==> Cleanup done."
echo "    Before: $START_SIZE   After: $END_SIZE"
