import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { FaceFlowLogo } from "./FaceFlowLogo";
import { SettingsPanel } from "./SettingsPanel";
import { useI18n } from "../i18n";
import type { VolumeInfo } from "../types";

interface DropZoneProps {
  onFolderSelected: (path: string, detectionThreshold: number) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

const FORMATS = ["CR2", "ARW", "NEF", "DNG", "ORF", "RW2", "RAF", "RAW", "HEIC", "HEIF", "AVIF", "JPEG", "PNG", "WebP", "TIFF", "BMP", "GIF"];

export const DropZone: React.FC<DropZoneProps> = ({ onFolderSelected }) => {
  // DropZone uses the *same* unified SettingsPanel as GalleryView so the
  // user always sees identical settings on both surfaces.
  const { t } = useI18n();
  const [isDragging, setIsDragging] = useState(false);
  const [volumes, setVolumes] = useState<VolumeInfo[]>([]);
  const [detectionThreshold, setDetectionThreshold] = useState(0.5);
  const [showSettings, setShowSettings] = useState(false);
  const [showFormats, setShowFormats] = useState(false);
  const dragCounter = useRef(0);

  useEffect(() => {
    invoke<VolumeInfo[]>("list_volumes")
      .then(setVolumes)
      .catch(() => {});
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const file = files[0];
        const path = (file as unknown as { path?: string }).path;
        if (path) {
          const lastSlash = path.lastIndexOf("/");
          const folder = lastSlash > 0 ? path.substring(0, lastSlash) : path;
          onFolderSelected(folder, detectionThreshold);
          return;
        }
      }
    },
    [onFolderSelected, detectionThreshold],
  );

