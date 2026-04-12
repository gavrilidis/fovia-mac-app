import React, { useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ScanProgress } from "../types";

interface ProgressViewProps {
  progress: ScanProgress;
}

export const ProgressView: React.FC<ProgressViewProps> = ({ progress }) => {
  const isDetecting = progress.phase === "detecting";
  const isCompressing = progress.phase === "compressing";

  // During compressing, show files_read progress; otherwise show processed (detection) progress
  const effectiveProgress =
    isCompressing || (progress.processed === 0 && progress.files_read > 0)
      ? progress.files_read
      : progress.processed;
  const percentage =
    progress.total_files > 0
      ? Math.round((effectiveProgress / progress.total_files) * 100)
      : 0;

  const phaseTitle = isDetecting
    ? "Detecting Faces"
    : isCompressing
      ? "Preparing Images"
      : "Extracting Previews";

  const phaseDesc = isDetecting
    ? "Analyzing images with InsightFace AI"
    : isCompressing
      ? `Resizing image ${progress.files_read} of ${progress.total_files}`
      : "Extracting embedded previews from RAW files";

  const handleWindowDrag = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input, a, select, textarea")) return;
    getCurrentWindow().startDragging();
  }, []);

  return (
    <div
      className="flex h-full w-full items-center justify-center bg-surface-alt px-12 pt-[50px] pb-10"
      onMouseDown={handleWindowDrag}
    >
      <div className="w-full max-w-[660px]">
        {/* Phase indicator + percentage */}
        <div className="mb-14 flex items-center justify-between gap-10">
          <div className="flex items-start gap-5">
            {/* Phase icon */}
            <div className="relative mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center">
              {isDetecting ? (
                <>
                  <div className="absolute inset-0 animate-ping rounded-full bg-accent/20" />
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/15">
                    <svg className="relative h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                </>
              ) : isCompressing ? (
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10">
                  <svg className="h-5 w-5 animate-pulse text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                  </svg>
                </div>
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-elevated">
                  <svg className="h-5 w-5 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                </div>
              )}
            </div>
            <div className="pt-0.5">
              <h2 className="text-[17px] font-semibold text-fg">
                {phaseTitle}
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">
                {phaseDesc}
              </p>
            </div>
          </div>
          <span className="flex-shrink-0 text-5xl font-bold tabular-nums leading-none text-accent">
            {percentage}%
          </span>
        </div>

        {/* Progress bar */}
        <div className="mb-14 h-4 w-full overflow-hidden rounded-full bg-surface-elevated">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              isDetecting
                ? "bg-gradient-to-r from-accent to-positive"
                : isCompressing
                  ? "bg-gradient-to-r from-accent to-purple-500"
                  : "bg-accent"
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-7">
          <div className="rounded-2xl bg-surface-elevated/50 px-7 py-7">
            <p className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">
              Prepared
            </p>
            <p className="mt-2.5 text-xl font-semibold tabular-nums text-fg">
              {progress.files_read}
              <span className="ml-1 text-[13px] font-normal text-fg-muted">
                / {progress.total_files}
              </span>
            </p>
          </div>
          <div className="rounded-2xl bg-surface-elevated/50 px-7 py-7">
            <p className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">
              Analyzed
            </p>
            <p className="mt-2.5 text-xl font-semibold tabular-nums text-fg">
              {progress.processed}
              <span className="ml-1 text-[13px] font-normal text-fg-muted">
                / {progress.total_files}
              </span>
            </p>
          </div>
          <div className="rounded-2xl bg-surface-elevated/50 px-7 py-7">
            <p className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">
              Faces
            </p>
            <p className="mt-2.5 text-xl font-semibold tabular-nums text-positive">
              {progress.faces_found}
            </p>
          </div>
        </div>

        {/* Current file */}
        {progress.current_file && (
          <div className="mt-8 rounded-2xl bg-surface-elevated/50 px-7 py-7">
            <p className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">
              Current file
            </p>
            <p
              className="mt-2 truncate text-[13px] text-fg"
              title={progress.current_file}
            >
              {progress.current_file}
            </p>
          </div>
        )}

        {/* Errors */}
        {progress.errors > 0 && (
          <div className="mt-8 flex items-start gap-5 rounded-2xl bg-negative/10 px-7 py-7">
            <svg
              className="mt-0.5 h-4 w-4 flex-shrink-0 text-negative"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-negative">
                {progress.errors} error{progress.errors !== 1 ? "s" : ""}
              </p>
              {progress.last_error && (
                <p className="mt-1.5 text-[12px] text-negative/70" title={progress.last_error}>
                  {progress.last_error}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
