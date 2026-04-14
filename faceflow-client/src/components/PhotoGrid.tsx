import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FaceEntry, PhotoMeta } from "../types";
import { COLOR_LABEL_MAP } from "../types";
import { PhotoViewer } from "./PhotoViewer";
import { StarRating } from "./StarRating";

interface PhotoGridProps {
  photos: FaceEntry[];
  personLabel: string;
  selectedIds: Set<string>;
  onToggleSelect: (faceId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  hideBbox?: boolean;
  metaMap: Map<string, PhotoMeta>;
}

/* ------------------------------------------------------------------ */
/* Per-photo card — loads full image lazily, face crop as placeholder  */
/* ------------------------------------------------------------------ */
const PhotoCard: React.FC<{
  photo: FaceEntry;
  isSelected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  hideBbox?: boolean;
  meta?: PhotoMeta;
}> = ({ photo, isSelected, onToggleSelect, onOpen, hideBbox, meta }) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fullImage, setFullImage] = useState<string | null>(null);
  const [bboxStyle, setBboxStyle] = useState<React.CSSProperties | null>(null);

  // Load full image from disk lazily
  useEffect(() => {
    let cancelled = false;
    invoke<string>("read_photo_base64", { filePath: photo.file_path })
      .then((data) => {
        if (!cancelled) setFullImage(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [photo.file_path]);

  const computeBbox = useCallback(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container || !fullImage) return;

    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (nw === 0 || nh === 0) return;

    const scale = Math.max(cw / nw, ch / nh);
    const offsetX = (nw * scale - cw) / 2;
    const offsetY = (nh * scale - ch) / 2;

    setBboxStyle({
      left: `${photo.bbox_x1 * scale - offsetX}px`,
      top: `${photo.bbox_y1 * scale - offsetY}px`,
      width: `${(photo.bbox_x2 - photo.bbox_x1) * scale}px`,
      height: `${(photo.bbox_y2 - photo.bbox_y1) * scale}px`,
    });
  }, [photo, fullImage]);

  const imageSrc = fullImage
    ? `data:image/jpeg;base64,${fullImage}`
    : photo.preview_base64
      ? `data:image/jpeg;base64,${photo.preview_base64}`
      : null;

  return (
    <div
      ref={containerRef}
      className={`group relative aspect-square cursor-pointer overflow-hidden rounded-xl bg-surface-elevated shadow-sm shadow-black/30 ring-1 transition-all duration-200 ${
        isSelected
          ? "ring-2 ring-accent ring-offset-2 ring-offset-surface"
          : "ring-white/[0.06] hover:ring-white/[0.12] hover:shadow-md hover:shadow-black/25"
      }`}
      onClick={() => onToggleSelect()}
      onDoubleClick={() => onOpen()}
    >
      {imageSrc ? (
        <img
          ref={imgRef}
          src={imageSrc}
          alt={photo.file_path.split("/").pop() || "Photo"}
          className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          onLoad={computeBbox}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <svg
            className="h-8 w-8 text-fg-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25a2.25 2.25 0 00-2.25-2.25H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
            />
          </svg>
        </div>
      )}

      {/* Face bounding box overlay — only on full images */}
      {bboxStyle && fullImage && !hideBbox && (
        <div
          className="pointer-events-none absolute rounded-sm border-2 border-accent shadow-[0_0_6px_rgba(99,102,241,0.5)]"
          style={bboxStyle}
        />
      )}

      {/* Selection checkbox */}
      <button
        title={isSelected ? "Deselect photo" : "Select photo"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect();
        }}
        className={`absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-lg border-[1.5px] transition-all duration-200 ${
          isSelected
            ? "border-accent bg-accent text-white shadow-md shadow-accent/30"
            : "border-white/40 bg-black/40 text-transparent opacity-0 backdrop-blur-sm group-hover:opacity-100"
        }`}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </button>

      {/* Pick/Reject badge */}
      {meta && meta.pick_status === "pick" && (
        <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-positive/90 text-white shadow-sm">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
      )}
      {meta && meta.pick_status === "reject" && (
        <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-negative/90 text-white shadow-sm">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      )}

      {/* Color label dot */}
      {meta && meta.color_label !== "none" && (
        <div
          className="absolute left-3 bottom-3 h-2.5 w-2.5 rounded-full shadow-sm ring-1 ring-black/30"
          style={{ backgroundColor: COLOR_LABEL_MAP[meta.color_label] }}
        />
      )}

      {/* Quality indicators: closed eyes + blur */}
      {meta && meta.closed_eyes && (
        <div className="absolute right-3 bottom-3 flex h-5 items-center gap-1 rounded-full bg-warning/90 px-1.5 shadow-sm" title="Closed eyes detected">
          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
          </svg>
        </div>
      )}
      {meta && meta.blur_score !== null && meta.blur_score < 50 && !meta.closed_eyes && (
        <div className="absolute right-3 bottom-3 flex h-5 items-center gap-1 rounded-full bg-fg-muted/70 px-1.5 shadow-sm" title="Low sharpness">
          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-3.5 pt-10 opacity-0 transition-opacity duration-250 group-hover:opacity-100">
        {/* Star rating (inline in overlay) */}
        {meta && meta.rating > 0 && (
          <div className="mb-1">
            <StarRating rating={meta.rating} size="sm" readonly />
          </div>
        )}
        <p className="truncate text-[12px] font-medium text-white">
          {photo.file_path.split("/").pop()}
        </p>
        <p className="mt-0.5 text-[11px] text-white/60">
          {photo.detection_score > 0 ? `Score: ${(photo.detection_score * 100).toFixed(0)}%` : photo.file_path.split("/").pop()}
        </p>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Main grid                                                           */
/* ------------------------------------------------------------------ */
export const PhotoGrid: React.FC<PhotoGridProps> = ({
  photos,
  personLabel,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  hideBbox,
  metaMap,
}) => {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  if (photos.length === 0) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-4 p-8">
        <svg
          className="h-14 w-14 text-fg-muted/30"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={0.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
          />
        </svg>
        <p className="text-[13px] text-fg-muted">
          Select a person to view their photos
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Person header */}
      <div className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[15px] font-semibold text-fg">
            {personLabel}
          </h2>
          <span className="rounded-md bg-surface-elevated px-2 py-0.5 text-[11px] tabular-nums text-fg-muted">
            {photos.length}
          </span>
        </div>
        {/* Select All / Deselect All */}
        {photos.length > 0 && (() => {
          const allSelected = photos.every((p) => selectedIds.has(p.face_id));
          const someSelected = photos.some((p) => selectedIds.has(p.face_id));
          return (
            <button
              onClick={allSelected ? onDeselectAll : onSelectAll}
              className="flex items-center gap-1.5 rounded-md border border-edge px-2.5 py-1 text-[11px] font-medium text-fg-muted transition-all duration-150 hover:border-edge-light hover:bg-surface-elevated hover:text-fg"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {allSelected ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                )}
              </svg>
              {allSelected ? "Deselect All" : someSelected ? "Select All" : "Select All"}
            </button>
          );
        })()}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {photos.map((photo, idx) => (
            <PhotoCard
              key={photo.face_id}
              photo={photo}
              isSelected={selectedIds.has(photo.face_id)}
              onToggleSelect={() => onToggleSelect(photo.face_id)}
              onOpen={() => setViewerIndex(idx)}
              hideBbox={hideBbox}
              meta={metaMap.get(photo.file_path)}
            />
          ))}
        </div>
      </div>

      {/* Full-screen photo viewer */}
      {viewerIndex !== null && (
        <PhotoViewer
          photos={photos}
          currentIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onNavigate={setViewerIndex}
        />
      )}
    </div>
  );
};
