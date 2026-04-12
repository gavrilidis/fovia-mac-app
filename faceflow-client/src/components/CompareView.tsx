import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FaceEntry } from "../types";

interface CompareViewProps {
  photos: FaceEntry[];
  onClose: () => void;
}

export const CompareView: React.FC<CompareViewProps> = ({ photos, onClose }) => {
  const [images, setImages] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const loadImages = async () => {
      const results = new Map<string, string>();
      for (const photo of photos.slice(0, 4)) {
        try {
          const data = await invoke<string>("read_photo_base64", { filePath: photo.file_path });
          results.set(photo.file_path, data);
        } catch {
          // skip
        }
      }
      setImages(results);
    };
    loadImages();
  }, [photos]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const displayPhotos = photos.slice(0, 4);
  const gridCols = displayPhotos.length <= 2 ? "grid-cols-2" : "grid-cols-2";

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-edge px-5 py-2.5">
        <h2 className="text-[13px] font-semibold text-fg">
          Compare {displayPhotos.length} Photos
        </h2>
        <button
          onClick={onClose}
          title="Close comparison"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface-elevated hover:text-fg"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Grid */}
      <div className={`grid flex-1 gap-1 overflow-hidden ${gridCols}`}>
        {displayPhotos.map((photo) => {
          const imgData = images.get(photo.file_path);
          const filename = photo.file_path.split("/").pop() || "";
          return (
            <div key={photo.face_id} className="relative flex flex-col overflow-hidden">
              <div className="flex-1 overflow-hidden bg-black">
                {imgData ? (
                  <img
                    src={`data:image/jpeg;base64,${imgData}`}
                    alt={filename}
                    className="h-full w-full object-contain"
                  />
                ) : photo.preview_base64 ? (
                  <img
                    src={`data:image/jpeg;base64,${photo.preview_base64}`}
                    alt={filename}
                    className="h-full w-full object-contain opacity-50"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-fg-muted/30 border-t-accent" />
                  </div>
                )}
              </div>
              <div className="bg-surface-alt px-4 py-2">
                <p className="truncate text-[12px] font-medium text-fg">{filename}</p>
                {photo.detection_score > 0 && (
                  <p className="text-[11px] text-fg-muted">
                    Score: {(photo.detection_score * 100).toFixed(0)}%
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
