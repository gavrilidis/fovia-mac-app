#!/bin/bash
# Download InsightFace buffalo_l ONNX models for FaceFlow.
# Models are stored in ~/Library/Application Support/com.faceflow.desktop/models/

set -euo pipefail

MODELS_DIR="${HOME}/Library/Application Support/com.faceflow.desktop/models"
BUFFALO_URL="https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip"
TMP_DIR=$(mktemp -d)

echo "FaceFlow Model Setup"
echo "===================="
echo ""
echo "This will download the InsightFace buffalo_l models (~320 MB download)."
echo "Only the detection and recognition models will be kept (~183 MB)."
echo ""
echo "Target directory: ${MODELS_DIR}"
echo ""

mkdir -p "${MODELS_DIR}"

# Check if models already exist
if [[ -f "${MODELS_DIR}/det_10g.onnx" && -f "${MODELS_DIR}/w600k_r50.onnx" ]]; then
    echo "Models already downloaded. To re-download, delete the models directory:"
    echo "  rm -rf \"${MODELS_DIR}\""
    exit 0
fi

echo "Downloading buffalo_l.zip..."
curl -L -# "${BUFFALO_URL}" -o "${TMP_DIR}/buffalo_l.zip"

echo "Extracting required models..."
cd "${TMP_DIR}"
unzip -q buffalo_l.zip det_10g.onnx w600k_r50.onnx

# Files are at root of zip (no subfolder)
cp "${TMP_DIR}/det_10g.onnx" "${MODELS_DIR}/"
cp "${TMP_DIR}/w600k_r50.onnx" "${MODELS_DIR}/"

echo "Cleaning up..."
rm -rf "${TMP_DIR}"

echo ""
echo "Done! Models installed:"
ls -lh "${MODELS_DIR}/"*.onnx
echo ""
echo "You can now run FaceFlow."
