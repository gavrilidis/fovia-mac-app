import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { FaceEntry, PhotoMeta } from "../types";
import { COLOR_LABEL_MAP } from "../types";
import { PhotoViewer } from "./PhotoViewer";
import { StarRating } from "./StarRating";
import { useI18n } from "../i18n";

interface PhotoGridProps {
  photos: FaceEntry[];
  personLabel: string;
  selectedIds: Set<string>;
  onToggleSelect: (faceId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  hideBbox?: boolean;
  metaMap: Map<string, PhotoMeta>;
  aiTags?: Map<string, string[]>;
}

const PREVIEW_CACHE_LIMIT = 500;
const previewCache = new Map<string, string>();

function getCached(path: string): string | null {
  const value = previewCache.get(path);
  if (!value) return null;
  previewCache.delete(path);
  previewCache.set(path, value);
  return value;
}

function setCached(path: string, value: string): void {
  if (previewCache.has(path)) previewCache.delete(path);
  previewCache.set(path, value);
  while (previewCache.size > PREVIEW_CACHE_LIMIT) {
    const first = previewCache.keys().next().value;
    if (!first) break;
    previewCache.delete(first);
  }
}

const PhotoCard: React.FC<{
  photo: FaceEntry;
  isSelected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  meta?: PhotoMeta;
  tags?: string[];
}> = React.memo(({ photo, isSelected, onToggleSelect, onOpen, meta, tags }) => {
  const { t } = useI18n();
  const [fullImage, setFullImage] = useState<string | null>(() => getCached(photo.file_path));

  useEffect(() => {
    if (fullImage) return;
    let cancelled = false;
    invoke<string>("read_photo_base64", { filePath: photo.file_path })
      .then((data) => {
        if (cancelled) return;
        setCached(photo.file_path, data);
        setFullImage(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [photo.file_path, fullImage]);

  const imageSrc = fullImage
    ? `data:image/jpeg;base64,${fullImage}`
    : photo.preview_base64
      ? `data:image/jpeg;base64,${photo.preview_base64}`
      : null;

  return (
    <div
      className={`group relative aspect-square cursor-pointer overflow-hidden rounded-xl bg-surface-elevated shadow-sm shadow-black/30 ring-1 transition-all duration-200 ${
        isSelected
          ? "ring-2 ring-accent ring-offset-2 ring-offset-surface"
          : "ring-white/[0.06] hover:ring-white/[0.12] hover:shadow-md hover:shadow-black/25"
      }`}
      onClick={onToggleSelect}
      onDoubleClick={onOpen}
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={photo.file_path.split("/").pop() || "Photo"}
          className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
        />
      ) : null}

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

      {meta && meta.color_label !== "none" && (
        <div
          className="absolute bottom-3 left-3 h-2.5 w-2.5 rounded-full shadow-sm ring-1 ring-black/30"
          style={{ backgroundColor: COLOR_LABEL_MAP[meta.color_label] }}
        />
      )}
      {tags && tags.length > 0 && (
        <div className="absolute bottom-3 right-3 rounded bg-accent/80 px-1.5 py-0.5 text-[10px] text-white">
          AI
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-3.5 pt-10 opacity-0 transition-opacity duration-250 group-hover:opacity-100">
        {meta && meta.rating > 0 && (
          <div className="mb-1">
            <StarRating rating={meta.rating} size="sm" readonly />
          </div>
        )}
        <p className="truncate text-[12px] font-medium text-white">{photo.file_path.split("/").pop()}</p>
        <p className="mt-0.5 text-[11px] text-white/60">{t("photos")}</p>
      </div>
    </div>
  );
});

export const PhotoGrid: React.FC<PhotoGridProps> = ({
  photos,
  personLabel,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  metaMap,
  aiTags,
}) => {
  const { t } = useI18n();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [columns, setColumns] = useState(5);
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = parentRef.current;
    if (!node) return;
    const update = () => {
      const width = node.clientWidth;
      if (width < 700) setColumns(2);
      else if (width < 900) setColumns(3);
      else if (width < 1200) setColumns(4);
      else setColumns(5);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const rows = useMemo(() => {
    const out: FaceEntry[][] = [];
    for (let i = 0; i < photos.length; i += columns) {
      out.push(photos.slice(i, i + columns));
    }
    return out;
  }, [photos, columns]);

  const rowHeight = 280;
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: Math.ceil(200 / rowHeight) + 1,
  });

  if (photos.length === 0) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-4 p-8">
        <p className="text-[13px] text-fg-muted">Select a person to view their photos</p>
      </div>
    );
  }

  const allSelected = photos.every((p) => selectedIds.has(p.face_id));

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[15px] font-semibold text-fg">{personLabel}</h2>
          <span className="rounded-md bg-surface-elevated px-2 py-0.5 text-[11px] tabular-nums text-fg-muted">{photos.length}</span>
        </div>
        <button
          onClick={allSelected ? onDeselectAll : onSelectAll}
          className="flex items-center gap-1.5 rounded-md border border-edge px-2.5 py-1 text-[11px] font-medium text-fg-muted transition-all duration-150 hover:border-edge-light hover:bg-surface-elevated hover:text-fg"
        >
          {allSelected ? t("photogrid_deselect_all") : t("photogrid_select_all")}
        </button>
      </div>

      <div ref={parentRef} className="flex-1 overflow-y-auto px-6 pb-6">
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index] ?? [];
            return (
              <div
                key={virtualRow.key}
                className="absolute left-0 top-0 grid w-full gap-4"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                }}
              >
                {row.map((photo) => {
                  const idx = photos.findIndex((p) => p.face_id === photo.face_id);
                  return (
                    <PhotoCard
                      key={photo.face_id}
                      photo={photo}
                      isSelected={selectedIds.has(photo.face_id)}
                      onToggleSelect={() => onToggleSelect(photo.face_id)}
                      onOpen={() => setViewerIndex(idx)}
                      meta={metaMap.get(photo.file_path)}
                      tags={aiTags?.get(photo.file_path)}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

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
