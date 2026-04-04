import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { DropZone } from "./components/DropZone";
import { ProgressView } from "./components/ProgressView";
import { GalleryView } from "./components/GalleryView";
import { groupFacesByIdentity } from "./services/faceGrouping";
import type { AppView, FaceGroup, ScanProgress, ScanResult } from "./types";

function App() {
  const [view, setView] = useState<AppView>("dropzone");
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
  const [error, setError] = useState<string | null>(null);

  const handleFolderSelected = useCallback(async (folderPath: string) => {
    setView("progress");
    setError(null);
    setProgress({ total_files: 0, processed: 0, current_file: "Starting...", faces_found: 0, errors: 0, last_error: "", phase: "scanning", files_read: 0 });

    try {
      const result = await invoke<ScanResult>("scan_folder", {
        folderPath,
      });

      const groups = groupFacesByIdentity(result.faces);
      setFaceGroups(groups);
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

  // Listen for Tauri native file drop events (provides real file system paths)
  useEffect(() => {
    const webview = getCurrentWebviewWindow();
    const unlisten = webview.onDragDropEvent((event) => {
      if (event.payload.type === "drop" && view === "dropzone") {
        const paths = event.payload.paths;
        if (paths && paths.length > 0) {
          handleFolderSelected(paths[0]);
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
    setError(null);
    setProgress({ total_files: 0, processed: 0, current_file: "", faces_found: 0, errors: 0, last_error: "", phase: "scanning", files_read: 0 });
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col bg-[var(--bg-primary)]">
      {error && (
        <div className="flex items-center gap-5 border-b border-[var(--danger)]/20 bg-[var(--danger)]/8 px-8 py-5 text-[13px] text-[var(--danger)]">
          <svg className="h-4.5 w-4.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto rounded-lg p-1.5 text-[var(--danger)] transition-colors hover:bg-[var(--danger)]/10 hover:text-[var(--text-primary)]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {view === "dropzone" && <DropZone onFolderSelected={handleFolderSelected} />}
      {view === "progress" && <ProgressView progress={progress} />}
      {view === "gallery" && <GalleryView groups={faceGroups} onReset={handleReset} />}
    </div>
  );
}

export default App;
