# FaceFlow

Professional desktop utility for expedition photographers. Automates sorting of massive RAW photo datasets by detecting and grouping human faces using AI-powered face recognition.

## Architecture

**Thick Client (offline-first)** — everything runs locally on your Mac:

- **Desktop Client** (`faceflow-client/`): Tauri v2 (Rust + React + TypeScript) app for macOS. Performs face detection and embedding generation using ONNX Runtime on-device, extracts JPEG previews from RAW files via bundled ExifTool, and stores all results in a local SQLite database.
- **Cloud API** (`cloud-api/`): Legacy FastAPI prototype. Not required — all ML inference now runs locally in the Rust backend.

### Key Design Decisions

| Area | Approach |
|------|----------|
| ML Inference | Local ONNX Runtime (`det_10g.onnx` + `w600k_r50.onnx`) — no cloud dependency |
| RAW Processing | Bundled ExifTool extracts embedded JPEG previews — no ImageMagick/dcraw required |
| Data Storage | SQLite on-device — embeddings, metadata, ratings all stored locally |
| Licensing | Serial key + machine ID verified via Supabase, with 30-day offline grace period |
| Updates | Signed auto-updates via GitHub Releases (`tauri-plugin-updater`) |
| Dependencies | Fully self-contained — ExifTool and ONNX models are downloaded automatically on first launch |

## Installation (End Users)

1. Download the latest `.dmg` from [Releases](https://github.com/gavrilidis/faceflow/releases)
2. Drag **FaceFlow** to `/Applications`
3. **Important — macOS Gatekeeper**: FaceFlow is not yet signed with an Apple Developer certificate. Choose one of two methods to allow it:

   **Option A — System Settings (recommended):**
   - Try opening FaceFlow — macOS will block it
   - Go to **System Settings → Privacy & Security**
   - Find the "FaceFlow was blocked" message and click **Open Anyway**
   - Open FaceFlow again and click **Open**

   **Option B — Terminal:**
   ```bash
   xattr -cr "/Applications/FaceFlow.app"
   ```

4. Enter your license key (internet required for first-time activation)
5. FaceFlow will automatically download AI models (~183 MB) on first launch

### System Requirements

- macOS 11.0 (Big Sur) or later
- Apple Silicon (M1/M2/M3/M4) or Intel Mac
- 500 MB free disk space
- Internet for activation and initial model download (app works offline after that)
- **No** Homebrew, Python, Xcode, or any other developer tools required

## Development Setup

### Desktop Client

```bash
cd faceflow-client
npm install
npm run tauri dev
```

### Prerequisites (Development Only)

- Rust 1.77+
- Node.js 20+
- `exiftool` (optional — auto-downloaded if missing)

### Building

```bash
cd faceflow-client
TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/faceflow.key)" npm run tauri build
```

Output: `src-tauri/target/release/bundle/dmg/FaceFlow_*.dmg`

## Features

- **AI Face Grouping** — Automatic person detection and clustering using cosine similarity
- **RAW Support** — CR2, ARW, RAW, NEF, DNG, ORF, RW2, RAF with embedded JPEG preview extraction
- **Star Ratings** (0-5), **Color Labels**, **Pick/Reject** flags
- **Cross-Person Selection** — Select photos across multiple person groups for comparison
- **Move Between Persons** — Reassign misidentified photos to the correct person group
- **Inline Rename** — Double-click person names in the sidebar to rename
- **Compare View** — Side-by-side photo comparison
- **Event Timeline** — Auto-group photos by time gaps
- **Quality Detection** — Blur score and closed-eye detection
- **EXIF Inspector** — View full photo metadata
- **Export** — Copy selected photos to a destination folder
- **Auto-Updates** — Signed updates via GitHub Releases
- **Offline-First** — Works without internet after initial setup (30-day grace period)
- **In-App Help** — Full documentation with keyboard shortcuts reference

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `0-5` | Set star rating |
| `P` | Pick |
| `X` | Reject |
| `U` | Unflag |
| `6-9` | Color labels (Red, Yellow, Green, Blue) |
| `Cmd+A` | Select all in current view |
| `Esc` | Deselect all / Close viewer |
| `Backspace` | Reject |

## Apple Developer Program

FaceFlow is currently distributed as an unsigned app. To distribute via the Mac App Store or enable Gatekeeper-friendly notarization:

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/) ($99/year)
2. Create a Developer ID Application certificate
3. Configure `tauri.conf.json` with the signing identity
4. Use `codesign` and `notarytool` to sign and notarize the `.app` bundle
5. After notarization, macOS will allow the app to open without Gatekeeper warnings

## Supported RAW Formats

CR2, ARW, RAW, NEF, DNG, ORF, RW2, RAF

## License

MIT
