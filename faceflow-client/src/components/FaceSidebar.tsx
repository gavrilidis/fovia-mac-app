import React, { useState } from "react";
import type { FaceGroup } from "../types";
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
  /** Map<confidentGroupId, count> for the smart-merge "Suggestions: N" badge. */
  suggestionCountByGroup?: Map<string, number>;
  /** Open the smart-merge dialog filtered to suggestions for this group. */
  onShowSuggestions?: (groupId: string) => void;
  /** Promote an uncertain group to a confident "Person N" — invoked by
   *  the "Make new person" affordance shown on uncertain rows. */
  onPromoteToPerson?: (groupId: string) => void;
  /** Create a new empty confident person (no faces). The group is added
   *  to the sidebar so the user can drag/move photos into it later. */
  onCreatePerson?: () => void;
  /** Dissolve a confident person group: remove the group from the sidebar
   *  and route its faces back into the Low Quality bin so the user can
   *  re-discover them later. Does NOT delete the underlying photos. */
  onDissolveGroup?: (groupId: string) => void;
  onSetActive: (groupId: string) => void;
  onToggleGroupSelect: (groupId: string) => void;
  onSelectAllPersons: () => void;
  onDeselectAllPersons: () => void;
  onDeleteSelected: () => void;
  onMergeSelected: () => void;
  onRenameGroup: (groupId: string, name: string) => void;
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
  suggestionCountByGroup,
  onShowSuggestions,
  onPromoteToPerson,
  onCreatePerson,
  onDissolveGroup,
  onSetActive,
  onToggleGroupSelect,
  onSelectAllPersons,
  onDeselectAllPersons,
  onDeleteSelected,
  onMergeSelected,
  onRenameGroup,
}) => {
  const { t, tn } = useI18n();
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [hoverY, setHoverY] = useState(0);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const hoveredData = hoveredGroup ? groups.find((g) => g.id === hoveredGroup) : null;

  // Per-section indexing: confident persons are numbered 1..N independently
  // from uncertain persons (1..M) so labels stay stable when uncertain
  // groups are inserted, removed, or reordered.
  const indexByGroupId = React.useMemo(() => {
    const map = new Map<string, number>();
    let confidentIdx = 0;
    let uncertainIdx = 0;
    for (const g of groups) {
      if (g.isUncertain) {
        uncertainIdx += 1;
        map.set(g.id, uncertainIdx);
      } else {
        confidentIdx += 1;
        map.set(g.id, confidentIdx);
      }
    }
    return map;
  }, [groups]);

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
        <div className="flex items-center gap-1">
          {onCreatePerson && (
            <button
              onClick={onCreatePerson}
              title={t("sidebar_create_person")}
              aria-label={t("sidebar_create_person")}
              className="flex h-5 w-5 items-center justify-center rounded text-fg-muted transition-colors hover:bg-surface-elevated hover:text-accent"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          )}
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
            const isUncertain = group.isUncertain === true;
            const personIdx = indexByGroupId.get(group.id) ?? idx + 1;
            const fallbackName = isUncertain
              ? `${t("uncertain_person")} ${personIdx}`
              : `${t("person")} ${personIdx}`;
            const displayName = groupNames.get(group.id) || fallbackName;
            // Insert a divider above the first uncertain group so the
            // confident persons section is visually separated from the
            // "Uncertain" section without forcing a structural rewrite.
            const isFirstUncertain =
              isUncertain && (idx === 0 || groups[idx - 1].isUncertain !== true);
            return (
              <React.Fragment key={group.id}>
                {isFirstUncertain && (
                  <div className="mt-2 mb-1 flex items-center gap-2 px-2">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-fg-muted/60">
                      {t("uncertain_person")}
                    </span>
                    <div className="h-px flex-1 bg-edge" />
                  </div>
                )}
                <div className={`group relative flex items-center ${isUncertain ? "opacity-70" : ""}`}>
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

                {/* Per-row Delete affordance for confident persons. Hidden until
                    hover so the sidebar stays calm; positioned over the row's
                    right edge so it never collides with the avatar/label. */}
                {!isUncertain && onDissolveGroup && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        typeof window !== "undefined" &&
                        !window.confirm(t("sidebar_dissolve_person_confirm"))
                      ) {
                        return;
                      }
                      onDissolveGroup(group.id);
                    }}
                    title={t("sidebar_dissolve_person")}
                    aria-label={t("sidebar_dissolve_person")}
                    className="absolute right-1.5 z-10 flex h-5 w-5 items-center justify-center rounded text-fg-muted opacity-0 transition-all duration-150 hover:bg-negative/15 hover:text-negative group-hover:opacity-100"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>
                )}

                {/* Row */}
                <button
                  onClick={() => onSetActive(group.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg py-1.5 pl-7 pr-2 transition-all duration-150 ${
                    isActive ? "bg-accent/10" : "hover:bg-surface-elevated/50"
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className={`relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full ring-[1.5px] transition-all ${
                      isActive
                        ? "ring-accent ring-offset-2 ring-offset-surface-alt"
                        : isUncertain
                        ? "ring-warning/60"
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
                    {isUncertain && (
                      // Small triangle warning marker overlaid on the
                      // avatar so the uncertain status is recognisable
                      // even at a glance, not only via italic text.
                      <span
                        className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-warning text-surface ring-2 ring-surface-alt"
                        title={t("uncertain_person")}
                      >
                        <svg className="h-2 w-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M10.34 3.94l-7.32 12.683c-.77 1.333.193 3 1.732 3h14.638c1.54 0 2.502-1.667 1.732-3L13.66 3.94a2 2 0 00-3.32 0z" />
                        </svg>
                      </span>
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
                        className={`truncate text-[12px] font-medium ${
                          isUncertain ? "italic text-fg-muted" : "text-fg"
                        }`}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingGroupId(group.id);
                          setEditValue(displayName);
                        }}
                      >
                        {displayName}
                      </div>
                    )}
                    <div className="mt-px flex items-center gap-1.5">
                      <span className="text-[10px] tabular-nums text-fg-muted">
                        {tn("count_faces", group.members.length)}
                      </span>
                      {(selectedCountPerGroup.get(group.id) || 0) > 0 && (
                        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent/20 px-1 text-[9px] tabular-nums font-semibold text-accent">
                          {selectedCountPerGroup.get(group.id)}
                        </span>
                      )}
                      {!isUncertain && (suggestionCountByGroup?.get(group.id) ?? 0) > 0 && onShowSuggestions && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onShowSuggestions(group.id);
                          }}
                          className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600 hover:bg-amber-500/25 dark:text-amber-400"
                          title={t("smart_merge_review")}
                        >
                          <svg
                            className="h-2.5 w-2.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                            />
                          </svg>
                          {suggestionCountByGroup?.get(group.id)}
                        </button>
                      )}
                      {isUncertain && onPromoteToPerson && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPromoteToPerson(group.id);
                          }}
                          className="inline-flex items-center gap-0.5 rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold text-accent transition-colors hover:bg-accent/25"
                          title={t("promote_to_person")}
                        >
                          <svg
                            className="h-2.5 w-2.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                            aria-hidden="true"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                          {t("promote_to_person_short")}
                        </button>
                      )}
                    </div>
                  </div>
                </button>
              </div>
              </React.Fragment>
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
                    {tn("count_faces", lowQualityCount)}
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Person-level contextual actions. Appears only when the user
          has checked persons in the sidebar. Photo-level bulk actions
          live in the unified BottomActionBar. */}
      {selectedGroupIds.size > 0 && (
        <div className="flex-shrink-0 border-t border-edge bg-surface-elevated/80 px-2 py-2 backdrop-blur">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-muted">
              {tn("count_selected_persons", selectedGroupIds.size)}
            </span>
            <button
              onClick={onDeselectAllPersons}
              className="text-[10px] font-medium text-fg-muted transition-colors hover:text-fg"
              title={t("photogrid_deselect_all")}
            >
              {t("photogrid_deselect_all")}
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onMergeSelected}
              disabled={selectedGroupIds.size < 2}
              title={t("sidebar_merge")}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent px-2 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface disabled:text-fg-muted"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                <path d="M9 12h6" />
                <path d="m12 9 3 3-3 3" />
              </svg>
              <span>{t("sidebar_merge")}</span>
            </button>
            <button
              onClick={onDeleteSelected}
              title={t("sidebar_remove_persons")}
              aria-label={t("sidebar_remove_persons")}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-edge text-fg-muted transition-colors hover:border-negative/50 hover:bg-negative/10 hover:text-negative"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
