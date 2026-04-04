import React from "react";
import type { FaceGroup } from "../types";
import { FaceSidebar } from "./FaceSidebar";
import { PhotoGrid } from "./PhotoGrid";

interface GalleryViewProps {
  groups: FaceGroup[];
  onReset: () => void;
}

export const GalleryView: React.FC<GalleryViewProps> = ({ groups, onReset }) => {
  const [selectedGroupId, setSelectedGroupId] = React.useState<string | null>(
    groups.length > 0 ? groups[0].id : null,
  );

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || null;
  const selectedIndex = selectedGroup ? groups.indexOf(selectedGroup) : -1;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-3.5">
        <div className="flex items-center gap-4">
          <h1 className="text-base font-semibold text-[var(--text-primary)]">Fovia</h1>
          <span className="text-xs text-[var(--text-secondary)]">
            {groups.reduce((sum, g) => sum + g.members.length, 0)} faces in {groups.length} groups
          </span>
        </div>
        <button
          onClick={onReset}
          className="rounded-lg px-4 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
        >
          New Scan
        </button>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <FaceSidebar
          groups={groups}
          selectedGroupId={selectedGroupId}
          onSelectGroup={setSelectedGroupId}
        />
        <PhotoGrid
          photos={selectedGroup?.members || []}
          personLabel={selectedIndex >= 0 ? `Person ${selectedIndex + 1}` : ""}
        />
      </div>
    </div>
  );
};
