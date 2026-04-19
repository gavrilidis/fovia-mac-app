import React, { useCallback, useState, useRef, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { FaceFlowLogo } from "./FaceFlowLogo";
import { useI18n } from "../i18n";
import type { FaceGroup, ColorLabel, PickStatus, PhotoMeta } from "../types";

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
  onExportXmp: () => void;
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
  // Move-to-person support
  groups: FaceGroup[];
  groupNames: Map<string, string>;
  activeGroupId: string | null;
  onMovePhotos: (targetGroupId: string) => void;
  onCreateGroupAndMove: () => void;
  onHelp: () => void;
  onSettings: () => void;
  // Search
  searchQuery: string;
  onSearchChange: (query: string) => void;
  // AI
  onAiAnalyze: () => void;
  aiAnalyzing: boolean;
  aiConfigured: boolean;
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
  // selection-related props are accepted to keep the existing prop
  // interface stable, but the toolbar no longer renders selection UI —
  // it is owned by BottomActionBar instead. They're explicitly destructured
  // and immediately discarded so callers don't have to change.
  selectedPhotoPaths: _spp,
  metaMap: _mm,
  onSetRating: _osr,
  onSetColorLabel: _oscl,
  onSetPickStatus: _osps,
  onRevealPhotos: _orp,
  onExport: _oe,
  onExportXmp: _oex,
  onCompare: _oc,
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
  groups: _g,
  groupNames: _gn,
  activeGroupId: _agi,
  onMovePhotos: _omp,
  onCreateGroupAndMove: _ocgm,
  onHelp,
  onSettings,
  searchQuery,
  onSearchChange,
  onAiAnalyze,
  aiAnalyzing,
  aiConfigured,
}) => {
  // Suppress "unused" lint for the discarded selection props above.
  void _spp; void _mm; void _osr; void _oscl; void _osps;
  void _orp; void _oe; void _oex; void _oc;
  void _g; void _gn; void _agi; void _omp; void _ocgm;
  const { t, tn } = useI18n();
  const handleWindowDrag = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input, a, select, textarea")) return;
    getCurrentWindow().startDragging();
  }, []);

  // Move-to dropdown state
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const moveMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMoveMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (moveMenuRef.current && !moveMenuRef.current.contains(e.target as Node)) {
        setShowMoveMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMoveMenu]);

  const selectedMetas: PhotoMeta[] = [];
  void selectedMetas;

  const hasSelection = selectedPhotoCount > 0;
  const hasActiveFilters = filterRating > 0 || filterPick !== "all" || filterLabel !== "all" || filterQuality !== "all";

  return (
    <div
      className="flex-shrink-0 border-b border-edge bg-surface-alt pt-[38px]"
      onMouseDown={handleWindowDrag}
    >
      {/* ── Row 1: Branding + Filters + Global Actions ── */}
      <div className="flex h-11 items-center gap-3 overflow-hidden px-4">
        {/* Left: branding */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <FaceFlowLogo size={22} />
          <span className="text-[13px] font-semibold tracking-tight text-fg">FaceFlow</span>
          <div className="h-3 w-px bg-edge" />
          <span className="text-[11px] tabular-nums text-fg-muted">
            {tn("count_people", groupCount)}
          </span>
        </div>

        {/* Spacer */}
        <div className="min-w-2 flex-1" />

        {/* Search bar */}
        <div className="relative flex items-center">
          <svg className="absolute left-2 h-3.5 w-3.5 text-fg-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            id="faceflow-search-input"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("ai_search_placeholder")}
            className="h-7 w-36 rounded-md border border-edge/50 bg-surface pl-7 pr-2 text-[11px] text-fg placeholder:text-fg-muted/50 outline-none transition-all focus:w-48 focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-1.5 flex h-4 w-4 items-center justify-center rounded text-fg-muted/60 hover:text-fg"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex min-w-0 shrink items-center gap-1 overflow-hidden">
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
            <option value={0}>{t("toolbar_filter_rating")}</option>
            <option value={1}>{t("toolbar_stars").replace("{n}", "1")}</option>
            <option value={2}>{t("toolbar_stars").replace("{n}", "2")}</option>
            <option value={3}>{t("toolbar_stars").replace("{n}", "3")}</option>
            <option value={4}>{t("toolbar_stars").replace("{n}", "4")}</option>
            <option value={5}>{t("toolbar_5_stars")}</option>
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
            <option value="all">{t("toolbar_filter_status")}</option>
            <option value="pick">{t("toolbar_picked")}</option>
            <option value="reject">{t("toolbar_rejected")}</option>
            <option value="none">{t("toolbar_unflagged")}</option>
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
            <option value="all">{t("toolbar_filter_label")}</option>
            <option value="red">{t("help_shortcuts_red")}</option>
            <option value="yellow">{t("help_shortcuts_yellow")}</option>
            <option value="green">{t("help_shortcuts_green")}</option>
            <option value="blue">{t("help_shortcuts_blue")}</option>
            <option value="purple">{t("help_shortcuts_purple")}</option>
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
            <option value="all">{t("toolbar_filter_quality")}</option>
            <option value="sharp">{t("toolbar_sharp")}</option>
            <option value="eyes_open">{t("toolbar_eyes_open")}</option>
            <option value="no_defects">{t("toolbar_no_defects")}</option>
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
        <div className="flex flex-shrink-0 items-center gap-0.5">
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

          <IconBtn onClick={onHelp} title="Help">
            <svg className="h-[15px] w-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
          </IconBtn>

          <IconBtn onClick={onSettings} title={t("settings")}>
            <svg className="h-[15px] w-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </IconBtn>

          {aiConfigured && (
            <IconBtn
              onClick={onAiAnalyze}
              title={hasSelection ? t("ai_analyze_selected") : t("ai_analyze")}
              active={aiAnalyzing}
            >
              <svg className={`h-[15px] w-[15px] ${aiAnalyzing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
            </IconBtn>
          )}

          <IconBtn
            onClick={onReset}
            title={t("toolbar_new_scan")}
          >
            <svg className="h-[15px] w-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
          </IconBtn>
        </div>
      </div>

      {/* Row 2 (selection actions) was removed in favour of the unified
          BottomActionBar — see GalleryView. Keeping the actions in only
          one place avoids the previous "three parallel selection bars"
          problem (top toolbar + persons sidebar + bottom bar). */}
    </div>
  );
};
