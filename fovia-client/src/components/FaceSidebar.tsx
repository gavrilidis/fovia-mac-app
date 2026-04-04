import React from "react";
import type { FaceGroup } from "../types";

interface FaceSidebarProps {
  groups: FaceGroup[];
  selectedGroupId: string | null;
  onSelectGroup: (groupId: string) => void;
}

export const FaceSidebar: React.FC<FaceSidebarProps> = ({
  groups,
  selectedGroupId,
  onSelectGroup,
}) => {
  return (
    <div className="flex h-full w-[300px] flex-shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)]">
      {/* Header */}
      <div className="px-8 pb-6 pt-9">
        <div className="flex items-center gap-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
            Faces
          </h3>
          <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[var(--bg-tertiary)] px-2 text-[11px] tabular-nums font-medium text-[var(--text-secondary)]">
            {groups.length}
          </span>
        </div>
      </div>

      {/* Face list */}
      <div className="flex-1 overflow-y-auto px-5 pb-8">
        <div className="flex flex-col gap-2.5">
          {groups.map((group, idx) => (
            <button
              key={group.id}
              onClick={() => onSelectGroup(group.id)}
              className={`flex w-full items-center gap-5 rounded-xl px-5 py-4.5 transition-all duration-150 ${
                selectedGroupId === group.id
                  ? "bg-[var(--accent)]/12"
                  : "hover:bg-[var(--bg-tertiary)]/60"
              }`}
            >
              {/* Avatar */}
              <div
                className={`h-11 w-11 flex-shrink-0 overflow-hidden rounded-full ring-2 transition-all ${
                  selectedGroupId === group.id
                    ? "ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-secondary)]"
                    : "ring-transparent"
                } bg-[var(--bg-tertiary)]`}
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
                    <svg
                      className="h-5 w-5 text-[var(--text-secondary)]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                      />
                    </svg>
                  </div>
                )}
              </div>

              {/* Label */}
              <div className="min-w-0 text-left">
                <div className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                  Person {idx + 1}
                </div>
                <div className="mt-1.5 text-[11px] tabular-nums text-[var(--text-secondary)]">
                  {group.members.length} photo{group.members.length !== 1 ? "s" : ""}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
