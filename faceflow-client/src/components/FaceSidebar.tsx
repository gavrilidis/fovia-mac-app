import React, { useState } from "react";
import type { FaceGroup, ColorLabel, PickStatus } from "../types";
import { useI18n } from "../i18n";

interface FaceSidebarProps {
  groups: FaceGroup[];
  groupNames: Map<string, string>;
  activeGroupId: string | null;
  selectedGroupIds: Set<string>;
  selectedCountPerGroup: Map<string, number>;
  noFaceCount: number;
  lowQualityCount: number;
  allPhotosCount: number;
  onSetActive: (groupId: string) => void;
  onToggleGroupSelect: (groupId: string) => void;
  onSelectAllPersons: () => void;
  onDeselectAllPersons: () => void;
  onRevealSelected: () => void;
  onDeleteSelected: () => void;
  onMergeSelected: () => void;
  onRenameGroup: (groupId: string, name: string) => void;
  // ---- Optional bulk-actions for the currently selected persons. When
  //      provided, render the matching buttons in the bulk action bar.
  onAiAnalyzeSelectedPersons?: () => void;
  onSetRatingForSelectedPersons?: (rating: number) => void;
  onSetColorLabelForSelectedPersons?: (label: ColorLabel) => void;
  onSetPickStatusForSelectedPersons?: (status: PickStatus) => void;
  onExportSelectedPersons?: () => void;
  onExportXmpSelectedPersons?: () => void;
}

export const NO_FACES_ID = "__no_faces__";
export const LOW_QUALITY_ID = "__low_quality__";
export const ALL_PHOTOS_ID = "__all_photos__";

