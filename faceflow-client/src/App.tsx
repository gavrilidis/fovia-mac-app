import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { check } from "@tauri-apps/plugin-updater";
import { DropZone } from "./components/DropZone";
import { ProgressView } from "./components/ProgressView";
import { GalleryView } from "./components/GalleryView";
import { ActivationView } from "./components/ActivationView";
import { ResumeDialog } from "./components/ResumeDialog";
import { RestartDialog } from "./components/RestartDialog";
import { ScanSummaryDialog } from "./components/ScanSummaryDialog";
import { SettingsPanel } from "./components/SettingsPanel";
import { HelpDialog } from "./components/HelpDialog";
import { ExportDialog } from "./components/ExportDialog";
import { groupFacesByIdentity } from "./services/faceGrouping";
import { useI18n } from "./i18n";
import type { AppView, DownloadProgress, FaceEntry, FaceGroup, ScanProgress, ScanProgressRow, ScanResult, ScanSummary, ModelStatus } from "./types";

// M11: when launched as a sub-window (?window=settings), render only the
// requested surface in its own native window.
const SUB_WINDOW = (() => {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("window");
})();

function SubWindowApp({ name }: { name: string }) {
  // Close the *current* native window. We use the WebviewWindow handle
  // (rather than just `getCurrentWindow`) because it's the one that
  // actually owns the webview rendering this React tree — closing it
  // disposes of both the OS window and the webview cleanly.
  const closeSelf = () => {
    void getCurrentWebviewWindow()
      .close()
      .catch((err) => console.error("close window failed", err));
  };
  if (name === "settings") {
    return <SettingsPanel onClose={closeSelf} variant="window" />;
  }
  if (name === "help") {
    // Render the same HelpDialog used in-app, but as the sole content of
    // its own native window so users can keep it open beside the gallery.
    return <HelpDialog onClose={closeSelf} variant="window" />;
  }
  if (name === "export") {
    // Read the file selection / face groups stashed by the gallery before
    // it asked Tauri to open this window. Falls back to closing if the
    // payload is missing (rare — usually means the gallery crashed).
    let payload: { filePaths: string[]; groups: FaceGroup[] } = { filePaths: [], groups: [] };
    try {
      const raw = localStorage.getItem("faceflow-export-payload");
      if (raw) payload = JSON.parse(raw);
    } catch (e) {
      console.error("invalid export payload", e);
    }
    if (payload.filePaths.length === 0) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-surface text-fg-muted">
          No selection
        </div>
      );
    }
    return (
      <ExportDialog
        filePaths={payload.filePaths}
        groups={payload.groups}
        onClose={closeSelf}
        variant="window"
      />
    );
  }
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-surface text-fg-muted">
      Unknown sub-window: {name}
    </div>
  );
}

export { SUB_WINDOW, SubWindowApp };

