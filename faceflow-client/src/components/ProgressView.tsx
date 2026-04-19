import React, { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ScanProgress } from "../types";
import { useI18n } from "../i18n";

interface ProgressViewProps {
  progress: ScanProgress;
  isResume?: boolean;
}

const RAW_EXTENSIONS = new Set([
  "raw", "rw2", "raf", "arw", "nef", "cr2", "cr3", "dng", "orf", "pef", "srw", "x3f",
]);

function basename(p: string): string {
  if (!p) return "";
  // Handle both POSIX and Windows separators just in case.
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx >= 0 ? p.slice(idx + 1) : p;
}

function isRaw(p: string): boolean {
  const dot = p.lastIndexOf(".");
  if (dot < 0) return false;
  return RAW_EXTENSIONS.has(p.slice(dot + 1).toLowerCase());
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

  // ── Unified progress model ────────────────────────────────────────────
  // The scan goes through TWO sequential stages:
  //   1. Preparing previews   (extract JPEG / resize)  → tracks `files_read`
  //   2. Detecting faces      (InsightFace inference)  → tracks `processed`
  //
  // Previously each stage drove its OWN 0–100 % bar, so when stage 2 began
  // the bar JUMPED back from "high files_read" to "low processed". Now we
  // map each stage to half of the total bar so the bar only ever moves
  // forward and never resets.
  const total = Math.max(1, progress.total_files);
  const prepFraction = Math.min(1, progress.files_read / total);
  const detectFraction = Math.min(1, progress.processed / total);
  // When detection has started we assume preparation is complete (true for
  // the current pipeline — preparation always finishes before detection
  // begins for any given file batch).
  const stage1Done = isDetecting ? 1 : prepFraction;
  const stage2Done = isDetecting ? detectFraction : 0;
  const percentage = Math.round((stage1Done * 50 + stage2Done * 50));
  const stepIndex = isDetecting ? 2 : 1;

  // ── Stage labels ──────────────────────────────────────────────────────
  const phaseTitle = isDetecting
    ? t("progress_stage_detect_title")
    : isCompressing
      ? t("progress_stage_compress_title")
      : t("progress_stage_preview_title");

  const phaseDesc = isDetecting
    ? t("progress_stage_detect_desc")
    : isCompressing
      ? t("progress_stage_compress_desc")
      : t("progress_stage_preview_desc");

  // Per-file action text — describes what's happening to THIS specific file
  // right now. Replaces the noisy "Resizing image N of M" line that flipped
  // back and forth and contributed to the perceived "jumpiness".
  const currentFileName = basename(progress.current_file ?? "");
  const currentAction = currentFileName
    ? isDetecting
      ? t("progress_current_action_detect", { name: currentFileName })
      : isRaw(currentFileName)
        ? t("progress_current_action_raw", { name: currentFileName })
        : t("progress_current_action_image", { name: currentFileName })
    : "";

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
              <div className="flex items-center gap-2">
                <h2 className="text-[17px] font-semibold text-fg">{phaseTitle}</h2>
                <span className="rounded-full border border-edge px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
                  {t("progress_step_label", { current: String(stepIndex), total: "2" })}
                </span>
              </div>
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

        {/* Two-segment progress bar.
            Stage 1 (preparing previews) fills the left half (0–50 %).
            Stage 2 (detecting faces)    fills the right half (50–100 %).
            A thin tick at 50 % marks the boundary between stages. */}
        <div className="mb-3 h-4 w-full overflow-hidden rounded-full bg-surface-elevated">
          <div className="flex h-full w-full">
            <div className="relative h-full w-1/2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-accent/70 to-accent transition-[width] duration-500 ease-out"
                style={{ width: `${stage1Done * 100}%` }}
              />
            </div>
            <div className="h-full w-px bg-surface-alt/60" />
            <div className="relative h-full w-1/2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-accent to-positive transition-[width] duration-500 ease-out"
                style={{ width: `${stage2Done * 100}%` }}
              />
            </div>
          </div>
        </div>
        {/* Stage legend below the bar — makes it obvious which half the
            bar is currently filling and what comes next. */}
        <div className="mb-12 flex justify-between text-[10px] font-medium uppercase tracking-wider">
          <span className={stepIndex === 1 ? "text-accent" : "text-fg-muted"}>
            1. {t("progress_stage_preview_title")}
          </span>
          <span className={stepIndex === 2 ? "text-accent" : "text-fg-muted"}>
            2. {t("progress_stage_detect_title")}
          </span>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-7">
          <div className="rounded-2xl bg-surface-elevated/50 px-7 py-7">
            <p className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">
              {t("progress_card_prepared")}
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
              {t("progress_card_analyzed")}
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

        {/* Current file — now shows a phase-aware action sentence instead
            of a bare path so the user can read what the app is doing. */}
        {currentAction && (
          <div className="mt-8 rounded-2xl bg-surface-elevated/50 px-7 py-7">
            <p className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">
              {t("progress_current_file_label")}
            </p>
            <p
              className="mt-2 truncate text-[13px] text-fg"
              title={progress.current_file ?? ""}
            >
              {currentAction}
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
                {progress.errors === 1
                  ? t("progress_errors_label", { count: String(progress.errors) })
                  : t("progress_errors_label_other", { count: String(progress.errors) })}
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
