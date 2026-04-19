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
  showBbox?: boolean;
  metaMap: Map<string, PhotoMeta>;
  aiTags?: Map<string, string[]>;
}

const PREVIEW_CACHE_LIMIT = 500;
const OVERSCAN_PIXELS = 200;
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
  showBbox: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  meta?: PhotoMeta;
  tags?: string[];
}> = React.memo(({ photo, isSelected, showBbox, onToggleSelect, onOpen, meta, tags }) => {
  const { t } = useI18n();
  const [fullImage, setFullImage] = useState<string | null>(() => getCached(photo.file_path));
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);

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
      className={`group relative aspect-square cursor-pointer overflow-hidden rounded-md bg-surface-elevated ring-1 transition-all duration-200 ${
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
          onLoad={(e) => {
            const t = e.currentTarget;
            setImgSize({ w: t.naturalWidth, h: t.naturalHeight });
          }}
        />
      ) : null}

      {showBbox && imgSize && (photo.bbox_x2 - photo.bbox_x1) > 0 && (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${imgSize.w} ${imgSize.h}`}
          preserveAspectRatio="xMidYMid slice"
        >
          <rect
            x={photo.bbox_x1}
            y={photo.bbox_y1}
            width={photo.bbox_x2 - photo.bbox_x1}
            height={photo.bbox_y2 - photo.bbox_y1}
            fill="none"
            stroke="#0a84ff"
            strokeWidth={Math.max(2, imgSize.w / 200)}
            rx={Math.max(4, imgSize.w / 100)}
          />
        </svg>
      )}

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
  showBbox,
  metaMap,
  aiTags,
}) => {
  const { t } = useI18n();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [columns, setColumns] = useState(5);
  const [parentWidth, setParentWidth] = useState(0);
  // M5: thumbnail size — offset applied on top of the responsive default.
  // Negative offset = larger thumbnails (fewer columns), positive = smaller.
  const [zoomOffset, setZoomOffset] = useState<number>(() => {
    const raw = localStorage.getItem("faceflow-zoom-offset");
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? Math.max(-3, Math.min(4, n)) : 0;
  });
  // M5: sort photos by name | date | rating
  const [sortBy, setSortBy] = useState<"name" | "date" | "rating">(() => {
    const raw = localStorage.getItem("faceflow-photo-sort");
    return raw === "date" || raw === "rating" ? raw : "name";
  });
  // View mode: square thumbnails grid (default) or compact filename list.
  // Driven both by the in-grid toggle button below and the native View menu
  // (`view_grid` / `view_list`).
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    const raw = localStorage.getItem("faceflow-photo-viewmode");
    return raw === "list" ? "list" : "grid";
  });
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem("faceflow-zoom-offset", String(zoomOffset));
  }, [zoomOffset]);
  useEffect(() => {
    localStorage.setItem("faceflow-photo-sort", sortBy);
  }, [sortBy]);
  useEffect(() => {
    localStorage.setItem("faceflow-photo-viewmode", viewMode);
  }, [viewMode]);

  // Listen for native menu events (View → Larger/Smaller Thumbnails,
  // Grid / List view).
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id === "zoom_in") setZoomOffset((v) => Math.max(-3, v - 1));
      else if (id === "zoom_out") setZoomOffset((v) => Math.min(4, v + 1));
      else if (id === "view_grid") setViewMode("grid");
      else if (id === "view_list") setViewMode("list");
    };
    window.addEventListener("faceflow:menu", handler as EventListener);
    return () => window.removeEventListener("faceflow:menu", handler as EventListener);
  }, []);

  useEffect(() => {
    const node = parentRef.current;
    if (!node) return;
    const update = () => {
      const width = node.clientWidth;
      setParentWidth(width);
      let base: number;
      if (width < 700) base = 2;
      else if (width < 900) base = 3;
      else if (width < 1200) base = 4;
      else base = 5;
      const next = Math.max(1, Math.min(10, base + zoomOffset));
      setColumns(next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [zoomOffset]);

  // Apply sort order on top of incoming photos
  const sortedPhotos = useMemo(() => {
    if (sortBy === "name") return photos;
    const meta = (fp: string) => metaMap.get(fp);
    const arr = [...photos];
    if (sortBy === "rating") {
      arr.sort((a, b) => (meta(b.file_path)?.rating ?? 0) - (meta(a.file_path)?.rating ?? 0));
    } else {
      // date — by file_path mtime is unknown here; fall back to file name
      // (which usually contains a date for camera output).
      arr.sort((a, b) => a.file_path.localeCompare(b.file_path));
    }
    return arr;
  }, [photos, sortBy, metaMap]);

  const rows = useMemo(() => {
    const out: FaceEntry[][] = [];
    for (let i = 0; i < sortedPhotos.length; i += columns) {
      out.push(sortedPhotos.slice(i, i + columns));
    }
    return out;
  }, [sortedPhotos, columns]);

  // Cards are `aspect-square`, so each row's height tracks the column width.
  // Container has px-2 (16px) horizontal padding and gap-1 (4px) between
  // cards/rows so photos sit almost flush against each other (Lightroom-
  // style dense grid). Without computing this, a fixed `rowHeight` makes
  // cards overflow into the next row whenever the column is wider than the
  // estimate (very visible in the no-faces view, where the right pane is wider).
  const HORIZONTAL_PADDING = 16;
  const GAP = 4;
  const innerWidth = Math.max(0, parentWidth - HORIZONTAL_PADDING);
  // Use exact (un-floored) card size so the absolutely-positioned virtual
  // rows don't accumulate sub-pixel gaps that show up as visible empty
  // bands between rows at certain zoom levels.
  const cardSize =
    innerWidth > 0 && columns > 0
      ? (innerWidth - GAP * (columns - 1)) / columns
      : 280;
  const rowHeight = cardSize + GAP;
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: Math.ceil(OVERSCAN_PIXELS / rowHeight) + 1,
  });

  // Force the virtualizer to recompute positions whenever the row height
  // changes (i.e. when the container width or column count changes).
  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowHeight, rowVirtualizer]);

  if (photos.length === 0) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-4 p-8">
        <p className="text-[13px] text-fg-muted">{t("photogrid_select_person")}</p>
      </div>
    );
  }

  const allSelected = sortedPhotos.every((p) => selectedIds.has(p.face_id));

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-2 py-2">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[15px] font-semibold text-fg">{personLabel}</h2>
          <span className="rounded-md bg-surface-elevated px-2 py-0.5 text-[11px] tabular-nums text-fg-muted">{photos.length}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "name" | "date" | "rating")}
            className="h-7 rounded-md border border-edge bg-surface px-2 text-[11px] text-fg outline-none focus:border-accent/50"
            title={t("photogrid_sort_title")}
          >
            <option value="name">{t("photogrid_sort_name")}</option>
            <option value="date">{t("photogrid_sort_date")}</option>
            <option value="rating">{t("photogrid_sort_rating")}</option>
          </select>
          <div className="flex items-center overflow-hidden rounded-md border border-edge">
            <button
              onClick={() => setViewMode("grid")}
              className={`px-2 py-1 text-[12px] transition-colors ${
                viewMode === "grid"
                  ? "bg-surface-elevated text-fg"
                  : "text-fg-muted hover:bg-surface-elevated hover:text-fg"
              }`}
              title={t("photogrid_view_grid")}
              aria-pressed={viewMode === "grid"}
            >
              ▦
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`border-l border-edge px-2 py-1 text-[12px] transition-colors ${
                viewMode === "list"
                  ? "bg-surface-elevated text-fg"
                  : "text-fg-muted hover:bg-surface-elevated hover:text-fg"
              }`}
              title={t("photogrid_view_list")}
              aria-pressed={viewMode === "list"}
            >
              ☰
            </button>
          </div>
          <div className="flex items-center overflow-hidden rounded-md border border-edge">
            <button
              onClick={() => setZoomOffset((v) => Math.min(4, v + 1))}
              className="px-2 py-1 text-[12px] text-fg-muted transition-colors hover:bg-surface-elevated hover:text-fg"
              title={t("photogrid_zoom_out")}
              disabled={zoomOffset >= 4 || viewMode === "list"}
            >
              −
            </button>
            <button
              onClick={() => setZoomOffset((v) => Math.max(-3, v - 1))}
              className="border-l border-edge px-2 py-1 text-[12px] text-fg-muted transition-colors hover:bg-surface-elevated hover:text-fg"
              title={t("photogrid_zoom_in")}
              disabled={zoomOffset <= -3 || viewMode === "list"}
            >
              +
            </button>
          </div>
          <button
            onClick={allSelected ? onDeselectAll : onSelectAll}
            className="flex items-center gap-1.5 rounded-md border border-edge px-2.5 py-1 text-[11px] font-medium text-fg-muted transition-all duration-150 hover:border-edge-light hover:bg-surface-elevated hover:text-fg"
          >
            {allSelected ? t("photogrid_deselect_all") : t("photogrid_select_all")}
          </button>
        </div>
      </div>

      <div ref={parentRef} className="flex-1 overflow-y-auto px-2 pb-6">
        {viewMode === "list" ? (
          // Compact list view — one row per photo with filename, rating,
          // color label and selection checkbox. Useful for keyboard-driven
          // bulk operations on large folders.
          <table className="w-full table-fixed text-[12px]">
            <thead className="sticky top-0 bg-surface text-left text-[11px] uppercase tracking-wide text-fg-muted/70">
              <tr>
                <th className="w-8 px-2 py-2"></th>
                <th className="px-2 py-2">{t("photogrid_col_name")}</th>
                <th className="w-32 px-2 py-2">{t("photogrid_col_rating")}</th>
                <th className="w-12 px-2 py-2">{t("photogrid_col_label")}</th>
              </tr>
            </thead>
            <tbody>
              {sortedPhotos.map((photo, idx) => {
                const meta = metaMap.get(photo.file_path);
                const isSelected = selectedIds.has(photo.face_id);
                return (
                  <tr
                    key={photo.face_id}
                    onClick={() => onToggleSelect(photo.face_id)}
                    onDoubleClick={() => setViewerIndex(idx)}
                    className={`cursor-pointer border-b border-edge/50 transition-colors ${
                      isSelected ? "bg-accent/15" : "hover:bg-surface-elevated/40"
                    }`}
                  >
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(photo.face_id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-3.5 w-3.5 accent-accent"
                      />
                    </td>
                    <td className="truncate px-2 py-1.5 text-fg">
                      {photo.file_path.split("/").pop()}
                    </td>
                    <td className="px-2 py-1.5">
                      {meta && meta.rating > 0 ? (
                        <StarRating rating={meta.rating} size="sm" readonly />
                      ) : (
                        <span className="text-fg-muted/40">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {meta && meta.color_label !== "none" ? (
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-black/30"
                          style={{ backgroundColor: COLOR_LABEL_MAP[meta.color_label] }}
                        />
                      ) : (
                        <span className="text-fg-muted/40">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index] ?? [];
              return (
                <div
                  key={virtualRow.key}
                  className="absolute left-0 top-0 grid w-full gap-1"
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  }}
                >
                  {row.map((photo) => {
                    const idx = sortedPhotos.findIndex((p) => p.face_id === photo.face_id);
                    return (
                      <PhotoCard
                        key={photo.face_id}
                        photo={photo}
                        isSelected={selectedIds.has(photo.face_id)}
                        showBbox={!!showBbox}
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
        )}
      </div>

      {viewerIndex !== null && (
        <PhotoViewer
          photos={sortedPhotos}
          currentIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onNavigate={setViewerIndex}
        />
      )}
    </div>
  );
};
