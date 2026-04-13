import React, { useEffect, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FaceEntry } from "../types";

interface CompareViewProps {
  photos: FaceEntry[];
  onClose: () => void;
}

export const CompareView: React.FC<CompareViewProps> = ({ photos, onClose }) => {
  const [images, setImages] = useState<Map<string, string>>(new Map());
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

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
      // Reset zoom on '0'
      if (e.key === "0") { setZoom(1); setPan({ x: 0, y: 0 }); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Synchronized wheel zoom — anchored to cursor position
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prev) => {
      const next = Math.max(0.5, Math.min(prev * delta, 10));
      // Adjust pan to zoom towards cursor
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const cx = e.clientX - rect.left - rect.width / 2;
        const cy = e.clientY - rect.top - rect.height / 2;
        const scale = 1 - next / prev;
        setPan((p) => ({ x: p.x + cx * scale, y: p.y + cy * scale }));
      }
      return next;
    });
  }, []);

  // Pan via mouse drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: panStart.current.panX + (e.clientX - panStart.current.x),
      y: panStart.current.panY + (e.clientY - panStart.current.y),
    });
  }, [isPanning]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const displayPhotos = photos.slice(0, 4);
  const gridCols = displayPhotos.length <= 2 ? "grid-cols-2" : "grid-cols-2";

  const imgStyle: React.CSSProperties = {
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    transformOrigin: "center center",
    transition: isPanning ? "none" : "transform 0.1s ease-out",
  };

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-edge px-5 py-2.5">
        <div className="flex items-center gap-4">
          <h2 className="text-[13px] font-semibold text-fg">
            Compare {displayPhotos.length} Photos
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-[11px] tabular-nums text-fg-muted">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
              title="Reset zoom (0)"
              className="flex h-6 items-center gap-1 rounded border border-edge px-2 text-[10px] text-fg-muted transition-colors hover:bg-surface-elevated hover:text-fg"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              </svg>
              Fit
            </button>
          </div>
        </div>
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
      <div
        ref={containerRef}
        className={`grid flex-1 gap-1 overflow-hidden ${gridCols}`}
        style={{ cursor: isPanning ? "grabbing" : zoom > 1 ? "grab" : "default" }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
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
                    style={imgStyle}
                    draggable={false}
                  />
                ) : photo.preview_base64 ? (
                  <img
                    src={`data:image/jpeg;base64,${photo.preview_base64}`}
                    alt={filename}
                    className="h-full w-full object-contain opacity-50"
                    style={imgStyle}
                    draggable={false}
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
