import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { FaceFlowLogo } from "./FaceFlowLogo";
import type { VolumeInfo } from "../types";

interface DropZoneProps {
  onFolderSelected: (path: string) => void;
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
          onFolderSelected(folder);
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
      onFolderSelected(selected as string);
    }
  }, [onFolderSelected]);

  const usedPercent = (vol: VolumeInfo) => {
    if (vol.total_bytes === 0) return 0;
    return Math.round(((vol.total_bytes - vol.available_bytes) / vol.total_bytes) * 100);
  };

  return (
    <div
      className="relative flex h-full w-full flex-col"
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
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            <p className="text-lg font-semibold text-accent">Drop folder here</p>
            <p className="text-sm text-fg-muted">Release to start scanning</p>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col items-center justify-center px-10 pb-10 pt-12">
        {/* macOS title bar drag region */}
        <div
          data-tauri-drag-region
          className="absolute inset-x-0 top-0 z-10 h-[38px]"
        />

        {/* Central card */}
        <div className="w-full max-w-[780px] rounded-2xl border border-white/[0.08] bg-white/[0.06] px-12 py-10 shadow-xl backdrop-blur-2xl">
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
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
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
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V15m0 0l-2.25 1.313M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 17.25v-.228a4.328 4.328 0 00-.773-2.468l-5.334-7.918a.75.75 0 00-1.245 0l-5.334 7.918a4.328 4.328 0 00-.773 2.468v.228a2.25 2.25 0 002.25 2.25h9A2.25 2.25 0 0021.75 17.25z" />
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
                      onClick={() => onFolderSelected(vol.mount_point)}
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
        </div>
      </div>
    </div>
  );
};
