import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ExifData } from "../types";

interface ExifPanelProps {
  filePath: string | null;
  onClose: () => void;
}

export const ExifPanel: React.FC<ExifPanelProps> = ({ filePath, onClose }) => {
  const [exif, setExif] = useState<ExifData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!filePath) {
      setExif(null);
      return;
    }
    setLoading(true);
    invoke<ExifData>("read_exif_metadata", { filePath })
      .then(setExif)
      .catch(() => setExif(null))
      .finally(() => setLoading(false));
  }, [filePath]);

  if (!filePath) return null;

  const filename = filePath.split("/").pop() || "";

  const rows: [string, string][] = exif
    ? [
        ["Camera", [exif.camera_make, exif.camera_model].filter(Boolean).join(" ") || "--"],
        ["Lens", exif.lens || "--"],
        ["Focal Length", exif.focal_length || "--"],
        ["Aperture", exif.aperture ? `f/${exif.aperture}` : "--"],
        ["Shutter", exif.shutter_speed || "--"],
        ["ISO", exif.iso || "--"],
        ["Date", exif.date_taken || "--"],
        ["Dimensions", exif.width && exif.height ? `${exif.width} x ${exif.height}` : "--"],
      ]
    : [];

  return (
    <div className="flex h-full w-[260px] flex-shrink-0 flex-col border-l border-edge bg-surface-alt">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
          Info
        </h3>
        <button
          onClick={onClose}
          title="Close info panel"
          className="flex h-6 w-6 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-elevated hover:text-fg"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* Filename */}
        <p className="mb-3 truncate text-[12px] font-medium text-fg" title={filename}>
          {filename}
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-[12px] text-fg-muted">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-fg-muted/30 border-t-accent" />
            Loading EXIF...
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {rows.map(([label, value]) => (
              <div key={label}>
                <div className="text-[10px] uppercase tracking-wide text-fg-muted/50">{label}</div>
                <div className="mt-px text-[12px] text-fg">{value}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
