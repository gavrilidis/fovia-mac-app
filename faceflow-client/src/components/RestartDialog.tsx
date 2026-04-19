import React, { useEffect } from "react";
import { useI18n } from "../i18n";

interface RestartDialogProps {
  folderPath: string;
  scannedCount: number;
  onContinue: () => void;
  onFresh: () => void;
  onCancel: () => void;
}

/**
 * Shown when the user picks a folder that already has saved scan data
 * (faces/metadata/file hashes) but no in-progress checkpoint. Lets them
 * choose between an incremental re-scan (skips unchanged files) and a
 * complete reset before scanning from scratch.
 */
export const RestartDialog: React.FC<RestartDialogProps> = ({
  folderPath,
  scannedCount,
  onContinue,
  onFresh,
  onCancel,
}) => {
  const { t } = useI18n();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex w-[460px] flex-col overflow-hidden rounded-2xl border border-edge bg-surface shadow-2xl">
        <div className="border-b border-edge px-5 py-4">
          <h2 className="text-[14px] font-semibold text-fg">{t("restart_prompt_title")}</h2>
        </div>
        <div className="px-5 py-4">
          <p className="mb-3 text-[13px] leading-relaxed text-fg-muted">
            {t("restart_prompt_body", { count: String(scannedCount) })}
          </p>
          <p className="truncate rounded-md bg-surface-elevated px-3 py-2 text-[11px] font-mono text-fg-muted">
            {folderPath}
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-edge bg-surface-alt px-5 py-3">
          <button
            onClick={onCancel}
            className="rounded-lg px-3.5 py-1.5 text-[12px] font-medium text-fg-muted transition-colors hover:bg-surface-elevated hover:text-fg"
          >
            {t("cancel")}
          </button>
          <button
            onClick={onFresh}
            className="rounded-lg border border-negative/40 px-3.5 py-1.5 text-[12px] font-medium text-negative transition-colors hover:bg-negative/10"
          >
            {t("restart_prompt_fresh")}
          </button>
          <button
            onClick={onContinue}
            className="rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-medium text-white transition-all hover:bg-accent-hover active:scale-[0.97]"
          >
            {t("restart_prompt_continue")}
          </button>
        </div>
      </div>
    </div>
  );
};
