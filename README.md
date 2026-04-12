# FaceFlow

Professional desktop utility for expedition photographers. Automates sorting of massive RAW photo datasets by detecting and grouping human faces using AI-powered face recognition.

## Architecture

**Thin Client + Cloud ML** approach:

- **Desktop Client** (`faceflow-client/`): Tauri (Rust + React + TypeScript) app for macOS. Extracts JPEG previews from RAW files locally, renders the gallery UI, and stores results in SQLite.
- **Cloud API** (`cloud-api/`): FastAPI (Python) service running InsightFace (Buffalo_L model) for face detection and 512D embedding extraction.

## Quick Start

### Cloud API

```bash
cd cloud-api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Desktop Client

```bash
cd faceflow-client
npm install
npm run tauri dev
```

### Prerequisites

- Python 3.11+
- Rust 1.77+
- Node.js 20+
- exiftool (`brew install exiftool`)

## Supported RAW Formats

CR2, ARW, RAW, NEF, DNG, ORF, RW2, RAF

## License

MIT
