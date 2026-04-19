import React, { useState, useEffect } from "react";
import { useI18n } from "../i18n";

export interface AiTaskSelection {
  tags: boolean;
  mergePersons: boolean;
  detectQuality: boolean;
}

interface AiTaskPickerProps {
  open: boolean;
  defaultSelectedCount: number;
  totalPhotos: number;
  onClose: () => void;
  onRun: (tasks: AiTaskSelection) => void;
}

export const AiTaskPicker: React.FC<AiTaskPickerProps> = ({
  open,
  defaultSelectedCount,
  totalPhotos,
  onClose,
  onRun,
}) => {
  const { t } = useI18n();
  const [tags, setTags] = useState(true);
  const [mergePersons, setMergePersons] = useState(false);
  const [detectQuality, setDetectQuality] = useState(false);

  // Universal ESC-to-close.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const photosCount = defaultSelectedCount > 0 ? defaultSelectedCount : totalPhotos;
  const anyChecked = tags || mergePersons || detectQuality;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[520px] max-w-[92vw] overflow-hidden rounded-2xl bg-surface-alt shadow-2xl ring-1 ring-edge">
        <div className="border-b border-edge px-5 py-4">
          <h2 className="text-[14px] font-semibold text-fg">{t("ai_picker_title")}</h2>
          <p className="mt-1 text-[11px] text-fg-muted">
            {t("ai_picker_subtitle").replace("{n}", String(photosCount))}
          </p>
        </div>

        <div className="flex flex-col gap-2 px-3 py-3">
          <TaskRow
            checked={tags}
            onToggle={() => setTags(!tags)}
            title={t("ai_task_tags")}
            description={t("ai_task_tags_desc")}
            iconPath="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z"
          />
          <TaskRow
            checked={mergePersons}
            onToggle={() => setMergePersons(!mergePersons)}
            title={t("ai_task_merge")}
            description={t("ai_task_merge_desc")}
            iconPath="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
          />
          <TaskRow
            checked={detectQuality}
            onToggle={() => setDetectQuality(!detectQuality)}
            title={t("ai_task_quality")}
            description={t("ai_task_quality_desc")}
            iconPath="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-edge px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-fg-muted transition-all hover:bg-surface-elevated hover:text-fg"
          >
            {t("ai_picker_cancel")}
          </button>
          <button
            disabled={!anyChecked}
            onClick={() => onRun({ tags, mergePersons, detectQuality })}
            className="rounded-lg bg-accent px-4 py-1.5 text-[12px] font-semibold text-white transition-all hover:bg-accent-hover disabled:opacity-40"
          >
            {t("ai_picker_run")}
          </button>
        </div>
      </div>
    </div>
  );
};

const TaskRow: React.FC<{
  checked: boolean;
  onToggle: () => void;
  title: string;
  description: string;
  iconPath: string;
}> = ({ checked, onToggle, title, description, iconPath }) => (
  <button
    onClick={onToggle}
    className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-all duration-150 ${
      checked
        ? "border-accent/50 bg-accent/5"
        : "border-edge bg-surface-elevated/40 hover:border-edge-hover hover:bg-surface-elevated"
    }`}
  >
    <div
      className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-[1.5px] transition-all ${
        checked ? "border-accent bg-accent" : "border-fg-muted/50"
      }`}
    >
      {checked && (
        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      )}
    </div>
    <div className="flex flex-shrink-0 items-center justify-center">
      <svg className="h-4 w-4 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
      </svg>
    </div>
    <div className="min-w-0 flex-1">
      <div className="text-[12px] font-medium text-fg">{title}</div>
      <div className="mt-0.5 text-[10px] text-fg-muted leading-relaxed">{description}</div>
    </div>
  </button>
);
