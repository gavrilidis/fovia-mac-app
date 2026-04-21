import React from "react";
import { useI18n } from "../i18n";
import { ColorLabelPicker } from "./ColorLabelPicker";
import type { ColorLabel, FaceGroup } from "../types";

interface BottomActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onExport: () => void;
  onPick: () => void;
  onReject: () => void;
  onClearStatus: () => void;
  onRate: (rating: number) => void;
  onSetColorLabel: (label: ColorLabel) => void;
  /** Reveal every selected file in the macOS Finder, with the files
   *  pre-selected. Shown as a small folder button next to Compare. */
  onReveal?: () => void;
  onCompare?: () => void;
  // Current color label across the selection ("none" when mixed/empty).
  // Used to highlight the active color in the picker.
  currentColorLabel?: ColorLabel;
  // Move-to-person: when provided, renders a "Move to…" dropdown
  // letting the user reassign selected photos to a different person
  // group or a brand-new one.
  groups?: FaceGroup[];
  groupNames?: Map<string, string>;
  activeGroupId?: string | null;
  onMovePhotos?: (targetGroupId: string) => void;
  onCreateGroupAndMove?: () => void;
}

const Icon: React.FC<{ d: string; className?: string }> = ({ d, className }) => (
  <svg
    className={className ?? "h-3.5 w-3.5"}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={d} />
  </svg>
);

const ICONS = {
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  check: "M20 6L9 17l-5-5",
  x: "M18 6L6 18M6 6l12 12",
  download: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3",
  trash: "M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2",
  folder: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
  moveTo: "M4 12h12m0 0l-4-4m4 4l-4 4M20 4v16",
  userPlus: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6",
};

/**
 * Bottom action bar — a true *bar*, not a floating pill. Pinned to the
 * bottom of the gallery layout, full width, single height. Appears the
 * moment any photo (or person, in the future) is selected and replaces
 * the previous trio of parallel surfaces (top toolbar Row 2, persons
 * sidebar bulk panel, and floating pill). One source of truth for every
 * bulk action the user can perform.
 */
