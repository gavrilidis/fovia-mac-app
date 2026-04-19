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
| Theming | Dark/Light/System themes with macOS glass-morphism UI |
| Localization | English and Russian with runtime language switching |
| AI Integration | Optional OpenAI/Anthropic API for intelligent photo tagging and search |

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

### Activation secret for local/dev builds

Set the secret via environment variable:

```bash
export FACEFLOW_SECRET=your_hex_secret
```

Note: this secret is embedded at compile time in development/release artifacts. If you rotate it, rebuild the app to keep encrypted local secrets readable with the new keying scheme.

Or create a local file (do not commit):

```bash
echo "your_hex_secret" > faceflow-client/src-tauri/activation.secret
```

TODO: rotate previously committed secrets and clean repository history after beta (`git filter-repo` task outside this PR).

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

### Core
- **AI Face Grouping** — Automatic person detection and clustering using HAC algorithm (cosine similarity, threshold 0.38)
- **RAW Support** — CR2, ARW, RAW, NEF, DNG, ORF, RW2, RAF with embedded JPEG preview extraction
- **HEIC/HEIF/AVIF** — Apple and modern formats processed via ExifTool
- **WebP, BMP, TIFF, GIF** — Standard formats decoded natively

### Photographer Tools
- **Star Ratings** (0-5), **Color Labels**, **Pick/Reject** flags
- **Cross-Person Selection** — Select photos across multiple person groups for comparison
- **Move Between Persons** — Reassign misidentified photos to the correct person group
- **Inline Rename** — Double-click person names in the sidebar to rename
- **Compare View** — Side-by-side comparison of 2-4 photos
- **Event Timeline** — Auto-group photos by time gaps
- **Quality Detection** — Blur score and closed-eye detection
- **EXIF Inspector** — View full photo metadata
- **Export** — Copy selected photos to a destination folder with optional XMP sidecar files (ratings, labels, AI tags for Lightroom/Bridge/Capture One)

### UI & Experience
- **Dark/Light/System Theme** — Instant switching, macOS glass-morphism design
- **Russian & English** — Full localization with runtime language switching
- **Dense Photo Grid** — Lightroom-style compact thumbnail grid with crop-to-fill display
- **AI Photo Search** — Search photos by keywords using AI-generated tags (OpenAI/Anthropic)
- **Native Sub-Windows** — Settings, Help, and Export open as separate native OS windows
- **In-App Help** — Full documentation with keyboard shortcuts reference
- **Auto-Updates** — Signed updates via GitHub Releases
- **Offline-First** — Works without internet after initial setup (30-day grace period)

### AI Integration (Optional)
Connect your own OpenAI or Anthropic API key to enable:
- **Smart Photo Tagging** — AI analyzes selected photos and generates descriptive tags
- **Keyword Search** — Search your photo library by scene, objects, colors, emotions, activities
- No photos leave your Mac unless you explicitly use AI analysis

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

## Supported Formats

| Category | Formats |
|----------|---------|
| RAW | CR2, ARW, RAW, NEF, DNG, ORF, RW2, RAF |
| Apple/Modern | HEIC, HEIF, AVIF |
| Standard | JPEG, PNG, WebP, BMP, TIFF, GIF |

## License

MIT

## Disk usage & maintenance

FaceFlow's Cargo build directory (`faceflow-client/src-tauri/target/`) can
grow to **10+ GB** during active development — this is normal Rust
incremental-compilation behaviour and not actual file duplicates, even
when CleanMyMac flags it as such.

A maintenance script is provided to reclaim space safely without
breaking your dev environment:

```bash
./scripts/cleanup.sh          # safe cleanup (target/release, .vite, __pycache__, .DS_Store)
./scripts/cleanup.sh --full   # nuclear: also wipes target/, node_modules/, .venv/
```

The repo's `.gitignore` ignores `**/target/`, `**/node_modules/`,
`**/.venv/`, and other generated artifacts so they never reach the
remote. Each subproject (`faceflow-client/`, `cloud-api/`) also has its
own `.gitignore` for tooling that runs from inside that directory.

## UI architecture notes

- **Single bottom action bar** — bulk operations on selected photos /
  persons are exposed via one `BottomActionBar` (gallery footer) that also
  contains the color-label picker and Compare button.
- **Native sub-windows** — Settings, Help, and Export open as their own
  native Tauri windows via the `open_app_window` Rust command and the
  `?window=<name>` URL pattern handled by `SubWindowApp` in `App.tsx`.
- **Cross-window theme sync** — Theme/locale changes in a sub-window
  (e.g. Settings) propagate to the main window in real-time via the
  `storage` event on `localStorage`.
- **Unified Settings** — both the initial DropZone screen and the
  Gallery view open the *same* `SettingsPanel` component (in a sub-window
  when possible, in-app as a fallback).
- **Dense grid** — `PhotoGrid` uses crop-to-fill (`object-cover`) thumbnails
  with 4px gaps and minimal padding for a Lightroom-style compact layout.
- **XMP sidecar export** — The Export dialog includes an opt-in checkbox to
  write `.xmp` sidecar files alongside exported photos, carrying ratings,
  color labels, pick status, and AI-generated keywords.
- **List view & Select All** — the View menu's Grid/List items toggle
  `PhotoGrid`'s internal `viewMode`, and Edit → Select / Deselect All
  Photos drive the selection set through the menu-bridge in
  `GalleryView`.
