import React, { useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { StarRating } from "./StarRating";
import { ColorLabelPicker } from "./ColorLabelPicker";
import { FaceFlowLogo } from "./FaceFlowLogo";
import type { ColorLabel, PickStatus, PhotoMeta } from "../types";

interface ToolbarProps {
  groupCount: number;
  selectedPhotoCount: number;
  selectedPhotoPaths: string[];
  metaMap: Map<string, PhotoMeta>;
  onSetRating: (paths: string[], rating: number) => void;
  onSetColorLabel: (paths: string[], label: ColorLabel) => void;
  onSetPickStatus: (paths: string[], status: PickStatus) => void;
  onRevealPhotos: () => void;
  onExport: () => void;
  onCompare: () => void;
  onToggleExif: () => void;
  onReset: () => void;
  showExif: boolean;
  filterRating: number;
  onFilterRatingChange: (rating: number) => void;
  filterPick: PickStatus | "all";
  onFilterPickChange: (status: PickStatus | "all") => void;
  filterLabel: ColorLabel | "all";
  onFilterLabelChange: (label: ColorLabel | "all") => void;
  filterQuality: string;
  onFilterQualityChange: (quality: string) => void;
  eventView: boolean;
  onToggleEventView: () => void;
  eventGap: number;
  onEventGapChange: (gap: number) => void;
  eventCount: number;
}

/* Small icon button */
const IconBtn: React.FC<{
  onClick: () => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}> = ({ onClick, title, active, children }) => (
  <button
    onClick={onClick}
    title={title}
    className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150 ${
      active
        ? "bg-accent/15 text-accent"
        : "text-fg-muted hover:bg-surface-elevated hover:text-fg"
    }`}
  >
    {children}
  </button>
);

export const Toolbar: React.FC<ToolbarProps> = ({
  groupCount,
  selectedPhotoCount,
  selectedPhotoPaths,
  metaMap,
  onSetRating,
  onSetColorLabel,
  onSetPickStatus,
  onRevealPhotos,
  onExport,
  onCompare,
  onToggleExif,
  onReset,
  showExif,
  filterRating,
  onFilterRatingChange,
  filterPick,
  onFilterPickChange,
  filterLabel,
  onFilterLabelChange,
  filterQuality,
  onFilterQualityChange,
  eventView,
  onToggleEventView,
  eventGap,
  onEventGapChange,
  eventCount,
}) => {
  const handleWindowDrag = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input, a, select, textarea")) return;
    getCurrentWindow().startDragging();
  }, []);

  const selectedMetas = selectedPhotoPaths.map((fp) => metaMap.get(fp)).filter(Boolean);
  const commonRating =
    selectedMetas.length > 0 && selectedMetas.every((m) => m!.rating === selectedMetas[0]!.rating)
      ? selectedMetas[0]!.rating
      : 0;
  const commonLabel =
    selectedMetas.length > 0 && selectedMetas.every((m) => m!.color_label === selectedMetas[0]!.color_label)
      ? selectedMetas[0]!.color_label
      : ("none" as ColorLabel);
  const commonPick =
    selectedMetas.length > 0 && selectedMetas.every((m) => m!.pick_status === selectedMetas[0]!.pick_status)
      ? selectedMetas[0]!.pick_status
      : ("none" as PickStatus);

  const hasSelection = selectedPhotoCount > 0;
  const hasActiveFilters = filterRating > 0 || filterPick !== "all" || filterLabel !== "all" || filterQuality !== "all";

  return (
    <div
      className="flex-shrink-0 border-b border-edge bg-surface-alt pt-[38px]"
      onMouseDown={handleWindowDrag}
    >
      {/* ── Row 1: Branding + Filters + Global Actions ── */}
      <div className="flex h-11 items-center gap-3 px-4">
        {/* Left: branding */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <FaceFlowLogo size={22} />
          <span className="text-[13px] font-semibold tracking-tight text-fg">FaceFlow</span>
          <div className="h-3 w-px bg-edge" />
          <span className="text-[11px] tabular-nums text-fg-muted">
            {groupCount} {groupCount === 1 ? "person" : "people"}
          </span>
        </div>

        {/* Spacer */}
        <div className="min-w-2 flex-1" />

        {/* Filters */}
        <div className="flex items-center gap-1">
          <select
            value={filterRating}
            onChange={(e) => onFilterRatingChange(parseInt(e.target.value))}
            className={`h-7 cursor-pointer rounded-md border bg-surface px-2 text-[11px] outline-none transition-colors duration-150 ${
              filterRating > 0
                ? "border-accent/40 text-accent"
                : "border-transparent text-fg-muted hover:border-edge hover:text-fg"
            }`}
            title="Filter by minimum rating"
          >
            <option value={0}>Rating</option>
            <option value={1}>1+ Stars</option>
            <option value={2}>2+ Stars</option>
            <option value={3}>3+ Stars</option>
            <option value={4}>4+ Stars</option>
            <option value={5}>5 Stars</option>
          </select>

          <select
            value={filterPick}
            onChange={(e) => onFilterPickChange(e.target.value as PickStatus | "all")}
            className={`h-7 cursor-pointer rounded-md border bg-surface px-2 text-[11px] outline-none transition-colors duration-150 ${
              filterPick !== "all"
                ? "border-accent/40 text-accent"
                : "border-transparent text-fg-muted hover:border-edge hover:text-fg"
            }`}
            title="Filter by pick status"
          >
            <option value="all">Status</option>
            <option value="pick">Picked</option>
            <option value="reject">Rejected</option>
            <option value="none">Unflagged</option>
          </select>

          <select
            value={filterLabel}
            onChange={(e) => onFilterLabelChange(e.target.value as ColorLabel | "all")}
            className={`h-7 cursor-pointer rounded-md border bg-surface px-2 text-[11px] outline-none transition-colors duration-150 ${
              filterLabel !== "all"
                ? "border-accent/40 text-accent"
                : "border-transparent text-fg-muted hover:border-edge hover:text-fg"
            }`}
            title="Filter by color label"
          >
            <option value="all">Label</option>
            <option value="red">Red</option>
            <option value="yellow">Yellow</option>
            <option value="green">Green</option>
            <option value="blue">Blue</option>
            <option value="purple">Purple</option>
          </select>

          <select
            value={filterQuality}
            onChange={(e) => onFilterQualityChange(e.target.value)}
            className={`h-7 cursor-pointer rounded-md border bg-surface px-2 text-[11px] outline-none transition-colors duration-150 ${
              filterQuality !== "all"
                ? "border-accent/40 text-accent"
                : "border-transparent text-fg-muted hover:border-edge hover:text-fg"
            }`}
            title="Filter by quality"
          >
            <option value="all">Quality</option>
            <option value="sharp">Sharp only</option>
            <option value="eyes_open">Eyes open</option>
            <option value="no_defects">No defects</option>
          </select>

          {hasActiveFilters && (
            <button
              onClick={() => {
                onFilterRatingChange(0);
                onFilterPickChange("all");
                onFilterLabelChange("all");
                onFilterQualityChange("all");
              }}
              title="Clear all filters"
              className="ml-0.5 flex h-5 w-5 items-center justify-center rounded text-fg-muted/60 transition-colors hover:text-fg"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="h-3.5 w-px bg-edge" />

        {/* Global actions */}
        <div className="flex items-center gap-0.5">
          <IconBtn onClick={onToggleEventView} title="Timeline events" active={eventView}>
            <svg className="h-[15px] w-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </IconBtn>

          {eventView && (
            <div className="flex items-center gap-1.5 ml-1">
              <span className="text-[10px] text-fg-muted whitespace-nowrap">{eventGap}min gap</span>
              <input
                type="range"
                min="5"
                max="240"
                step="5"
                value={eventGap}
                onChange={(e) => onEventGapChange(parseInt(e.target.value))}
                className="h-1 w-16 cursor-pointer accent-accent"
                title={`Time gap: ${eventGap} minutes`}
              />
              <span className="text-[10px] tabular-nums text-fg-muted whitespace-nowrap">
                {eventCount} event{eventCount !== 1 ? "s" : ""}
              </span>
            </div>
          )}

          <IconBtn onClick={onToggleExif} title="Photo info (I)" active={showExif}>
            <svg className="h-[15px] w-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
          </IconBtn>

          <button
            onClick={onReset}
            title="New Scan"
            className="ml-1 flex h-7 items-center gap-1.5 rounded-md border border-edge px-2.5 text-[11px] font-medium text-fg-muted transition-all duration-150 hover:border-edge-light hover:bg-surface-elevated hover:text-fg"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
            New Scan
          </button>
        </div>
      </div>

      {/* ── Row 2: Selection Bar (only when photos selected) ── */}
      {hasSelection && (
        <div className="flex h-10 items-center gap-3 border-t border-edge/40 px-4">
          {/* Selection count */}
          <span className="flex-shrink-0 text-[11px] font-medium tabular-nums text-accent">
            {selectedPhotoCount} selected
          </span>

          <div className="h-3.5 w-px bg-edge" />

          {/* Rating */}
          <StarRating
            rating={commonRating}
            size="sm"
            onChange={(r) => onSetRating(selectedPhotoPaths, r)}
          />

          <div className="h-3.5 w-px bg-edge" />

          {/* Color labels */}
          <ColorLabelPicker
            current={commonLabel}
            onChange={(l) => onSetColorLabel(selectedPhotoPaths, l)}
          />

          <div className="h-3.5 w-px bg-edge" />

          {/* Pick / Reject */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => onSetPickStatus(selectedPhotoPaths, commonPick === "pick" ? "none" : "pick")}
              title="Pick (P)"
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-all duration-150 ${
                commonPick === "pick"
                  ? "bg-positive/20 text-positive"
                  : "text-fg-muted/50 hover:bg-surface-elevated hover:text-fg"
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </button>
            <button
              onClick={() => onSetPickStatus(selectedPhotoPaths, commonPick === "reject" ? "none" : "reject")}
              title="Reject (X)"
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-all duration-150 ${
                commonPick === "reject"
                  ? "bg-negative/20 text-negative"
                  : "text-fg-muted/50 hover:bg-surface-elevated hover:text-fg"
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Spacer */}
          <div className="min-w-2 flex-1" />

          {/* Selection actions */}
          <div className="flex items-center gap-0.5">
            {selectedPhotoCount >= 2 && (
              <IconBtn onClick={onCompare} title="Compare selected">
                <svg className="h-[15px] w-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
              </IconBtn>
            )}

            <IconBtn onClick={onRevealPhotos} title="Reveal in Finder">
              <svg className="h-[15px] w-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
              </svg>
            </IconBtn>

            <button
              onClick={onExport}
              title="Export selected"
              className="ml-1 flex h-7 items-center gap-1.5 rounded-md bg-accent px-3 text-[11px] font-medium text-white transition-all duration-150 hover:bg-accent-hover active:scale-[0.97]"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Export
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