export const FaceSidebar: React.FC<FaceSidebarProps> = ({
  groups,
  groupNames,
  activeGroupId,
  selectedGroupIds,
  selectedCountPerGroup,
  noFaceCount,
  lowQualityCount,
  allPhotosCount,
  onSetActive,
  onToggleGroupSelect,
  onSelectAllPersons,
  onDeselectAllPersons,
  onRevealSelected: _ors,
  onDeleteSelected: _ods,
  onMergeSelected: _oms,
  onRenameGroup,
  onAiAnalyzeSelectedPersons: _oasp,
  onSetRatingForSelectedPersons: _osrsp,
  onSetColorLabelForSelectedPersons: _osclsp,
  onSetPickStatusForSelectedPersons: _ospsp,
  onExportSelectedPersons: _oesp,
  onExportXmpSelectedPersons: _oexsp,
}) => {
  // Discard the bulk-action callbacks: they are now handled by
  // BottomActionBar in GalleryView. The props remain in the interface for
  // backwards-compat with the existing wiring in GalleryView.
  void _ors; void _ods; void _oms;
  void _oasp; void _osrsp; void _osclsp; void _ospsp; void _oesp; void _oexsp;
  const { t, tn } = useI18n();
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [hoverY, setHoverY] = useState(0);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const hoveredData = hoveredGroup ? groups.find((g) => g.id === hoveredGroup) : null;

  return (
    <div className="relative flex h-full w-[240px] flex-shrink-0 flex-col border-r border-edge bg-surface-alt">
      {/* Face loupe popup */}
      {hoveredData && hoveredData.representative.preview_base64 && (
        <div
          className="pointer-events-none absolute left-[248px] z-50 overflow-hidden rounded-xl border border-edge bg-surface shadow-xl"
          style={{ top: Math.max(8, hoverY - 80), width: 160, height: 160 }}
        >
          <img
            src={`data:image/jpeg;base64,${hoveredData.representative.preview_base64}`}
            alt="Face preview"
            className="h-full w-full object-cover"
          />
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <div className="flex items-center gap-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
            {t("sidebar_persons")}
          </h3>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-elevated px-1.5 text-[10px] tabular-nums font-medium text-fg-muted">
            {groups.length}
          </span>
        </div>
        <button
          onClick={selectedGroupIds.size === groups.length && groups.length > 0 ? onDeselectAllPersons : onSelectAllPersons}
          title={t("sidebar_select_all_persons")}
          className="text-[10px] font-medium text-fg-muted transition-colors hover:text-fg"
        >
          {selectedGroupIds.size === groups.length && groups.length > 0
            ? t("photogrid_deselect_all")
            : t("photogrid_select_all")}
        </button>
      </div>

      {/* Face list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <div className="flex flex-col gap-0.5">
          {/* All scanned photos — sits above the persons list so the user
              always sees the total number of unique photos in the library
              (the same photo can appear in multiple person groups). */}
          {allPhotosCount > 0 && (
            <>
              <div className="group relative flex items-center">
                <button
                  onClick={() => onSetActive(ALL_PHOTOS_ID)}
                  className={`flex w-full items-center gap-2.5 rounded-lg py-1.5 pl-3 pr-2 transition-all duration-150 ${
                    activeGroupId === ALL_PHOTOS_ID ? "bg-accent/10" : "hover:bg-surface-elevated/50"
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ring-[1.5px] transition-all ${
                      activeGroupId === ALL_PHOTOS_ID
                        ? "ring-accent ring-offset-2 ring-offset-surface-alt"
                        : "ring-transparent"
                    } bg-surface-elevated`}
                  >
                    <svg className="h-5 w-5 text-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h12A2.25 2.25 0 0 1 20.25 6v12A2.25 2.25 0 0 1 18 20.25H6A2.25 2.25 0 0 1 3.75 18V6Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 16.5 4.5-4.5 3 3 4.5-4.5 4.5 4.5" />
                      <circle cx="9" cy="9" r="1.25" fill="currentColor" />
                    </svg>
                  </div>
                  <div className="min-w-0 text-left">
                    <div className="truncate text-[12px] font-medium text-fg">
                      {t("sidebar_all_photos")}
                    </div>
                    <div className="mt-px text-[10px] tabular-nums text-fg-muted">
                      {tn("count_photos", allPhotosCount)}
                    </div>
                  </div>
                </button>
              </div>
              <div className="my-1 h-px bg-edge" />
            </>
          )}
          {groups.map((group, idx) => {
            const isActive = activeGroupId === group.id;
            const isChecked = selectedGroupIds.has(group.id);
            return (
              <div key={group.id} className="group relative flex items-center">
                {/* Checkbox */}
                <button
                  onClick={() => onToggleGroupSelect(group.id)}
                  className={`absolute left-1.5 z-10 flex h-[14px] w-[14px] flex-shrink-0 items-center justify-center rounded border transition-all duration-150 ${
                    isChecked
                      ? "border-accent bg-accent opacity-100"
                      : "border-edge bg-surface opacity-0 group-hover:opacity-100"
                  }`}
                >
                  {isChecked && (
                    <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </button>

                {/* Row */}
                <button
                  onClick={() => onSetActive(group.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg py-1.5 pl-7 pr-2 transition-all duration-150 ${
                    isActive ? "bg-accent/10" : "hover:bg-surface-elevated/50"
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className={`h-8 w-8 flex-shrink-0 overflow-hidden rounded-full ring-[1.5px] transition-all ${
                      isActive
                        ? "ring-accent ring-offset-2 ring-offset-surface-alt"
                        : "ring-transparent"
                    } bg-surface-elevated`}
                    onMouseEnter={(e) => {
                      setHoveredGroup(group.id);
                      setHoverY(e.currentTarget.getBoundingClientRect().top);
                    }}
                    onMouseLeave={() => setHoveredGroup(null)}
                  >
                    {group.representative.preview_base64 ? (
                      <img
                        src={`data:image/jpeg;base64,${group.representative.preview_base64}`}
                        alt="Face"
                        className="h-full w-full object-cover"
                        style={{
                          objectPosition: `${(group.representative.bbox_x1 / 6000) * 100}% ${(group.representative.bbox_y1 / 4000) * 100}%`,
                        }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <svg className="h-5 w-5 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Label */}
                  <div className="min-w-0 flex-1 text-left">
                    {editingGroupId === group.id ? (
                      <input
                        autoFocus
                        placeholder="Person name"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => {
                          onRenameGroup(group.id, editValue);
                          setEditingGroupId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            onRenameGroup(group.id, editValue);
                            setEditingGroupId(null);
                          } else if (e.key === "Escape") {
                            setEditingGroupId(null);
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full rounded bg-surface px-1 text-[12px] font-medium text-fg outline-none ring-1 ring-accent"
                      />
                    ) : (
                      <div
                        className="truncate text-[12px] font-medium text-fg"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingGroupId(group.id);
                          setEditValue(groupNames.get(group.id) || `${t("person")} ${idx + 1}`);
                        }}
                      >
                        {groupNames.get(group.id) || `${t("person")} ${idx + 1}`}
                      </div>
                    )}
                    <div className="mt-px flex items-center gap-1.5">
                      <span className="text-[10px] tabular-nums text-fg-muted">
                        {tn("count_photos", group.members.length)}
                      </span>
                      {(selectedCountPerGroup.get(group.id) || 0) > 0 && (
                        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent/20 px-1 text-[9px] tabular-nums font-semibold text-accent">
                          {selectedCountPerGroup.get(group.id)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </div>
            );
          })}

          {/* No Faces group — always shown so it's discoverable, even when empty */}
          {(
            <>
              <div className="my-1 h-px bg-edge" />
              <div className="group relative flex items-center">
                <button
                  onClick={() => onSetActive(NO_FACES_ID)}
                  className={`flex w-full items-center gap-2.5 rounded-lg py-1.5 pl-3 pr-2 transition-all duration-150 ${
                    activeGroupId === NO_FACES_ID ? "bg-accent/10" : "hover:bg-surface-elevated/50"
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ring-[1.5px] transition-all ${
                      activeGroupId === NO_FACES_ID
                        ? "ring-accent ring-offset-2 ring-offset-surface-alt"
                        : "ring-transparent"
                    } bg-surface-elevated`}
                  >
                    <svg className="h-5 w-5 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                    </svg>
                  </div>
                  <div className="min-w-0 text-left">
                    <div className="truncate text-[12px] font-medium text-fg-muted">
                      {t("sidebar_no_faces")}
                    </div>
                    <div className="mt-px text-[10px] tabular-nums text-fg-muted">
                      {tn("count_photos", noFaceCount)}
                    </div>
                  </div>
                </button>
              </div>
            </>
          )}

          {/* Low quality group — always shown so it's discoverable, even when empty */}
          {(
            <div className="group relative flex items-center">
              <button
                onClick={() => onSetActive(LOW_QUALITY_ID)}
                className={`flex w-full items-center gap-2.5 rounded-lg py-1.5 pl-3 pr-2 transition-all duration-150 ${
                  activeGroupId === LOW_QUALITY_ID ? "bg-accent/10" : "hover:bg-surface-elevated/50"
                }`}
              >
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ring-[1.5px] transition-all ${
                    activeGroupId === LOW_QUALITY_ID
                      ? "ring-accent ring-offset-2 ring-offset-surface-alt"
                      : "ring-transparent"
                  } bg-surface-elevated`}
                >
                  <svg className="h-5 w-5 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                </div>
                <div className="min-w-0 text-left">
                  <div className="truncate text-[12px] font-medium text-fg-muted">
                    {t("sidebar_low_quality")}
                  </div>
                  <div className="mt-px text-[10px] tabular-nums text-fg-muted">
                    {tn("count_photos", lowQualityCount)}
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bulk action UI was removed from the sidebar. All bulk actions on
          the current selection are owned by the unified BottomActionBar
          rendered by GalleryView, so users see a single, consistent
          surface instead of three parallel toolbars. */}
    </div>
  );
};
