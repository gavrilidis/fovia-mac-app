import React from "react";
import type { ScanProgress } from "../types";

interface ProgressViewProps {
  progress: ScanProgress;
}

export const ProgressView: React.FC<ProgressViewProps> = ({ progress }) => {
  const percentage =
    progress.total_files > 0 ? Math.round((progress.processed / progress.total_files) * 100) : 0;

  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="w-full max-w-md rounded-2xl bg-[var(--bg-secondary)] p-10">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Scanning Photos</h2>
          <span className="text-2xl font-bold text-[var(--accent)]">{percentage}%</span>
        </div>

        <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all duration-300 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-[var(--text-secondary)]">
            <span>Files processed</span>
            <span className="text-[var(--text-primary)]">
              {progress.processed} / {progress.total_files}
            </span>
          </div>
          <div className="flex justify-between text-[var(--text-secondary)]">
            <span>Faces detected</span>
            <span className="text-[var(--success)]">{progress.faces_found}</span>
          </div>
          <div className="flex justify-between text-[var(--text-secondary)]">
            <span>Current file</span>
            <span
              className="max-w-[200px] truncate text-[var(--text-primary)]"
              title={progress.current_file}
            >
              {progress.current_file}
            </span>
          </div>
          {progress.errors > 0 && (
            <div className="flex justify-between text-[var(--text-secondary)]">
              <span>Errors</span>
              <span className="text-[var(--danger)]">{progress.errors}</span>
            </div>
          )}
        </div>

        {progress.last_error && (
          <div className="mt-4 rounded-lg bg-[var(--danger)]/10 px-4 py-3 text-xs text-[var(--danger)]">
            {progress.last_error}
          </div>
        )}
      </div>
    </div>
  );
};
