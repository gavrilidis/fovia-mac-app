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
  // The user-visible bar reflects ONLY the *overall* completion of the
  // scan: a file counts as "done" once face detection has finished for it
  // (i.e. `processed`). The per-file substage (extracting RAW preview /
  // resizing JPG / detecting faces) is shown as a separate indicator
  // below the bar — it is informational and does not contribute to the
  // overall percentage. This matches user expectation that the big bar
  // should monotonically advance from 0 % to 100 % over the whole scan,
  // never resetting halfway when a new sub-stage begins.
  const total = Math.max(1, progress.total_files);
  const overallFraction = Math.min(1, progress.processed / total);
  const percentage = Math.round(overallFraction * 100);

  // Substage label for the *current file*. Three possibilities:
  //   1. RAW preview extraction (file is RAW → we shell out to exiftool)
  //   2. JPG resize / decode    (file is JPG/PNG/HEIC → native decode)
  //   3. Face detection         (image bytes ready, ONNX is running)
  type Substage = "raw" | "resize" | "detect";
  const currentFileName = basename(progress.current_file ?? "");
  const substage: Substage = isDetecting
    ? "detect"
    : isRaw(currentFileName)
      ? "raw"
      : "resize";

  // ── Stage labels ──────────────────────────────────────────────────────
  // Top-level title is now ALWAYS "Scanning" — the substage chip below
  // tells the user what is happening to the current file. This prevents
  // the heading from flapping rapidly between three states for every
  // file and keeps the UI calm.
  const phaseTitle = t("progress_overall_title");
  const phaseDesc = t("progress_overall_desc");

  const substageTitle =
    substage === "detect"
      ? t("progress_substage_detect_title")
      : substage === "raw"
        ? t("progress_substage_raw_title")
        : t("progress_substage_resize_title");
  const substageDesc =
    substage === "detect"
      ? t("progress_substage_detect_desc")
      : substage === "raw"
        ? t("progress_substage_raw_desc")
        : t("progress_substage_resize_desc");

  // Per-file action text — describes what's happening to THIS specific file
  // right now. Replaces the noisy "Resizing image N of M" line that flipped
  // back and forth and contributed to the perceived "jumpiness".
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
            {/* Top-level scan icon — always the same magnifier so the
                heading does not flap between three icons every file. The
                animated substage indicator below carries the per-file
                state. */}
            <div className="relative mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center">
              <div className="absolute inset-0 animate-ping rounded-full bg-accent/15" />
              <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-accent/15">
                <svg className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </div>
            </div>
            <div className="pt-0.5">
              <h2 className="text-[17px] font-semibold text-fg">{phaseTitle}</h2>
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

        {/* Single, monotonic OVERALL progress bar.
            Reflects fully-completed files (`processed / total_files`).
            The three per-file substages (RAW preview extraction / JPG
            resize / face detection) are surfaced separately in the
            "Current step" panel below so the bar itself never resets
            or jumps backwards mid-scan. */}
        <div className="mb-2 h-4 w-full overflow-hidden rounded-full bg-surface-elevated">
          <div
            className="h-full bg-gradient-to-r from-accent to-positive transition-[width] duration-500 ease-out"
            style={{ width: `${overallFraction * 100}%` }}
          />
        </div>
        <div className="mb-8 flex items-center justify-between text-[11px] tabular-nums text-fg-muted">
          <span>
            {progress.processed} / {progress.total_files} {t("progress_card_faces_inline_files")}
          </span>
        </div>

        {/* Per-file substage panel — shows what is happening to the
            CURRENT file right now (RAW preview extraction, JPG resize, or
            face detection). Distinct from the overall bar above so the
            user can see fine-grained activity without the main bar
            twitching. */}
        <div className="mb-12 flex items-center gap-4 rounded-2xl border border-edge bg-surface-elevated/40 px-5 py-4">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent/15">
            {substage === "detect" ? (
              <svg className="h-4 w-4 animate-pulse text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            ) : substage === "raw" ? (
              <svg className="h-4 w-4 animate-pulse text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            ) : (
              <svg className="h-4 w-4 animate-pulse text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              </svg>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold text-fg">{substageTitle}</span>
              <span className="rounded-full border border-edge px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-fg-muted">
                {t("progress_substage_label")}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-fg-muted" title={substageDesc}>
              {substageDesc}
            </p>
          </div>
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