export const BottomActionBar: React.FC<BottomActionBarProps> = ({
  selectedCount,
  onClearSelection,
  onExport,
  onPick,
  onReject,
  onClearStatus,
  onRate,
  onSetColorLabel,
  onCompare,
  onReveal,
  currentColorLabel = "none",
  groups,
  groupNames,
  activeGroupId,
  onMovePhotos,
  onCreateGroupAndMove,
}) => {
  const { t } = useI18n();
  const [moveMenuOpen, setMoveMenuOpen] = React.useState(false);
  const moveMenuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!moveMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (moveMenuRef.current && !moveMenuRef.current.contains(e.target as Node)) {
        setMoveMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoveMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [moveMenuOpen]);

  if (selectedCount <= 0) return null;

  const showMoveTo = !!(onMovePhotos && onCreateGroupAndMove && groups);
  const movableGroups = showMoveTo ? (groups ?? []).filter((g) => g.id !== activeGroupId) : [];

  return (
    <div
      className="z-30 flex h-11 w-full items-center gap-2 border-t border-edge bg-surface-elevated/95 px-4 shadow-lg shadow-black/30 backdrop-blur"
      data-testid="bottom-action-bar"
      role="toolbar"
      aria-label={t("bottom_bar_selected", { count: String(selectedCount) })}
    >
      <span className="rounded-md bg-accent/20 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-accent">
        {t("bottom_bar_selected", { count: String(selectedCount) })}
      </span>

      <div className="mx-1 h-5 w-px bg-edge" />

      <div className="flex items-center gap-0.5" title={t("bottom_bar_rate")}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onRate(n)}
            className="rounded p-1 text-fg-muted transition-colors hover:bg-surface hover:text-accent"
            title={`${n}`}
          >
            <Icon d={ICONS.star} />
          </button>
        ))}
        <button
          onClick={() => onRate(0)}
          className="ml-0.5 rounded px-1 text-[10px] text-fg-muted transition-colors hover:bg-surface hover:text-fg"
          title={t("bottom_bar_clear_rating")}
        >
          0
        </button>
      </div>

      <div className="mx-1 h-5 w-px bg-edge" />

      <button
        onClick={onPick}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-fg-muted transition-colors hover:bg-positive/15 hover:text-positive"
        title={t("bottom_bar_pick")}
      >
        <Icon d={ICONS.check} />
      </button>
      <button
        onClick={onReject}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-fg-muted transition-colors hover:bg-negative/15 hover:text-negative"
        title={t("bottom_bar_reject")}
      >
        <Icon d={ICONS.x} />
      </button>
      <button
        onClick={onClearStatus}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-fg-muted transition-colors hover:bg-surface hover:text-fg"
        title={t("bottom_bar_clear_status")}
      >
        <Icon d={ICONS.trash} />
      </button>

      <div className="mx-1 h-5 w-px bg-edge" />

      {/* Color label picker — restored. Was previously available in the
          old top toolbar Row 2 / sidebar bulk panel, both of which were
          removed when we unified everything into this single bottom bar. */}
      <ColorLabelPicker current={currentColorLabel} onChange={onSetColorLabel} />

      {onCompare && selectedCount >= 2 && selectedCount <= 4 && (
        <>
          <div className="mx-1 h-5 w-px bg-edge" />
          <button
            onClick={onCompare}
            className="flex items-center gap-1 rounded-md border border-edge px-2 py-1 text-[11px] font-medium text-fg-muted transition-colors hover:bg-surface-elevated hover:text-fg"
            title={t("bottom_bar_compare", { count: String(selectedCount) })}
          >
            {t("bottom_bar_compare", { count: String(selectedCount) })}
          </button>
        </>
      )}

      {onReveal && (
        <>
          <div className="mx-1 h-5 w-px bg-edge" />
          <button
            onClick={onReveal}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-fg-muted transition-colors hover:bg-surface hover:text-fg"
            title={t("bottom_bar_reveal")}
            aria-label={t("bottom_bar_reveal")}
          >
            <Icon d={ICONS.folder} />
            <span>{t("bottom_bar_reveal")}</span>
          </button>
        </>
      )}

      {showMoveTo && (
        <>
          <div className="mx-1 h-5 w-px bg-edge" />
          <div className="relative" ref={moveMenuRef}>
            <button
              onClick={() => setMoveMenuOpen((v) => !v)}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                moveMenuOpen
                  ? "bg-accent/20 text-accent"
                  : "text-fg-muted hover:bg-surface hover:text-fg"
              }`}
              title={t("toolbar_move_to")}
              aria-haspopup="menu"
            >
              <Icon d={ICONS.moveTo} />
              <span>{t("toolbar_move_to")}</span>
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="m18 15-6-6-6 6" />
              </svg>
            </button>
            {moveMenuOpen && (
              <div
                role="menu"
                className="absolute bottom-full left-0 z-40 mb-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-edge bg-surface-elevated py-1 shadow-xl shadow-black/40"
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    setMoveMenuOpen(false);
                    onCreateGroupAndMove?.();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-accent transition-colors hover:bg-accent/10"
                >
                  <Icon d={ICONS.userPlus} className="h-3.5 w-3.5" />
                  <span className="font-medium">{t("toolbar_new_person")}</span>
                </button>
                {movableGroups.length > 0 && (
                  <div className="my-1 h-px bg-edge" />
                )}
                {movableGroups.map((g, idx) => {
                  const name = groupNames?.get(g.id) || `${t("person")} ${idx + 1}`;
                  return (
                    <button
                      key={g.id}
                      role="menuitem"
                      onClick={() => {
                        setMoveMenuOpen(false);
                        onMovePhotos?.(g.id);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-fg transition-colors hover:bg-surface"
                    >
                      <div className="h-6 w-6 flex-shrink-0 overflow-hidden rounded-full bg-surface">
                        {g.representative.preview_base64 ? (
                          <img
                            src={`data:image/jpeg;base64,${g.representative.preview_base64}`}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <span className="min-w-0 flex-1 truncate">{name}</span>
                      <span className="text-[10px] tabular-nums text-fg-muted">
                        {g.members.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={onExport}
          className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          <Icon d={ICONS.download} />
          {t("bottom_bar_export")}
        </button>
        <button
          onClick={onClearSelection}
          className="rounded-md p-1 text-fg-muted transition-colors hover:bg-surface hover:text-fg"
          title={t("bottom_bar_clear_selection")}
        >
          <Icon d={ICONS.x} />
        </button>
      </div>
    </div>
  );
};
