import React, { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { ExportConfig } from "../types";

interface ExportDialogProps {
  filePaths: string[];
  onClose: () => void;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({ filePaths, onClose }) => {
  const [destination, setDestination] = useState("");
  const [renameTemplate, setRenameTemplate] = useState("");
  const [maxDimension, setMaxDimension] = useState<string>("");
  const [jpegQuality, setJpegQuality] = useState("90");
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleBrowse = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === "string") {
      setDestination(selected);
    }
  }, []);

  const handleExport = useCallback(async () => {
    if (!destination) return;
    setExporting(true);
    setResult(null);
    try {
      const config: ExportConfig = {
        destination,
        rename_template: renameTemplate,
        max_dimension: maxDimension ? parseInt(maxDimension) : null,
        jpeg_quality: jpegQuality ? parseInt(jpegQuality) : null,
        watermark_text: "",
      };
      const count = await invoke<number>("export_photos", { filePaths, config });
      setResult(`Exported ${count} photo${count !== 1 ? "s" : ""} successfully`);
    } catch (e) {
      setResult(`Export failed: ${e}`);
    } finally {
      setExporting(false);
    }
  }, [destination, renameTemplate, maxDimension, jpegQuality, filePaths]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[460px] rounded-xl border border-edge bg-surface-alt p-5 shadow-2xl shadow-black/50">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-fg">
            Export {filePaths.length} Photo{filePaths.length !== 1 ? "s" : ""}
          </h2>
          <button
            onClick={onClose}
            title="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface-elevated hover:text-fg"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Destination */}
        <div className="mb-4">
          <label className="mb-1.5 block text-[11px] font-medium text-fg-muted">Destination Folder</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Choose a folder..."
              className="flex-1 rounded-lg border border-edge bg-surface px-3 py-1.5 text-[12px] text-fg placeholder:text-fg-muted/40 focus:border-accent focus:outline-none"
            />
            <button
              onClick={handleBrowse}
              className="rounded-lg border border-edge px-3 py-1.5 text-[12px] text-fg-muted transition-colors duration-150 hover:bg-surface-elevated hover:text-fg"
            >
              Browse
            </button>
          </div>
        </div>

        {/* Rename template */}
        <div className="mb-4">
          <label className="mb-1.5 block text-[11px] font-medium text-fg-muted">Rename Template</label>
          <input
            type="text"
            value={renameTemplate}
            onChange={(e) => setRenameTemplate(e.target.value)}
            placeholder="e.g., {name}_{n}.{ext}"
            className="w-full rounded-lg border border-edge bg-surface px-3 py-1.5 text-[12px] text-fg placeholder:text-fg-muted/40 focus:border-accent focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-fg-muted/50">
            Variables: {"{name}"} = original name, {"{n}"} = sequence (0001), {"{ext}"} = extension. Leave empty to keep original names.
          </p>
        </div>

        {/* Resize */}
        <div className="mb-4 flex gap-4">
          <div className="flex-1">
            <label className="mb-1.5 block text-[11px] font-medium text-fg-muted">Max Dimension (px)</label>
            <input
              type="number"
              value={maxDimension}
              onChange={(e) => setMaxDimension(e.target.value)}
              placeholder="Original size"
              className="w-full rounded-lg border border-edge bg-surface px-3 py-1.5 text-[12px] text-fg placeholder:text-fg-muted/40 focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1.5 block text-[11px] font-medium text-fg-muted">JPEG Quality</label>
            <input
              type="number"
              min="10"
              max="100"
              value={jpegQuality}
              onChange={(e) => setJpegQuality(e.target.value)}
              className="w-full rounded-lg border border-edge bg-surface px-3 py-1.5 text-[12px] text-fg placeholder:text-fg-muted/40 focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        {/* Result message */}
        {result && (
          <div className={`mb-3 rounded-lg px-3 py-2 text-[12px] ${
            result.includes("failed") ? "bg-negative/10 text-negative" : "bg-positive/10 text-positive"
          }`}>
            {result}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-edge px-4 py-2 text-[12px] font-medium text-fg-muted transition-all duration-150 hover:bg-surface-elevated hover:text-fg"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={!destination || exporting}
            className="rounded-lg bg-accent px-4 py-2 text-[12px] font-medium text-white transition-all duration-150 hover:bg-accent-hover active:scale-[0.97] disabled:opacity-50"
          >
            {exporting ? "Exporting..." : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
};