function App() {
  const { t } = useI18n();
  const [view, setView] = useState<AppView>("loading");
  const [activated, setActivated] = useState<boolean | null>(null);
  const [, setModelsReady] = useState(false);
  const [modelsDir, setModelsDir] = useState("");
  const [downloadStatus, setDownloadStatus] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [modelConsent, setModelConsent] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<{ version: string; body: string } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [progress, setProgress] = useState<ScanProgress>({
    total_files: 0,
    processed: 0,
    current_file: "",
    faces_found: 0,
    unique_persons: 0,
    errors: 0,
    last_error: "",
    phase: "scanning",
    files_read: 0,
    previously_processed: 0,
    total_in_folder: 0,
  });
  const [faceGroups, setFaceGroups] = useState<FaceGroup[]>([]);
  const [noFaceFiles, setNoFaceFiles] = useState<string[]>([]);
  const [lowQualityFaces, setLowQualityFaces] = useState<FaceEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resumePrompt, setResumePrompt] = useState<{
    folderPath: string;
    detectionThreshold: number;
    row: ScanProgressRow;
  } | null>(null);
  const [restartPrompt, setRestartPrompt] = useState<{
    folderPath: string;
    detectionThreshold: number;
    scannedCount: number;
  } | null>(null);
  const [scanSummary, setScanSummary] = useState<ScanSummary | null>(null);
  const [isResumeScan, setIsResumeScan] = useState(false);
  const [faceMatchThreshold, setFaceMatchThreshold] = useState<number>(() => {
    const value = localStorage.getItem("faceflow-face-threshold");
    const parsed = value ? Number(value) : 0.32;
    return Number.isFinite(parsed) ? parsed : 0.32;
  });

  const handleRetryModels = useCallback(async () => {
    setError(null);
    setIsDownloading(true);
    setDownloadStatus("Checking models...");
    setDownloadProgress(null);
    try {
      const status = await invoke<ModelStatus>("check_models");
      setModelsDir(status.models_dir);

      if (!status.models_ready) {
        setDownloadStatus("Downloading models...");
        await invoke("download_models");
      }

      if (!status.exiftool_ready) {
        setDownloadStatus("Installing exiftool...");
        await invoke("download_exiftool");
      }

      setDownloadStatus("Loading models...");
      await invoke("load_models");
      setModelsReady(true);
      setView("dropzone");
    } catch (err) {
      const msg = typeof err === "string" ? err : "Failed to download/load models";
      setError(msg);
    } finally {
      setIsDownloading(false);
      setDownloadStatus("");
      setDownloadProgress(null);
    }
  }, []);

  // Check activation, then check and load models on startup
  useEffect(() => {
    const init = async () => {
      try {
        // Check activation first
        const isActivated = await invoke<boolean>("check_activation");
        setActivated(isActivated);
        if (!isActivated) return;

        const status = await invoke<ModelStatus>("check_models");
        setModelsDir(status.models_dir);

        if (!status.models_ready || !status.exiftool_ready) {
          setModelsReady(false);
          setView("setup");
          return;
        }

        await invoke("load_models");
        setModelsReady(true);
        setView("dropzone");
      } catch (err) {
        const msg = typeof err === "string" ? err : "Failed to initialize";
        setError(msg);
        setView("setup");
      }
    };
    init();
  }, [handleRetryModels]);

  const runScan = useCallback(
    async (folderPath: string, detectionThreshold: number, resume: boolean) => {
      setView("progress");
      setIsResumeScan(resume);
      setError(null);
      localStorage.setItem("faceflow-last-folder", folderPath);
      setProgress({
        total_files: 0,
        processed: 0,
        current_file: "Starting...",
        faces_found: 0,
        unique_persons: 0,
        errors: 0,
        last_error: "",
        phase: "scanning",
        files_read: 0,
        previously_processed: 0,
        total_in_folder: 0,
      });

      try {
        const result = await invoke<ScanResult>("scan_folder", {
          folderPath,
          detectionThreshold,
          resume,
        });

        const { groups, lowQualityFaces: lowFaces } = await groupFacesByIdentity(result.faces, faceMatchThreshold);
        setFaceGroups(groups);
        setNoFaceFiles(result.no_face_files);
        setLowQualityFaces(lowFaces);
        if (
          result.skipped_files.length > 0 ||
          result.processed_count < result.total_files ||
          result.was_cancelled
        ) {
          setScanSummary({
            folder_path: folderPath,
            total_files: result.total_files,
            processed_count: result.processed_count,
            skipped_files: result.skipped_files,
          });
        }
        if (result.was_cancelled) {
          // Progress is durable thanks to the 10-file checkpoint, so the
          // user can resume this same folder later from where they stopped.
          alert(
            t("scan_stopped_body")
              .replace("{processed}", String(result.processed_count))
              .replace("{total}", String(result.total_files)),
          );
        }
        setView("gallery");
      } catch (err) {
        const message = typeof err === "string" ? err : "An unexpected error occurred";
        setError(message);
        setView("dropzone");
      }
    },
    [faceMatchThreshold],
  );

  const handleFolderSelected = useCallback(
    async (folderPath: string, detectionThreshold: number) => {
      try {
        const prior = await invoke<ScanProgressRow | null>("get_scan_progress", {
          folderPath,
        });
        if (prior && prior.status === "in_progress" && prior.last_processed_index > 0) {
          setResumePrompt({ folderPath, detectionThreshold, row: prior });
          return;
        }
        // No in-progress checkpoint, but the folder may have been fully
        // scanned previously. Ask the user whether to keep the saved data
        // (incremental re-scan will skip unchanged files anyway) or wipe.
        const scannedCount = await invoke<number>("count_folder_scanned_files", {
          folderPath,
        });
        if (scannedCount > 0) {
          setRestartPrompt({ folderPath, detectionThreshold, scannedCount });
          return;
        }
      } catch {
        // Non-critical — proceed with a fresh scan.
      }
      await runScan(folderPath, detectionThreshold, false);
    },
    [runScan],
  );

  const handleRestartContinue = useCallback(async () => {
    if (!restartPrompt) return;
    const { folderPath, detectionThreshold } = restartPrompt;
    setRestartPrompt(null);
    // Incremental scan: scanner skips files whose hash matches `scanned_files`.
    await runScan(folderPath, detectionThreshold, false);
  }, [restartPrompt, runScan]);

  const handleRestartFresh = useCallback(async () => {
    if (!restartPrompt) return;
    const { folderPath, detectionThreshold } = restartPrompt;
    setRestartPrompt(null);
    try {
      await invoke("reset_folder_data", { folderPath });
    } catch {
      // Ignore — fresh scan will overwrite what's left.
    }
    await runScan(folderPath, detectionThreshold, false);
  }, [restartPrompt, runScan]);

  const handleResumeContinue = useCallback(async () => {
    if (!resumePrompt) return;
    const { folderPath, detectionThreshold } = resumePrompt;
    setResumePrompt(null);
    await runScan(folderPath, detectionThreshold, true);
  }, [resumePrompt, runScan]);

  const handleResumeRestart = useCallback(async () => {
    if (!resumePrompt) return;
    const { folderPath, detectionThreshold } = resumePrompt;
    setResumePrompt(null);
    try {
      await invoke("clear_scan_progress", { folderPath });
    } catch {
      // Ignore — fresh scan will overwrite.
    }
    await runScan(folderPath, detectionThreshold, false);
  }, [resumePrompt, runScan]);

  // Live re-clustering when the user changes Face Matching Sensitivity in
  // Settings. Without this, the slider would only affect the *next* scan
  // and feel completely dead on already-loaded libraries.
  useEffect(() => {
    const handler = async (e: Event) => {
      const ce = e as CustomEvent<number>;
      const newThreshold = typeof ce.detail === "number" ? ce.detail : faceMatchThreshold;
      setFaceMatchThreshold(newThreshold);
      // Re-flatten current faces (across groups + low-quality bin) and
      // re-run clustering with the new threshold.
      const allFaces: FaceEntry[] = [
        ...faceGroups.flatMap((g) => g.members),
        ...lowQualityFaces,
      ];
      if (allFaces.length === 0) return;
      try {
        const { groups, lowQualityFaces: lq } = await groupFacesByIdentity(allFaces, newThreshold);
        setFaceGroups(groups);
        setLowQualityFaces(lq);
      } catch (err) {
        console.warn("Re-clustering failed:", err);
      }
    };
    window.addEventListener("faceflow:face-threshold-changed", handler);
    return () => window.removeEventListener("faceflow:face-threshold-changed", handler);
  }, [faceGroups, lowQualityFaces, faceMatchThreshold]);

  // When the user resets scan data from Settings, return to the dropzone.
  useEffect(() => {
    const handler = () => {
      setView("dropzone");
      setFaceGroups([]);
      setNoFaceFiles([]);
      setLowQualityFaces([]);
      setError(null);
      setProgress({ total_files: 0, processed: 0, current_file: "", faces_found: 0, unique_persons: 0, errors: 0, last_error: "", phase: "scanning", files_read: 0, previously_processed: 0, total_in_folder: 0 });
    };
    window.addEventListener("faceflow:reset-scan", handler);
    return () => window.removeEventListener("faceflow:reset-scan", handler);
  }, []);

  // Bridge native macOS menu events into DOM CustomEvents so any nested
  // component (GalleryView, SettingsPanel, etc.) can subscribe without
  // having to talk to Tauri directly. The native menu emits ids like
  // "preferences", "new_scan", "export", etc.
  useEffect(() => {
    // React StrictMode mounts effects twice in dev. The previous version
    // assigned the unlisten function to a `let` variable from `.then(...)`,
    // which meant the first cleanup run before the promise resolved and the
    // listener leaked — registering the menu handler twice. Result: every
    // menu click (notably "Report an Issue…") fired twice, opening two
    // browser tabs. The pattern below cancels the in-flight registration
    // synchronously even before the promise resolves.
    let cancelled = false;
    let unlistenFn: (() => void) | undefined;
    listen<string>("faceflow:menu", (event) => {
      const id = event.payload;
      // App-level shortcuts that don't depend on gallery state.
      if (id === "new_scan") {
        setView("dropzone");
        return;
      }
      if (id === "reset_scan") {
        const folder = localStorage.getItem("faceflow-last-folder");
        if (folder) {
          invoke("reset_folder_data", { folderPath: folder })
            .then(() => {
              localStorage.removeItem("faceflow-last-folder");
              window.dispatchEvent(new Event("faceflow:reset-scan"));
            })
            .catch(() => {
              window.dispatchEvent(new Event("faceflow:reset-scan"));
            });
        }
        return;
      }
      if (id === "report_issue") {
        // Single, idempotent open. The Rust `open_url` command shells out
        // to the OS handler which is reliable on macOS — no fallback to
        // `window.open` (that previously caused a *second* tab to open
        // when StrictMode double-fired the listener).
        invoke("open_url", { url: "https://github.com/gavrilidis/faceflow/issues/new" }).catch(
          (err) => console.error("[faceflow] open_url failed:", err),
        );
        return;
      }
      // M11: open Settings in its own native window instead of as an in-app
      // modal (matches macOS conventions). Falls back to the in-app modal
      // if the window can't be created.
      if (id === "preferences") {
        invoke("open_app_window", {
          name: "settings",
          title: "Settings",
          width: 720,
          height: 720,
        }).catch(() => {
          window.dispatchEvent(new CustomEvent("faceflow:menu", { detail: "preferences" }));
        });
        return;
      }
      // M11+: open Help in its own native window (matches the Settings
      // pattern). Falls back to the in-app dialog if the window can't
      // be created (e.g. the user is on a build without webview support).
      if (id === "show_help") {
        invoke("open_app_window", {
          name: "help",
          title: "FaceFlow Help",
          width: 720,
          height: 600,
        }).catch(() => {
          window.dispatchEvent(new CustomEvent("faceflow:menu", { detail: "show_help" }));
        });
        return;
      }
      // Everything else is forwarded to whichever component is interested.
      window.dispatchEvent(new CustomEvent("faceflow:menu", { detail: id }));
    }).then((fn) => {
      if (cancelled) {
        // Effect was already torn down (StrictMode double-mount): unlisten
        // immediately so we never end up with two live subscriptions.
        fn();
      } else {
        unlistenFn = fn;
      }
    });
    return () => {
      cancelled = true;
      if (unlistenFn) unlistenFn();
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<ScanProgress>("scan-progress", (event) => {
      setProgress(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Listen for model download progress
  useEffect(() => {
    const unlisten = listen<DownloadProgress>("model-download-progress", (event) => {
      setDownloadProgress(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Check for app updates silently on startup
  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const update = await check();
        if (update) {
          setUpdateAvailable({ version: update.version, body: update.body ?? "" });
        }
      } catch {
        // Silently ignore — update check is non-critical
      }
    };
    checkUpdate();
  }, []);

  const handleInstallUpdate = useCallback(async () => {
    setIsUpdating(true);
    try {
      const update = await check();
      if (update) {
        await update.downloadAndInstall();
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      }
    } catch (err) {
      const msg = typeof err === "string" ? err : "Update failed";
      setError(msg);
      setIsUpdating(false);
    }
  }, []);

  // Listen for Tauri native file drop events (provides real file system paths)
  useEffect(() => {
    const webview = getCurrentWebviewWindow();
    const unlisten = webview.onDragDropEvent((event) => {
      if (event.payload.type === "drop" && view === "dropzone") {
        const paths = event.payload.paths;
        if (paths && paths.length > 0) {
          handleFolderSelected(paths[0], 0.5);
        }
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [view, handleFolderSelected]);

  const handleReset = useCallback(() => {
    setView("dropzone");
    setFaceGroups([]);
    setNoFaceFiles([]);
    setLowQualityFaces([]);
    setError(null);
    setProgress({ total_files: 0, processed: 0, current_file: "", faces_found: 0, unique_persons: 0, errors: 0, last_error: "", phase: "scanning", files_read: 0, previously_processed: 0, total_in_folder: 0 });
  }, []);

  const handleWindowDrag = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input, a, select, textarea")) return;
    getCurrentWindow().startDragging();
  }, []);

  const handleActivated = useCallback(() => {
    setActivated(true);
    setView("loading");
    // Re-trigger model init
    const init = async () => {
      try {
        const status = await invoke<ModelStatus>("check_models");
        setModelsDir(status.models_dir);
        if (!status.models_ready || !status.exiftool_ready) {
          setModelsReady(false);
          setView("setup");
          return;
        }
        await invoke("load_models");
        setModelsReady(true);
        setView("dropzone");
      } catch (err) {
        const msg = typeof err === "string" ? err : "Failed to initialize";
        setError(msg);
        setView("setup");
      }
    };
    init();
  }, [handleRetryModels]);

  // Show activation gate
  if (activated === false) {
    return (
      <div className="flex h-screen w-screen flex-col bg-surface">
        <ActivationView onActivated={handleActivated} />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-surface">
      {error && (
        <div className="flex items-center gap-5 border-b border-negative/20 bg-negative/8 px-8 py-5 text-[13px] text-negative">
          <svg className="h-4.5 w-4.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            title="Dismiss error"
            className="ml-auto rounded-lg p-1.5 text-negative transition-colors hover:bg-negative/10 hover:text-fg"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {updateAvailable && (
        <div className="flex items-center gap-4 border-b border-accent/20 bg-accent/8 px-8 py-3 text-[13px] text-fg">
          <svg className="h-4 w-4 flex-shrink-0 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          <span className="flex-1 text-fg-muted">
            Version {updateAvailable.version} available
          </span>
          <button
            onClick={handleInstallUpdate}
            disabled={isUpdating}
            className="rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-medium text-white transition-all hover:bg-accent-hover active:scale-[0.97] disabled:opacity-50"
          >
            {isUpdating ? "Updating..." : "Install Update"}
          </button>
          <button
            onClick={() => setUpdateAvailable(null)}
            title="Dismiss"
            className="rounded-lg p-1 text-fg-muted transition-colors hover:bg-surface-elevated hover:text-fg"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {view === "loading" && (
        <div className="flex flex-1 items-center justify-center bg-surface-alt" onMouseDown={handleWindowDrag}>
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-fg-muted border-t-accent" />
            <p className="text-[13px] text-fg-muted">Initializing FaceFlow...</p>
          </div>
        </div>
      )}
      {view === "setup" && (
        <div className="flex flex-1 items-center justify-center bg-surface-alt p-8" onMouseDown={handleWindowDrag}>
          <div className="max-w-md text-center">
            {isDownloading ? (
              <>
                <div className="mx-auto mb-6 h-8 w-8 animate-spin rounded-full border-2 border-fg-muted border-t-accent" />
                <h2 className="mb-2 text-lg font-semibold text-fg">Setting Up Face Detection</h2>
                {downloadProgress && downloadProgress.phase === "downloading" ? (
                  <>
                    <p className="text-[13px] text-fg-muted">
                      Downloading models... {(downloadProgress.downloaded_bytes / 1024 / 1024).toFixed(1)} MB
                      {downloadProgress.total_bytes > 0
                        ? ` / ${(downloadProgress.total_bytes / 1024 / 1024).toFixed(1)} MB`
                        : ""}
                    </p>
                    {downloadProgress.total_bytes > 0 && (
                      <div className="mx-auto mt-3 h-2 w-64 overflow-hidden rounded-full bg-surface-elevated">
                        <div
                          className="h-full rounded-full bg-accent transition-all duration-300"
                          style={{
                            width: `${Math.round((downloadProgress.downloaded_bytes / downloadProgress.total_bytes) * 100)}%`,
                          }}
                        />
                      </div>
                    )}
                    <p className="mt-2 text-[11px] text-fg-muted/60">
                      {downloadProgress.total_bytes > 0
                        ? `${Math.round((downloadProgress.downloaded_bytes / downloadProgress.total_bytes) * 100)}% complete`
                        : "This may take a few minutes on the first launch"}
                    </p>
                  </>
                ) : downloadProgress && downloadProgress.phase === "extracting" ? (
                  <p className="text-[13px] text-fg-muted">Extracting model files...</p>
                ) : (
                  <>
                    <p className="text-[13px] text-fg-muted">{downloadStatus}</p>
                    <p className="mt-2 text-[11px] text-fg-muted/60">This may take a few minutes on the first launch</p>
                  </>
                )}
              </>
            ) : (
              <>
                <svg className="mx-auto mb-6 h-16 w-16 text-fg-muted/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                <h2 className="mb-2 text-lg font-semibold text-fg">Privacy & Setup</h2>

                {/* Privacy notice */}
                <div className="mb-5 rounded-xl bg-surface/60 px-5 py-4 text-left text-[12px] leading-relaxed text-fg-muted">
                  <p className="mb-2 font-medium text-fg">How FaceFlow handles your data:</p>
                  <ul className="list-inside space-y-1.5">
                    <li className="flex items-start gap-2">
                      <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-positive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      <span>All face detection runs locally on your Mac</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-positive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      <span>No photos or personal data are sent anywhere</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-positive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      <span>Only your activation code is verified online</span>
                    </li>
                  </ul>
                </div>

                <p className="mb-4 text-[13px] text-fg-muted">
                  FaceFlow needs to download InsightFace ONNX models for local face detection (~183 MB).
                </p>
                <p className="mb-2 text-[11px] text-fg-muted/60">
                  Models directory: <code className="text-[11px] text-fg-muted/80">{modelsDir}</code>
                </p>

                {/* Consent checkbox */}
                <label className="mt-4 flex cursor-pointer items-center justify-center gap-2.5 text-[12px] text-fg-muted">
                  <input
                    type="checkbox"
                    checked={modelConsent}
                    onChange={(e) => setModelConsent(e.target.checked)}
                    className="h-4 w-4 rounded border-edge accent-accent"
                  />
                  <span>I agree to download the face detection models</span>
                </label>

                <button
                  onClick={handleRetryModels}
                  disabled={!modelConsent}
                  className="mt-5 rounded-xl bg-accent px-6 py-2.5 text-[13px] font-medium text-white transition-all hover:bg-accent-hover active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100"
                >
                  Download Models
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {view === "dropzone" && <DropZone onFolderSelected={handleFolderSelected} />}
      {view === "progress" && <ProgressView progress={progress} isResume={isResumeScan} />}
      {view === "gallery" && <GalleryView groups={faceGroups} noFaceFiles={noFaceFiles} lowQualityFaces={lowQualityFaces} onReset={handleReset} />}

      {resumePrompt && (
        <ResumeDialog
          folderPath={resumePrompt.folderPath}
          lastProcessedIndex={resumePrompt.row.last_processed_index}
          totalFiles={resumePrompt.row.total_files}
          onResume={handleResumeContinue}
          onRestart={handleResumeRestart}
          onCancel={() => setResumePrompt(null)}
        />
      )}

      {restartPrompt && (
        <RestartDialog
          folderPath={restartPrompt.folderPath}
          scannedCount={restartPrompt.scannedCount}
          onContinue={handleRestartContinue}
          onFresh={handleRestartFresh}
          onCancel={() => setRestartPrompt(null)}
        />
      )}

      {scanSummary && (
        <ScanSummaryDialog
          totalFiles={scanSummary.total_files}
          processedCount={scanSummary.processed_count}
          skippedFiles={scanSummary.skipped_files}
          onClose={() => setScanSummary(null)}
        />
      )}
    </div>
  );
}

export default App;
