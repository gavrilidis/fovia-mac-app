import React from "react";
import { useI18n } from "../i18n";

export interface AiAnalysisItem {
  filePath: string;
  status: "pending" | "running" | "done" | "failed";
  tags?: string[];
  error?: string;
}

interface AiAnalysisDialogProps {
  open: boolean;
  items: AiAnalysisItem[];
  onClose: () => void;
  onCancel?: () => void;
  isRunning: boolean;
}

export const AiAnalysisDialog: React.FC<AiAnalysisDialogProps> = ({
  open,
  items,
  onClose,
  onCancel,
  isRunning,
}) => {
  const { t } = useI18n();
  const listRef = React.useRef<HTMLDivElement>(null);

  const done = items.filter((i) => i.status === "done").length;
  const failed = items.filter((i) => i.status === "failed").length;
  const total = items.length;

  // Auto-scroll to the active item.
  React.useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector('[data-status="running"]');
    if (activeEl) {
      (activeEl as HTMLElement).scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [items]);

  // ESC closes (or cancels, while running). Universal close-on-ESC matches
  // every other dialog in the app.
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isRunning && onCancel) onCancel();
        else onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, isRunning, onClose, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[600px] max-w-[92vw] overflow-hidden rounded-2xl bg-surface-alt shadow-2xl ring-1 ring-edge">
        <div className="flex items-center justify-between border-b border-edge px-5 py-3.5">
          <div>
            <h2 className="text-[14px] font-semibold text-fg">{t("ai_dialog_title")}</h2>
            <div className="mt-0.5 text-[11px] text-fg-muted">
              {t("ai_dialog_progress").replace("{done}", String(done + failed)).replace("{total}", String(total))}
              {!isRunning && total > 0 && (
                <span className="ml-2">
                  · {t("ai_dialog_done_summary").replace("{ok}", String(done)).replace("{fail}", String(failed))}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={isRunning ? onCancel : onClose}
            className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-fg-muted transition-all hover:bg-surface-elevated hover:text-fg"
          >
            {isRunning ? t("ai_dialog_cancel") : t("ai_dialog_close")}
          </button>
        </div>

        <div
          ref={listRef}
          className="max-h-[60vh] overflow-y-auto px-3 py-2"
        >
          {items.map((item) => {
            const name = item.filePath.split("/").pop() || item.filePath;
            return (
              <div
                key={item.filePath}
                data-status={item.status}
                className="flex items-start gap-3 border-b border-edge/40 px-2 py-2 last:border-b-0"
              >
                <div className="mt-0.5 flex-shrink-0">
                  {item.status === "running" && (
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  )}
                  {item.status === "done" && (
                    <svg className="h-3.5 w-3.5 text-positive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                  {item.status === "failed" && (
                    <svg className="h-3.5 w-3.5 text-negative" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  {item.status === "pending" && (
                    <div className="h-3 w-3 rounded-full bg-fg-muted/30" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-medium text-fg">{name}</div>
                  {item.status === "done" && item.tags && item.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.tags.map((tag, i) => (
                        <span
                          key={i}
                          className="inline-block rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {item.status === "done" && (!item.tags || item.tags.length === 0) && (
                    <div className="mt-0.5 text-[10px] text-fg-muted">{t("ai_dialog_no_tags")}</div>
                  )}
                  {item.status === "failed" && item.error && (
                    <div className="mt-0.5 truncate text-[10px] text-negative">{item.error}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
