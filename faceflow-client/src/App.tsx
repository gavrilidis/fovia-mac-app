import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { DropZone } from "./components/DropZone";
import { ProgressView } from "./components/ProgressView";
import { GalleryView } from "./components/GalleryView";
import { ActivationView } from "./components/ActivationView";
import { groupFacesByIdentity } from "./services/faceGrouping";
import type { AppView, DownloadProgress, FaceGroup, ScanProgress, ScanResult, ModelStatus } from "./types";

function App() {
  const [view, setView] = useState<AppView>("loading");
  const [activated, setActivated] = useState<boolean | null>(null);
  const [, setModelsReady] = useState(false);
  const [modelsDir, setModelsDir] = useState("");
  const [downloadStatus, setDownloadStatus] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [progress, setProgress] = useState<ScanProgress>({
    total_files: 0,
    processed: 0,
    current_file: "",
    faces_found: 0,
    errors: 0,
    last_error: "",
    phase: "scanning",
    files_read: 0,
  });
  const [faceGroups, setFaceGroups] = useState<FaceGroup[]>([]);
  const [noFaceFiles, setNoFaceFiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

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
          // Auto-start download
          handleRetryModels();
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

  const handleFolderSelected = useCallback(async (folderPath: string, detectionThreshold: number) => {
    setView("progress");
    setError(null);
    setProgress({ total_files: 0, processed: 0, current_file: "Starting...", faces_found: 0, errors: 0, last_error: "", phase: "scanning", files_read: 0 });

    try {
      const result = await invoke<ScanResult>("scan_folder", {
        folderPath,
        detectionThreshold,
      });

      const groups = groupFacesByIdentity(result.faces);
      setFaceGroups(groups);
      setNoFaceFiles(result.no_face_files);
      setView("gallery");
    } catch (err) {
      const message = typeof err === "string" ? err : "An unexpected error occurred";
      setError(message);
      setView("dropzone");
    }
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
    setError(null);
    setProgress({ total_files: 0, processed: 0, current_file: "", faces_found: 0, errors: 0, last_error: "", phase: "scanning", files_read: 0 });
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
          handleRetryModels();
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
            <svg className="mx-auto mb-6 h-16 w-16 text-fg-muted/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4l4 4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4" />
            </svg>
            <h2 className="mb-2 text-lg font-semibold text-fg">
              {isDownloading ? "Setting Up Face Detection" : "Face Detection Models Required"}
            </h2>
            {isDownloading ? (
              <div className="mb-6">
                <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-fg-muted border-t-accent" />
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
              </div>
            ) : (
              <>
                <p className="mb-4 text-[13px] text-fg-muted">
                  FaceFlow needs InsightFace ONNX models to detect faces locally (~183 MB).
                </p>
                <p className="mb-2 text-[11px] text-fg-muted/60">
                  Models directory: <code className="text-[11px] text-fg-muted/80">{modelsDir}</code>
                </p>
                <button
                  onClick={handleRetryModels}
                  className="rounded-xl bg-accent px-6 py-2.5 text-[13px] font-medium text-white transition-all hover:bg-accent-hover active:scale-[0.97]"
                >
                  Download Models
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {view === "dropzone" && <DropZone onFolderSelected={handleFolderSelected} />}
      {view === "progress" && <ProgressView progress={progress} />}
      {view === "gallery" && <GalleryView groups={faceGroups} noFaceFiles={noFaceFiles} onReset={handleReset} />}
    </div>
  );
}

export default App;