  const handleBrowse = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Photo Folder",
    });
    if (selected) {
      onFolderSelected(selected as string, detectionThreshold);
    }
  }, [onFolderSelected, detectionThreshold]);

  const usedPercent = (vol: VolumeInfo) => {
    if (vol.total_bytes === 0) return 0;
    return Math.round(((vol.total_bytes - vol.available_bytes) / vol.total_bytes) * 100);
  };

  const handleWindowDrag = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input, a, select, textarea")) return;
    getCurrentWindow().startDragging();
  }, []);

  return (
    <div
      className="relative flex h-full w-full flex-col bg-surface-alt"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Full-window drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-surface/90 backdrop-blur-md">
          <div className="flex flex-col items-center gap-6 rounded-3xl border-2 border-dashed border-accent bg-accent/5 px-24 py-20">
            <svg
              className="h-16 w-16 text-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 16V4m0 0L8 8m4-4l4 4M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4"
              />
            </svg>
            <p className="text-lg font-semibold text-accent">{t("drop_here")}</p>
            <p className="text-sm text-fg-muted">{t("drop_release")}</p>
          </div>
        </div>
      )}

      {/* Unified settings panel — identical to the one in GalleryView. */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {/* Top-right settings button — opens the same SettingsPanel as the
          gallery view, in a separate native window when possible. */}
      <div className="absolute top-3 right-4 z-10 flex gap-2">
        <button
          onClick={() => {
            // Try a native window first (M11). Fall back to the in-app
            // overlay if the window can't be created.
            invoke("open_app_window", {
              name: "settings",
              title: "Settings",
              width: 480,
              height: 820,
            }).catch(() => setShowSettings(true));
          }}
          className="rounded-lg p-2 text-fg-muted/50 transition-colors hover:bg-surface-elevated/50 hover:text-fg-muted"
          title={t("settings")}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Main content */}
      <div
        className="flex flex-1 flex-col items-center overflow-y-auto px-8 pt-[50px] pb-8"
        onMouseDown={handleWindowDrag}
      >
        <div className="w-full max-w-[720px]">
          {/* Logo */}
          <div className="flex justify-center mb-4">
            <FaceFlowLogo size={56} />
          </div>

          {/* Title */}
          <h1 className="text-center text-[20px] font-bold uppercase tracking-[0.08em] text-fg leading-tight whitespace-pre-line">
            {t("dropzone_title")}
          </h1>

          {/* Subtitle */}
          <p className="mt-3 text-center text-[12px] text-fg-muted leading-relaxed">
            {t("dropzone_subtitle")}
          </p>

          {/* Drag & drop hint */}
          <div className="mt-2 flex items-center justify-center gap-1.5">
            <svg className="h-3 w-3 text-fg-muted/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
            </svg>
            <span className="text-[10px] text-fg-muted/40">{t("dropzone_drag_hint")}</span>
          </div>

          {/* SELECT SOURCE label */}
          <h3 className="mt-6 mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted/60">
            {t("select_source")}
          </h3>

          {/* Source cards grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Browse Folder card */}
            <button
              onClick={handleBrowse}
              className="group flex flex-col rounded-xl border border-edge bg-surface-elevated/50 p-5 text-left transition-all duration-150 hover:border-accent/40 hover:bg-surface-elevated"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-surface/60 text-fg-muted transition-colors group-hover:text-accent">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
                  </svg>
                </div>
                <div>
                  <p className="text-[10px] text-fg-muted">{t("local_folders")}</p>
                  <p className="text-[14px] font-semibold text-fg">{t("browse_folder")}</p>
                </div>
              </div>
              <p className="text-[11px] text-fg-muted mb-3">{t("browse_folder_desc")}</p>
              <div className="mt-auto flex w-full items-center justify-center rounded-lg bg-accent/15 py-2 text-[12px] font-medium text-accent transition-colors group-hover:bg-accent group-hover:text-white">
                {t("scan_folder")}
              </div>
            </button>

            {/* Drives card */}
            <div className="flex flex-col gap-2.5 rounded-xl border border-edge bg-surface-elevated/50 p-4">
              {volumes.length === 0 ? (
                <div className="flex flex-1 items-center justify-center text-[11px] text-fg-muted/50">
                  {t("no_drives")}
                </div>
              ) : (
                volumes.map((vol) => (
                  <div key={vol.mount_point} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-surface/60 text-fg-muted">
                      {vol.is_removable ? (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 3H9a2 2 0 00-2 2v14a2 2 0 002 2h6a2 2 0 002-2V5a2 2 0 00-2-2z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6h1m0 3h1" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H5a2 2 0 00-2 2v5a2 2 0 002 2z" />
                        </svg>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-fg">{vol.name}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-[3px] min-w-0 flex-1 overflow-hidden rounded-full bg-surface">
                          <div className="h-full rounded-full bg-accent/60" style={{ width: `${usedPercent(vol)}%` }} />
                        </div>
                        <span className="flex-shrink-0 text-[9px] tabular-nums text-fg-muted">
                          {formatBytes(vol.available_bytes)}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => onFolderSelected(vol.mount_point, detectionThreshold)}
                      className="flex-shrink-0 rounded-lg bg-surface/80 px-2.5 py-1 text-[10px] font-medium text-fg-muted transition-all hover:bg-accent hover:text-white"
                    >
                      {t("scan_drive")}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Detection threshold */}
          <div className="mt-4 rounded-xl border border-edge bg-surface-elevated/50 px-5 py-3">
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-[12px] font-semibold text-fg">{t("detection_threshold")}</h3>
                <p className="mt-0.5 text-[10px] text-fg-muted leading-snug">{t("recommended")}</p>
              </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <input
                type="range"
                min={0.1}
                max={0.95}
                step={0.05}
                value={detectionThreshold}
                onChange={(e) => setDetectionThreshold(parseFloat(e.target.value))}
                title={t("detection_threshold")}
                className="h-1.5 w-28 neutral-range"
              />
              <span className="w-9 text-right text-[14px] font-bold tabular-nums text-fg">
                {detectionThreshold.toFixed(2)}
              </span>
            </div>
            </div>
            <p className="mt-2 text-[10px] text-fg-muted/60 leading-relaxed">{t("detection_threshold_desc")}</p>
          </div>

          {/* Supported formats — collapsible */}
          <button
            onClick={() => setShowFormats(!showFormats)}
            className="mt-3 flex w-full items-center gap-2 rounded-xl border border-edge bg-surface-elevated/30 px-5 py-2.5 text-left transition-colors hover:bg-surface-elevated/50"
          >
            <svg className="h-3.5 w-3.5 text-fg-muted/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <span className="flex-1 text-[11px] font-medium text-fg-muted/60">{t("supported_formats")} — {FORMATS.length} formats</span>
            <svg className={`h-3 w-3 text-fg-muted/40 transition-transform ${showFormats ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {showFormats && (
            <div className="mt-1.5 rounded-xl border border-edge bg-surface-elevated/30 px-5 py-3">
              <div className="flex flex-wrap gap-1.5">
                {FORMATS.map((fmt) => (
                  <span key={fmt} className="rounded-md bg-surface/80 px-2 py-0.5 text-[10px] font-medium tabular-nums text-fg-muted">
                    {fmt}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-fg-muted/50">{t("formats_note")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
