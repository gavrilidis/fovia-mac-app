import React, { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ScanProgress } from "../types";
import { useI18n } from "../i18n";

interface ProgressViewProps {
  progress: ScanProgress;
  isResume?: boolean;
}

export const ProgressView: React.FC<ProgressViewProps> = ({ progress, isResume }) => {
  const { t } = useI18n();
  const [stopRequested, setStopRequested] = useState(false);
  const isDetecting = progress.phase === "detecting";
  const isCompressing = progress.phase === "compressing";

  const handleStop = useCallback(async () => {
    if (stopRequested) return;
    setStopRequested(true);
    try {
      await invoke("cancel_scan");
    } catch (err) {
      // The scan loop will see the next polled flag toggle on its next
      // iteration; if invoke itself failed we still want the button to
      // reflect that a stop was requested so the user does not double-tap.
      console.warn("cancel_scan failed:", err);
    }
  }, [stopRequested]);

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
              {isResume && (
                <p className="mt-1 text-[11px] italic leading-relaxed text-accent">
                  {t("scan_resuming")}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="text-5xl font-bold tabular-nums leading-none text-accent">
              {percentage}%
            </span>
            <button
              onClick={handleStop}
              disabled={stopRequested}
              className={`relative overflow-hidden flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all ${
                stopRequested
                  ? "border-negative/40 text-negative cursor-not-allowed opacity-80"
                  : "border-edge text-fg-muted hover:border-negative/40 hover:bg-negative/5 hover:text-negative"
              }`}
              title={t("scan_stop_tooltip")}
            >
              {stopRequested && (
                <span className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-negative/15 to-transparent" />
              )}
              <span className="relative flex items-center gap-1.5">
                {stopRequested ? (
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="1.5" />
                  </svg>
                )}
                {stopRequested ? t("scan_stopping") : t("scan_stop")}
              </span>
            </button>
          </div>
        </div>

        {/* Resume detail banner: explicitly show how many files were already
            done in previous runs vs what will be processed now. */}
        {isResume && progress.previously_processed > 0 && (
          <div className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-accent/20 bg-accent/5 px-5 py-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
                {t("scan_resume_done_label")}
              </div>
              <div className="mt-0.5 text-[14px] font-semibold tabular-nums text-fg">
                {progress.previously_processed}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
                {t("scan_resume_new_label")}
              </div>
              <div className="mt-0.5 text-[14px] font-semibold tabular-nums text-fg">
                {progress.total_files}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
                {t("scan_resume_total_label")}
              </div>
              <div className="mt-0.5 text-[14px] font-semibold tabular-nums text-accent">
                {progress.total_in_folder || progress.previously_processed + progress.total_files}
              </div>
            </div>
          </div>
        )}

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
              {t("progress_card_persons")}
            </p>
            <p className="mt-2.5 text-xl font-semibold tabular-nums text-positive">
              {progress.unique_persons}
              <span className="ml-1.5 text-[11px] font-normal text-fg-muted">
                ({progress.faces_found} {t("progress_card_faces_inline")})
              </span>
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
