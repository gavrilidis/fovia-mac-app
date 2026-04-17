import React, { useEffect, useState } from "react";
import { useI18n } from "../i18n";

interface ScanSummaryDialogProps {
  totalFiles: number;
  processedCount: number;
  skippedFiles: string[];
  onClose: () => void;
}

export const ScanSummaryDialog: React.FC<ScanSummaryDialogProps> = ({
  totalFiles,
  processedCount,
  skippedFiles,
  onClose,
}) => {
  const { t } = useI18n();
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const hasSkipped = skippedFiles.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex max-h-[80vh] w-[520px] flex-col overflow-hidden rounded-2xl border border-edge bg-surface shadow-2xl">
        <div className="border-b border-edge px-5 py-4">
          <h2 className="text-[14px] font-semibold text-fg">{t("scan_summary_title")}</h2>
        </div>
        <div className="flex-1 overflow-auto px-5 py-4">
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-edge bg-surface-elevated px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-fg-muted">
                {t("scan_summary_processed")}
              </div>
              <div className="mt-1 text-[20px] font-semibold text-positive">
                {processedCount} / {totalFiles}
              </div>
            </div>
            <div className="rounded-lg border border-edge bg-surface-elevated px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-fg-muted">
                {t("scan_summary_skipped")}
              </div>
              <div
                className={`mt-1 text-[20px] font-semibold ${hasSkipped ? "text-negative" : "text-fg-muted"}`}
              >
                {skippedFiles.length}
              </div>
            </div>
          </div>

          {hasSkipped && (
            <div>
              <button
                onClick={() => setShowList((v) => !v)}
                className="mb-2 text-[12px] font-medium text-accent hover:underline"
              >
                {showList ? t("scan_summary_hide_list") : t("scan_summary_show_list")}
              </button>
              {showList && (
                <div className="max-h-64 overflow-auto rounded-lg border border-edge bg-surface-alt p-3">
                  <ul className="space-y-1">
                    {skippedFiles.map((f) => (
                      <li
                        key={f}
                        className="truncate font-mono text-[11px] text-fg-muted"
                        title={f}
                      >
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-edge bg-surface-alt px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-medium text-white transition-all hover:bg-accent-hover active:scale-[0.97]"
          >
            {t("scan_summary_close")}
          </button>
        </div>
      </div>
    </div>
  );
};
