import React, { useEffect } from "react";
import { useI18n } from "../i18n";

interface ResumeDialogProps {
  folderPath: string;
  lastProcessedIndex: number;
  totalFiles: number;
  onResume: () => void;
  onRestart: () => void;
  onCancel: () => void;
}

export const ResumeDialog: React.FC<ResumeDialogProps> = ({
  folderPath,
  lastProcessedIndex,
  totalFiles,
  onResume,
  onRestart,
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
      <div className="flex w-[440px] flex-col overflow-hidden rounded-2xl border border-edge bg-surface shadow-2xl">
        <div className="border-b border-edge px-5 py-4">
          <h2 className="text-[14px] font-semibold text-fg">{t("scan_resume_title")}</h2>
        </div>
        <div className="px-5 py-4">
          <p className="mb-3 text-[13px] leading-relaxed text-fg-muted">
            {t("scan_resume_message", {
              processed: String(lastProcessedIndex),
              total: String(totalFiles),
            })}
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
            onClick={onRestart}
            className="rounded-lg border border-edge px-3.5 py-1.5 text-[12px] font-medium text-fg transition-colors hover:bg-surface-elevated"
          >
            {t("scan_resume_restart")}
          </button>
          <button
            onClick={onResume}
            className="rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-medium text-white transition-all hover:bg-accent-hover active:scale-[0.97]"
          >
            {t("scan_resume_continue")}
          </button>
        </div>
      </div>
    </div>
  );
};
