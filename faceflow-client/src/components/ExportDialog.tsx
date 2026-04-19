import React, { useState, useCallback, useMemo, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useI18n } from "../i18n";
import type { ExportConfig, FaceGroup, FaceGroupExport } from "../types";

interface ExportDialogProps {
  filePaths: string[];
  groups: FaceGroup[];
  onClose: () => void;
  // "modal" (default) renders an overlay + centered card for in-app use.
  // "window" renders a flat full-viewport layout for native sub-windows.
  variant?: "modal" | "window";
}

// File extensions that the `image` crate cannot decode and which are
// always copied byte-for-byte by the Rust export pipeline. For these
// inputs, max-dimension/JPEG-quality/watermark fields have no effect.
const RAW_EXTENSIONS = new Set([
  "rw2", "raf", "arw", "nef", "cr2", "cr3", "dng",
  "orf", "rwl", "srw", "pef", "x3f", "3fr", "iiq",
]);

function getExt(path: string): string {
  const idx = path.lastIndexOf(".");
  return idx >= 0 ? path.slice(idx + 1).toLowerCase() : "";
}

function classifyFiles(paths: string[]): { allRaw: boolean; anyRaw: boolean; rawCount: number } {
  let raw = 0;
  for (const p of paths) {
    if (RAW_EXTENSIONS.has(getExt(p))) raw++;
  }
  return { allRaw: paths.length > 0 && raw === paths.length, anyRaw: raw > 0, rawCount: raw };
}

// Numbering style controls how the sequence number is composed into the
// final filename pattern that the Rust side ultimately consumes.
type NumberingStyle = "none" | "prefix-num" | "num-only" | "name-num";

