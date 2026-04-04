import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { FoviaLogo } from "./FoviaLogo";
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
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--bg-primary)]/90 backdrop-blur-md">
          <div className="flex flex-col items-center gap-6 rounded-3xl border-2 border-dashed border-[var(--accent)] bg-[var(--accent)]/5 px-24 py-20">
            <svg
              className="h-16 w-16 text-[var(--accent)]"
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
            <p className="text-lg font-semibold text-[var(--accent)]">Drop folder here</p>
            <p className="text-sm text-[var(--text-secondary)]">Release to start scanning</p>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col items-center justify-center gap-10 px-8 py-16">
        {/* Logo + description */}
        <div className="flex flex-col items-center gap-6">
          <FoviaLogo className="text-[var(--text-primary)]" size={240} />

          <p className="mt-2 max-w-sm text-center text-[13px] leading-relaxed text-[var(--text-secondary)]">
            Drag a photo folder anywhere on this window, browse for a folder,
            or select a connected drive below.
          </p>

          <p className="text-[11px] tracking-wide text-[var(--text-secondary)]/40">
            CR2 / ARW / NEF / DNG / ORF / RW2 / RAF / JPG / PNG / HEIC / TIFF / WebP / AVIF
          </p>
        </div>

        {/* Browse button – generous, symmetrical padding */}
        <button
          onClick={handleBrowse}
          className="flex items-center justify-center gap-3 rounded-2xl bg-[var(--accent)] px-12 py-4.5 text-[14px] font-semibold text-white shadow-lg shadow-[var(--accent)]/25 transition-all duration-150 hover:bg-[var(--accent-hover)] hover:shadow-xl hover:shadow-[var(--accent)]/35 active:scale-[0.97]"
        >
          <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
            />
          </svg>
          Browse Folder
        </button>

        {/* Connected drives */}
        {volumes.length > 0 && (
          <div className="mt-2 w-full max-w-lg">
            <h3 className="mb-4 px-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]/50">
              Connected Drives
            </h3>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              {volumes.map((vol) => (
                <button
                  key={vol.mount_point}
                  onClick={() => onFolderSelected(vol.mount_point)}
                  className="group flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] px-5 py-5 text-left transition-all duration-150 hover:border-[var(--accent)]/30 hover:bg-[var(--bg-tertiary)]"
                >
                  {/* Drive icon */}
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors group-hover:bg-[var(--accent)]/15 group-hover:text-[var(--accent)]">
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
                    <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                      {vol.name}
                    </p>
                    <div className="mt-2.5 flex items-center gap-3">
                      <div className="h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--bg-primary)]">
                        <div
                          className="h-full rounded-full bg-[var(--accent)]/70 transition-all"
                          style={{ width: `${usedPercent(vol)}%` }}
                        />
                      </div>
                      <span className="flex-shrink-0 whitespace-nowrap text-[11px] tabular-nums text-[var(--text-secondary)]">
                        {formatBytes(vol.available_bytes)} free
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
