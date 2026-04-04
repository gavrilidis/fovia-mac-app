import React, { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FaceGroup } from "../types";
import { FaceSidebar } from "./FaceSidebar";
import { PhotoGrid } from "./PhotoGrid";
import foviaLogoSvg from "../assets/fovia_logo.svg";

interface GalleryViewProps {
  groups: FaceGroup[];
  onReset: () => void;
}

export const GalleryView: React.FC<GalleryViewProps> = ({ groups, onReset }) => {
  const [selectedGroupId, setSelectedGroupId] = React.useState<string | null>(
    groups.length > 0 ? groups[0].id : null,
  );
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || null;
  const selectedIndex = selectedGroup ? groups.indexOf(selectedGroup) : -1;

  const handleSelectGroup = useCallback((groupId: string) => {
    setSelectedGroupId(groupId);
    setSelectedIds(new Set());
  }, []);

  const handleToggleSelect = useCallback((faceId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(faceId)) {
        next.delete(faceId);
      } else {
        next.add(faceId);
      }
      return next;
    });
  }, []);

  const handleRevealInFinder = useCallback(async () => {
    if (!selectedGroup || selectedIds.size === 0) return;
    const filePaths = selectedGroup.members
      .filter((m) => selectedIds.has(m.face_id))
      .map((m) => m.file_path);
    try {
      await invoke("reveal_in_finder", { filePaths });
    } catch (e) {
      console.error("reveal_in_finder failed", e);
    }
  }, [selectedGroup, selectedIds]);

  return (
    <div className="flex h-full w-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-10 py-6">
        {/* Left: branding + stats */}
        <div className="flex items-center gap-5">
          <img src={foviaLogoSvg} alt="Fovia" className="h-8 w-8" />
          <h1 className="text-[15px] font-bold tracking-tight text-[var(--text-primary)]">
            Fovia
          </h1>
          <div className="h-5 w-px bg-[var(--border)]" />
          <span className="text-[13px] tabular-nums text-[var(--text-secondary)]">
            {groups.reduce((sum, g) => sum + g.members.length, 0)} faces in {groups.length} groups
          </span>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && (
            <button
              onClick={handleRevealInFinder}
              className="flex items-center justify-center gap-3 rounded-xl bg-[var(--accent)] px-7 py-3.5 text-[13px] font-medium text-white shadow-sm transition-all duration-150 hover:bg-[var(--accent-hover)] active:scale-[0.97]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776"
                />
              </svg>
              Reveal {selectedIds.size} in Finder
            </button>
          )}
          <button
            onClick={onReset}
            className="flex items-center justify-center gap-3 rounded-xl border border-[var(--border)] px-7 py-3.5 text-[13px] font-medium text-[var(--text-secondary)] transition-all duration-150 hover:border-[var(--text-secondary)]/30 hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
              />
            </svg>
            New Scan
          </button>
        </div>
      </div>

      {/* Content area — gallery and sidebar with proper spacing */}
      <div className="flex flex-1 overflow-hidden gap-0">
        <FaceSidebar
          groups={groups}
          selectedGroupId={selectedGroupId}
          onSelectGroup={handleSelectGroup}
        />
        <PhotoGrid
          photos={selectedGroup?.members || []}
          personLabel={selectedIndex >= 0 ? `Person ${selectedIndex + 1}` : ""}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
        />
      </div>
    </div>
  );
};
