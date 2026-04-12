import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { FaceFlowLogo } from "./FaceFlowLogo";
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

export const DropZone: React.FC<DropZoneProps> = ({ onFolderSelected }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [volumes, setVolumes] = useState<VolumeInfo[]>([]);
  const [detectionThreshold, setDetectionThreshold] = useState(0.5);
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
    [onFolderSelected],
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
            <p className="text-lg font-semibold text-accent">Drop folder here</p>
            <p className="text-sm text-fg-muted">Release to start scanning</p>
          </div>
        </div>
      )}

      {/* Main content — fills entire window, no card boundary */}
      <div
        className="flex flex-1 flex-col items-center justify-center px-12 pt-[50px] pb-10"
        onMouseDown={handleWindowDrag}
      >
        <div className="w-full max-w-[780px]">
          {/* Logo icon */}
          <div className="flex justify-center mb-6">
            <FaceFlowLogo size={72} />
          </div>

          {/* Title */}
          <h1 className="text-center text-[22px] font-bold uppercase tracking-[0.08em] text-fg leading-tight">
            Select photo archive to<br />begin identification.
          </h1>

          {/* Subtitle */}
          <p className="mt-4 text-center text-[13px] text-fg-muted">
            Identify faces across your photo collection. Drag & drop a folder, or select a source below.
          </p>

          {/* SELECT SOURCE label */}
          <h3 className="mt-8 mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted/60">
            Select Source
          </h3>

          {/* Source cards grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Browse Folder card */}
            <button
              onClick={handleBrowse}
              className="group flex flex-col rounded-xl border border-edge bg-surface-elevated/50 p-6 text-left transition-all duration-150 hover:border-accent/40 hover:bg-surface-elevated"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-surface/60 text-fg-muted transition-colors group-hover:text-accent">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
                  </svg>
                </div>
                <div>
                  <p className="text-[11px] text-fg-muted">Local Folders</p>
                  <p className="text-[15px] font-semibold text-fg">Browse Folder</p>
                </div>
              </div>
              <p className="text-[12px] text-fg-muted mb-5">Select folder or drag here.</p>
              <div className="mt-auto flex w-full items-center justify-center rounded-lg bg-accent/15 py-2.5 text-[13px] font-medium text-accent transition-colors group-hover:bg-accent group-hover:text-white">
                Scan Folder
              </div>
            </button>

            {/* Drives card */}
            <div className="flex flex-col gap-3 rounded-xl border border-edge bg-surface-elevated/50 p-5">
              {volumes.length === 0 ? (
                <div className="flex flex-1 items-center justify-center text-[12px] text-fg-muted/50">
                  No drives detected
                </div>
              ) : (
                volumes.map((vol) => (
                  <div
                    key={vol.mount_point}
                    className="flex items-center gap-4"
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-surface/60 text-fg-muted">
                      {vol.is_removable ? (
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 3H9a2 2 0 00-2 2v14a2 2 0 002 2h6a2 2 0 002-2V5a2 2 0 00-2-2z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6h1m0 3h1" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H5a2 2 0 00-2 2v5a2 2 0 002 2z" />
                        </svg>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-fg">{vol.name}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-[4px] min-w-0 flex-1 overflow-hidden rounded-full bg-surface">
                          <div
                            className="h-full rounded-full bg-accent/60"
                            style={{ width: `${usedPercent(vol)}%` }}
                          />
                        </div>
                        <span className="flex-shrink-0 text-[10px] tabular-nums text-fg-muted">
                          {formatBytes(vol.available_bytes)} free
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => onFolderSelected(vol.mount_point, detectionThreshold)}
                      className="flex-shrink-0 rounded-lg bg-surface/80 px-3 py-1.5 text-[11px] font-medium text-fg-muted transition-all hover:bg-accent hover:text-white"
                    >
                      Scan Drive
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-[11px] text-fg-muted/40">
            Supports over 20+ image formats. AI-powered sorting for professional workflows.
          </p>

          {/* Detection threshold setting */}
          <div className="mt-5 flex items-center justify-between rounded-xl border border-edge bg-surface-elevated/50 px-6 py-4">
            <div>
              <h3 className="text-[13px] font-semibold text-fg">Detection Threshold</h3>
              <p className="mt-1 text-[11px] text-fg-muted">
                Minimum confidence for face detection. Lower values find more faces but may include false positives.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={0.1}
                max={0.95}
                step={0.05}
                value={detectionThreshold}
                onChange={(e) => setDetectionThreshold(parseFloat(e.target.value))}
                title="Face detection confidence threshold"
                className="h-1.5 w-32 cursor-pointer appearance-none rounded-full bg-surface accent-accent"
              />
              <span className="w-10 text-right text-[15px] font-bold tabular-nums text-accent">
                {detectionThreshold.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
