import React, { useEffect } from "react";
import { useI18n } from "../i18n";
import type { FaceEntry, FaceGroup } from "../types";

export interface MergeSuggestion {
  groupAId: string;
  groupBId: string;
  confidence: number;
  reason: string;
}

interface MergeSuggestionsDialogProps {
  open: boolean;
  suggestions: MergeSuggestion[];
  groups: FaceGroup[];
  groupNames: Map<string, string>;
  onClose: () => void;
  onAccept: (suggestion: MergeSuggestion) => void;
  onReject: (index: number) => void;
}

export const MergeSuggestionsDialog: React.FC<MergeSuggestionsDialogProps> = ({
  open,
  suggestions,
  groups,
  groupNames,
  onClose,
  onAccept,
  onReject,
}) => {
  const { t } = useI18n();

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

  const groupById = new Map(groups.map((g) => [g.id, g]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[820px] max-w-[94vw] overflow-hidden rounded-2xl bg-surface-alt shadow-2xl ring-1 ring-edge">
        <div className="flex items-center justify-between border-b border-edge px-5 py-4">
          <div>
            <h2 className="text-[14px] font-semibold text-fg">{t("merge_dialog_title")}</h2>
            <p className="mt-0.5 text-[11px] text-fg-muted">
              {suggestions.length === 0
                ? t("merge_dialog_empty")
                : t("merge_dialog_subtitle").replace("{n}", String(suggestions.length))}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-fg-muted transition-all hover:bg-surface-elevated hover:text-fg"
          >
            {t("ai_dialog_close")}
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-3 py-3">
          {suggestions.map((s, i) => {
            const ga = groupById.get(s.groupAId);
            const gb = groupById.get(s.groupBId);
            if (!ga || !gb) return null;
            const nameA = groupNames.get(s.groupAId) || `${t("sidebar_persons")} ${i * 2 + 1}`;
            const nameB = groupNames.get(s.groupBId) || `${t("sidebar_persons")} ${i * 2 + 2}`;
            return (
              <div key={`${s.groupAId}-${s.groupBId}`} className="mb-2 rounded-xl border border-edge bg-surface px-4 py-3">
                <div className="flex items-stretch gap-3">
                  <PersonCard group={ga} name={nameA} />
                  <div className="flex flex-col items-center justify-center gap-1 px-2">
                    <svg className="h-5 w-5 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                    </svg>
                    <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[10px] font-semibold tabular-nums text-fg">
                      {Math.round(s.confidence * 100)}%
                    </span>
                  </div>
                  <PersonCard group={gb} name={nameB} />
                </div>
                {s.reason && (
                  <div className="mt-2 text-[10px] italic text-fg-muted leading-relaxed">{s.reason}</div>
                )}
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    onClick={() => onReject(i)}
                    className="rounded-lg border border-edge px-3 py-1 text-[11px] font-medium text-fg-muted transition-all hover:bg-surface-elevated hover:text-fg"
                  >
                    {t("merge_dialog_skip")}
                  </button>
                  <button
                    onClick={() => onAccept(s)}
                    className="rounded-lg bg-accent px-3 py-1 text-[11px] font-semibold text-white transition-all hover:bg-accent-hover"
                  >
                    {t("merge_dialog_accept")}
                  </button>
                </div>
              </div>
            );
          })}
          {suggestions.length === 0 && (
            <div className="flex h-32 items-center justify-center text-[12px] text-fg-muted">
              {t("merge_dialog_empty_body")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const PersonCard: React.FC<{ group: FaceGroup; name: string }> = ({ group, name }) => {
  const { t } = useI18n();
  const previews = group.members.slice(0, 3);
  return (
    <div className="flex flex-1 flex-col gap-2 overflow-hidden rounded-lg bg-surface-elevated/40 p-2">
      <div className="flex items-center gap-2">
        {previews.length > 0 ? (
          <div className="flex gap-1">
            {previews.map((m, idx) => (
              <FaceThumb key={idx} entry={m} size={56} />
            ))}
          </div>
        ) : (
          <div className="h-14 w-14 rounded-lg bg-surface-elevated" />
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[12px] font-semibold text-fg">{name}</div>
        <div className="text-[10px] text-fg-muted">
          {group.members.length} {t("photos")}
        </div>
      </div>
    </div>
  );
};

const FaceThumb: React.FC<{ entry: FaceEntry; size: number }> = ({ entry, size }) => {
  if (!entry.preview_base64) {
    return (
      <div
        className="flex flex-shrink-0 items-center justify-center rounded-lg bg-surface ring-1 ring-edge"
        style={{ width: size, height: size }}
      >
        <svg className="h-5 w-5 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      </div>
    );
  }
  // `preview_base64` is the already-cropped face thumbnail produced by the
  // backend extractor — render it directly as an <img> exactly like
  // PhotoGrid does. The previous implementation tried to re-derive a
  // sensor-relative crop with a hardcoded 6000x4000 assumption, which
  // misaligned for almost every photo and left the user staring at solid
  // colored squares.
  return (
    <img
      src={`data:image/jpeg;base64,${entry.preview_base64}`}
      alt="face preview"
      loading="lazy"
      decoding="async"
      className="flex-shrink-0 rounded-lg object-cover ring-1 ring-edge"
      style={{ width: size, height: size }}
    />
  );
};