export const ExportDialog: React.FC<ExportDialogProps> = ({ filePaths, groups, onClose, variant = "modal" }) => {
  const { t } = useI18n();
  const isWindow = variant === "window";

  // ---- Destination ----
  const [destination, setDestination] = useState("");

  // ---- Renaming UI (composed into a single backend template) ----
  const [namePrefix, setNamePrefix] = useState("");
  const [nameSuffix, setNameSuffix] = useState("");
  const [numbering, setNumbering] = useState<NumberingStyle>("none");
  // How many leading zeros to use in the sequence number (1..6).
  // Default 4 keeps the historical 0001 format.
  const [numberingPad, setNumberingPad] = useState<number>(4);

  // ---- Re-encode options (only meaningful for non-RAW inputs) ----
  const [maxDimension, setMaxDimension] = useState<string>("");
  const [jpegQuality, setJpegQuality] = useState("90");
  const [watermarkText, setWatermarkText] = useState("");

  const [exportByFaces, setExportByFaces] = useState(false);
  // Also write Lightroom/Bridge-compatible XMP sidecar files containing
  // the rating, color label, pick status and AI keywords so other photo
  // tools can read what FaceFlow knows about each photo. Persisted in
  // localStorage so the user doesn't have to re-tick it every time.
  const [exportXmp, setExportXmp] = useState<boolean>(
    () => localStorage.getItem("faceflow-export-xmp") === "1",
  );
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  // Universal ESC-to-close.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  const fileStats = useMemo(() => classifyFiles(filePaths), [filePaths]);
  const reencodeDisabled = fileStats.allRaw;

  // Compose the rename template the backend expects. The backend supports
  // `{name}` (original stem), `{n1}`..`{n6}` (sequence with N-digit padding),
  // `{n}` (legacy 4-digit alias) and `{ext}` (lowercase extension). We assemble
  // a string from the user-facing UI controls so the backend stays unchanged.
  const composedTemplate = useMemo(() => {
    if (!namePrefix && !nameSuffix && numbering === "none") return "";
    const numToken = `{n${numberingPad}}`;
    const parts: string[] = [];
    if (namePrefix) parts.push(namePrefix);
    switch (numbering) {
      case "prefix-num":
        parts.push(numToken);
        break;
      case "num-only":
        // sequence only — drop the original stem
        parts.length = 0;
        if (namePrefix) parts.push(namePrefix);
        parts.push(numToken);
        break;
      case "name-num":
        parts.push(`{name}_${numToken}`);
        break;
      case "none":
      default:
        parts.push("{name}");
        break;
    }
    if (nameSuffix) parts.push(nameSuffix);
    return parts.join("") + ".{ext}";
  }, [namePrefix, nameSuffix, numbering, numberingPad]);

  // Live preview: build a sample filename for the first two selected files
  // so the user can confirm what the result will look like before clicking
  // Export. Defensive against empty selection.
  const previewSamples = useMemo(() => {
    if (filePaths.length === 0) return [];
    const samples = filePaths.slice(0, 2).map((p, i) => {
      const stem = p.split("/").pop()?.replace(/\.[^.]+$/, "") || "photo";
      const ext = getExt(p) || "jpg";
      const tpl = composedTemplate || `${stem}.${ext}`;
      const seq = String(i + 1).padStart(numberingPad, "0");
      let out = tpl.replace("{name}", stem).replace("{ext}", ext);
      for (let w = 1; w <= 6; w += 1) {
        out = out.replace(`{n${w}}`, String(i + 1).padStart(w, "0"));
      }
      out = out.replace("{n}", seq);
      return out;
    });
    return samples;
  }, [composedTemplate, filePaths, numberingPad]);

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
      let faceGroups: FaceGroupExport[] | null = null;
      if (exportByFaces && groups.length > 0) {
        const selectedSet = new Set(filePaths);
        faceGroups = groups
          .map((g, i) => ({
            label: `Person ${i + 1}`,
            file_paths: g.members.map((m) => m.file_path).filter((fp) => selectedSet.has(fp)),
          }))
          .filter((g) => g.file_paths.length > 0);
      }

      const config: ExportConfig = {
        destination,
        rename_template: composedTemplate,
        // Re-encode parameters are silently dropped server-side for RAW
        // files (it would fail to decode anyway), so we only send them
        // when the field is meaningful.
        max_dimension: !reencodeDisabled && maxDimension ? parseInt(maxDimension) : null,
        jpeg_quality: !reencodeDisabled && jpegQuality ? parseInt(jpegQuality) : null,
        watermark_text: reencodeDisabled ? "" : watermarkText,
        export_by_faces: exportByFaces,
        face_groups: faceGroups,
      };
      const count = await invoke<number>("export_photos", { filePaths, config });
      // Optionally drop XMP sidecars next to the exported photos so apps
      // like Lightroom / Bridge / Capture One pick up the metadata.
      let xmpCount = 0;
      if (exportXmp) {
        try {
          xmpCount = await invoke<number>("export_xmp_sidecars", {
            photoIds: filePaths,
            outputDir: destination,
          });
          localStorage.setItem("faceflow-export-xmp", "1");
        } catch (xmpErr) {
          console.error("XMP sidecar export failed", xmpErr);
        }
      } else {
        localStorage.setItem("faceflow-export-xmp", "0");
      }
      const baseMsg = t("export_done").replace("{count}", String(count));
      setResult(
        xmpCount > 0
          ? `${baseMsg} · ${t("export_xmp_done").replace("{count}", String(xmpCount))}`
          : baseMsg,
      );
    } catch (e) {
      setResult(`${t("export_failed")}: ${e}`);
    } finally {
      setExporting(false);
    }
  }, [
    destination,
    composedTemplate,
    maxDimension,
    jpegQuality,
    watermarkText,
    exportByFaces,
    exportXmp,
    filePaths,
    groups,
    reencodeDisabled,
    t,
  ]);

  return (
    <div
      className={
        isWindow
          ? "flex h-screen w-screen flex-col bg-surface text-fg"
          : "fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      }
    >
      <div
        className={
          isWindow
            ? "flex h-full w-full flex-col overflow-y-auto bg-surface px-6 pb-24 pt-6"
            : "w-[480px] max-h-[90vh] overflow-y-auto rounded-xl border border-edge bg-surface-alt p-5 shadow-2xl shadow-black/50"
        }
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-fg">
            {t("toolbar_export")} {filePaths.length} {t("photos")}
          </h2>
          <button
            onClick={onClose}
            title={t("close") || "Close"}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface-elevated hover:text-fg ${isWindow ? "hidden" : ""}`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Destination */}
        <div className="mb-5">
          <label className="mb-1.5 block text-[11px] font-medium text-fg-muted">
            {t("export_destination")}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder={t("export_choose_folder")}
              className="flex-1 rounded-lg border border-edge bg-surface px-3 py-1.5 text-[12px] text-fg placeholder:text-fg-muted/40 focus:border-accent focus:outline-none"
            />
            <button
              onClick={handleBrowse}
              className="rounded-lg border border-edge px-3 py-1.5 text-[12px] text-fg-muted transition-colors duration-150 hover:bg-surface-elevated hover:text-fg"
            >
              {t("export_browse")}
            </button>
          </div>
        </div>

        {/* ---- Renaming section: 3 fields with hints ---- */}
        <div className="mb-5 rounded-lg border border-edge/50 bg-surface/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[12px] font-semibold text-fg">{t("export_rename_section")}</h3>
            <span className="text-[10px] text-fg-muted/60">{t("export_rename_hint_short")}</span>
          </div>

          {/* Prefix */}
          <div className="mb-2.5">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-fg-muted/70">
              {t("export_rename_prefix_label")}
            </label>
            <input
              type="text"
              value={namePrefix}
              onChange={(e) => setNamePrefix(e.target.value)}
              placeholder={t("export_rename_prefix_placeholder")}
              className="w-full rounded-lg border border-edge bg-surface px-3 py-1.5 text-[12px] text-fg placeholder:text-fg-muted/40 focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-[10px] leading-snug text-fg-muted/60">
              {t("export_rename_prefix_hint")}
            </p>
          </div>

          {/* Numbering */}
          <div className="mb-2.5">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-fg-muted/70">
              {t("export_rename_numbering_label")}
            </label>
            <div className="flex gap-2">
              <select
                value={numbering}
                onChange={(e) => setNumbering(e.target.value as NumberingStyle)}
                className="flex-1 rounded-lg border border-edge bg-surface px-3 py-1.5 text-[12px] text-fg focus:border-accent focus:outline-none"
              >
                <option value="none">{t("export_rename_num_none")}</option>
                <option value="name-num">{t("export_rename_num_name_seq")}</option>
                <option value="prefix-num">{t("export_rename_num_seq")}</option>
                <option value="num-only">{t("export_rename_num_only")}</option>
              </select>
              <select
                value={numberingPad}
                onChange={(e) => setNumberingPad(Number(e.target.value))}
                disabled={numbering === "none"}
                title={t("export_rename_pad_label")}
                className="w-24 rounded-lg border border-edge bg-surface px-3 py-1.5 text-[12px] text-fg focus:border-accent focus:outline-none disabled:opacity-50"
              >
                <option value={1}>1</option>
                <option value={2}>01</option>
                <option value={3}>001</option>
                <option value={4}>0001</option>
                <option value={5}>00001</option>
                <option value={6}>000001</option>
              </select>
            </div>
            <p className="mt-1 text-[10px] leading-snug text-fg-muted/60">
              {t("export_rename_numbering_hint")}
            </p>
          </div>

          {/* Suffix */}
          <div className="mb-2">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-fg-muted/70">
              {t("export_rename_suffix_label")}
            </label>
            <input
              type="text"
              value={nameSuffix}
              onChange={(e) => setNameSuffix(e.target.value)}
              placeholder={t("export_rename_suffix_placeholder")}
              className="w-full rounded-lg border border-edge bg-surface px-3 py-1.5 text-[12px] text-fg placeholder:text-fg-muted/40 focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-[10px] leading-snug text-fg-muted/60">
              {t("export_rename_suffix_hint")}
            </p>
          </div>

          {/* Live preview */}
          {previewSamples.length > 0 && (
            <div className="mt-3 rounded-md bg-surface-elevated/50 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted/60">
                {t("export_rename_preview")}
              </div>
              <div className="mt-1 space-y-0.5 font-mono text-[11px] text-fg">
                {previewSamples.map((s, i) => (
                  <div key={i} className="truncate">
                    {s}
                  </div>
                ))}
                {filePaths.length > previewSamples.length && (
                  <div className="text-[10px] text-fg-muted/60">…</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ---- Re-encode section: gated when only RAW selected ---- */}
        <div
          className={`mb-5 rounded-lg border p-3 transition-opacity ${
            reencodeDisabled
              ? "border-amber-500/30 bg-amber-500/5 opacity-90"
              : "border-edge/50 bg-surface/40"
          }`}
        >
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[12px] font-semibold text-fg">{t("export_reencode_section")}</h3>
            {fileStats.anyRaw && !reencodeDisabled && (
              <span className="text-[10px] text-amber-500/90">
                {t("export_reencode_mixed_warning").replace(
                  "{count}",
                  String(fileStats.rawCount),
                )}
              </span>
            )}
          </div>

          {reencodeDisabled ? (
            <p className="text-[11px] leading-snug text-amber-500/90">
              {t("export_reencode_raw_disabled")}
            </p>
          ) : (
            <>
              <div className="mb-3 flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-fg-muted/70">
                    {t("export_max_dimension")}
                  </label>
                  <input
                    type="number"
                    value={maxDimension}
                    onChange={(e) => setMaxDimension(e.target.value)}
                    placeholder={t("export_max_dimension_placeholder")}
                    className="w-full rounded-lg border border-edge bg-surface px-3 py-1.5 text-[12px] text-fg placeholder:text-fg-muted/40 focus:border-accent focus:outline-none"
                  />
                  <p className="mt-1 text-[10px] leading-snug text-fg-muted/60">
                    {t("export_max_dimension_hint")}
                  </p>
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-fg-muted/70">
                    {t("export_jpeg_quality")}
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="100"
                    value={jpegQuality}
                    onChange={(e) => setJpegQuality(e.target.value)}
                    className="w-full rounded-lg border border-edge bg-surface px-3 py-1.5 text-[12px] text-fg focus:border-accent focus:outline-none"
                  />
                  <p className="mt-1 text-[10px] leading-snug text-fg-muted/60">
                    {t("export_jpeg_quality_hint")}
                  </p>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-fg-muted/70">
                  {t("export_watermark")}
                </label>
                <input
                  type="text"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  placeholder={t("export_watermark_placeholder")}
                  className="w-full rounded-lg border border-edge bg-surface px-3 py-1.5 text-[12px] text-fg placeholder:text-fg-muted/40 focus:border-accent focus:outline-none"
                />
                <p className="mt-1 text-[10px] leading-snug text-fg-muted/60">
                  {t("export_watermark_hint")}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Export by faces */}
        <div className="mb-5">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={exportByFaces}
              onChange={(e) => setExportByFaces(e.target.checked)}
              aria-label="Export by faces"
              className="h-3.5 w-3.5 rounded border-edge accent-accent"
            />
            <span className="text-[12px] text-fg">{t("export_by_faces")}</span>
          </label>
          <p className="ml-5.5 mt-1 text-[11px] text-fg-muted/60">{t("export_by_faces_desc")}</p>
        </div>

        {/* XMP sidecars — Lightroom/Bridge/Capture One compatible */}
        <div className="mb-5">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={exportXmp}
              onChange={(e) => setExportXmp(e.target.checked)}
              aria-label="Export XMP sidecars"
              className="h-3.5 w-3.5 rounded border-edge accent-accent"
            />
            <span className="text-[12px] text-fg">{t("export_xmp_label")}</span>
          </label>
          <p className="ml-5.5 mt-1 text-[11px] text-fg-muted/60">{t("export_xmp_desc")}</p>
        </div>

        {result && (
          <div
            className={`mb-3 rounded-lg px-3 py-2 text-[12px] ${
              result.toLowerCase().includes("fail")
                ? "bg-negative/10 text-negative"
                : "bg-positive/10 text-positive"
            }`}
          >
            {result}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-edge px-4 py-2 text-[12px] font-medium text-fg-muted transition-all duration-150 hover:bg-surface-elevated hover:text-fg"
          >
            {t("cancel")}
          </button>
          <button
            onClick={handleExport}
            disabled={!destination || exporting}
            className="rounded-lg bg-accent px-4 py-2 text-[12px] font-medium text-white transition-all duration-150 hover:bg-accent-hover active:scale-[0.97] disabled:opacity-50"
          >
            {exporting ? t("export_exporting") : t("toolbar_export")}
          </button>
        </div>
      </div>
    </div>
  );
};
