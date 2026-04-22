import React, { useCallback, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getAllWebviewWindows } from "@tauri-apps/api/webviewWindow";
import type { FaceEntry, FaceGroup, ColorLabel, PickStatus, EventGroup } from "../types";
import { FaceSidebar, NO_FACES_ID, LOW_QUALITY_ID, ALL_PHOTOS_ID } from "./FaceSidebar";
import { PhotoGrid } from "./PhotoGrid";
import { Toolbar } from "./Toolbar";
import { ExifPanel } from "./ExifPanel";
import { ExportDialog } from "./ExportDialog";
import { CompareView } from "./CompareView";
import { HelpDialog } from "./HelpDialog";
import { SettingsPanel } from "./SettingsPanel";
import { AiAnalysisDialog } from "./AiAnalysisDialog";
import { AiTaskPicker, type AiTaskSelection } from "./AiTaskPicker";
import { MergeSuggestionsDialog, type MergeSuggestion } from "./MergeSuggestionsDialog";
import type { MergeCandidate } from "../services/faceGrouping";
import { BottomActionBar } from "./BottomActionBar";
import { usePhotoMeta } from "../hooks/usePhotoMeta";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useI18n } from "../i18n";
import {
  isAiConfigured,
  analyzePhoto,
  analyzeQuality,
  compareTwoFaces,
  getAiProvider,
} from "../services/aiService";

interface GalleryViewProps {
  groups: FaceGroup[];
  noFaceFiles: string[];
  lowQualityFaces: FaceEntry[];
  /**
   * Smart-merge candidates produced by `computeMergeSuggestions` after each
   * (re)grouping pass. Surfaced per confident person as a small badge in
   * the sidebar; clicking the badge opens the merge dialog filtered to
   * that target.
   */
  mergeCandidates: MergeCandidate[];
  onReset: () => void;
}

export const GalleryView: React.FC<GalleryViewProps> = ({ groups, noFaceFiles, lowQualityFaces, mergeCandidates, onReset }) => {
  const { t } = useI18n();

  // Mutable groups — allow moving photos between persons
  const [mutableGroups, setMutableGroups] = React.useState<FaceGroup[]>(groups);
  // Keep local groups in sync when the parent swaps them (e.g. after a
  // force_regroup_faces call).
  React.useEffect(() => {
    setMutableGroups(groups);
  }, [groups]);
  const [groupNames, setGroupNames] = React.useState<Map<string, string>>(new Map());

  const [activeGroupId, setActiveGroupId] = React.useState<string | null>(
    groups.length > 0 ? groups[0].id : noFaceFiles.length > 0 ? NO_FACES_ID : null,
  );
  const [selectedGroupIds, setSelectedGroupIds] = React.useState<Set<string>>(new Set());
  const [selectedPhotoIds, setSelectedPhotoIds] = React.useState<Set<string>>(new Set());
  const [showExif, setShowExif] = React.useState(false);
  const [showExport, setShowExport] = React.useState(false);
  const [showCompare, setShowCompare] = React.useState(false);
  const [showHelp, setShowHelp] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  // Onboarding banner: show only the first time the user enters the
  // gallery on this machine. After they dismiss it (or trigger it from
  // the menu) we remember that in localStorage so it doesn't keep
  // re-appearing on every launch.
  const [showOnboarding, setShowOnboarding] = React.useState(
    () => localStorage.getItem("faceflow-onboarding-seen") !== "1",
  );

  // Search & AI
  const [searchQuery, setSearchQuery] = React.useState("");
  const [aiAnalyzing, setAiAnalyzing] = React.useState(false);
  const [aiConfigured, setAiConfigured] = React.useState(false);  const [aiStatus, setAiStatus] = React.useState<string | null>(null);
  const [aiDialogOpen, setAiDialogOpen] = React.useState(false);
  const [aiPickerOpen, setAiPickerOpen] = React.useState(false);
  const [aiDialogItems, setAiDialogItems] = React.useState<
    { filePath: string; status: "pending" | "running" | "done" | "failed"; tags?: string[]; error?: string }[]
  >([]);
  const [mergeSuggestions, setMergeSuggestions] = React.useState<MergeSuggestion[]>([]);
  const [mergeDialogOpen, setMergeDialogOpen] = React.useState(false);
  // When the user clicks a "Suggestions: N" badge in the sidebar, we open
  // the same dialog but populate it with the smart-merge candidates for
  // that one confident person (instead of the AI-driven cross-pair list).
  const [smartTargetGroupId, setSmartTargetGroupId] = React.useState<string | null>(null);
  const aiCancelRef = React.useRef(false);
  const [aiTags, setAiTags] = React.useState<Map<string, string[]>>(() => {
    // Restore cached AI tags from localStorage
    try {
      const cached = localStorage.getItem("faceflow-ai-tags");
      if (cached) return new Map(JSON.parse(cached));
    } catch { /* ignore */ }
    return new Map();
  });

  // Filters
  const [filterRating, setFilterRating] = React.useState(0);
  const [filterPick, setFilterPick] = React.useState<PickStatus | "all">("all");
  const [filterLabel, setFilterLabel] = React.useState<ColorLabel | "all">("all");
  const [filterQuality, setFilterQuality] = React.useState<string>("all");

  // Event grouping
  const [eventView, setEventView] = React.useState(false);
  const [eventGap, setEventGap] = React.useState(30);
  const [eventGroups, setEventGroups] = React.useState<EventGroup[]>([]);

  const activeGroup = mutableGroups.find((g) => g.id === activeGroupId) || null;
  const activeIndex = activeGroup ? mutableGroups.indexOf(activeGroup) : -1;
  const isNoFacesActive = activeGroupId === NO_FACES_ID;
  const isLowQualityActive = activeGroupId === LOW_QUALITY_ID;
  const isAllPhotosActive = activeGroupId === ALL_PHOTOS_ID;

  // Create pseudo-entries for no-face files so PhotoGrid can render them
  const noFaceEntries: FaceEntry[] = React.useMemo(
    () =>
      noFaceFiles.map((filePath, i) => ({
        face_id: `__noface_${i}`,
        file_path: filePath,
        bbox_x1: 0,
        bbox_y1: 0,
        bbox_x2: 0,
        bbox_y2: 0,
        embedding: "",
        detection_score: 0,
        preview_base64: "",
      })),
    [noFaceFiles],
  );

  // "All scanned photos" — one entry per unique file across the entire
  // library (groups + low-quality bin + no-face files). Lets the user see
  // exactly how many photos were scanned regardless of how many faces each
  // photo contains.
  const allPhotosEntries: FaceEntry[] = React.useMemo(() => {
    const seen = new Set<string>();
    const out: FaceEntry[] = [];
    const consider = (entry: FaceEntry) => {
      if (seen.has(entry.file_path)) return;
      seen.add(entry.file_path);
      out.push(entry);
    };
    for (const g of mutableGroups) {
      for (const m of g.members) consider(m);
    }
    for (const lq of lowQualityFaces) consider(lq);
    for (const nf of noFaceEntries) consider(nf);
    return out;
  }, [mutableGroups, lowQualityFaces, noFaceEntries]);

  const currentPhotos = React.useMemo<FaceEntry[]>(() => {
    if (isNoFacesActive) return noFaceEntries;
    if (isLowQualityActive) return lowQualityFaces;
    if (isAllPhotosActive) return allPhotosEntries;
    return activeGroup?.members || [];
  }, [isNoFacesActive, isLowQualityActive, isAllPhotosActive, noFaceEntries, lowQualityFaces, allPhotosEntries, activeGroup]);

  // Global lookup: face_id → FaceEntry (across all groups)
  const allFacesMap = useMemo(() => {
    const map = new Map<string, FaceEntry>();
    for (const g of mutableGroups) {
      for (const m of g.members) map.set(m.face_id, m);
    }
    for (const nf of noFaceEntries) map.set(nf.face_id, nf);
    return map;
  }, [mutableGroups, noFaceEntries]);

  // Collect all file paths for metadata loading
  const allFilePaths = useMemo(() => {
    const paths = new Set<string>();
    for (const g of mutableGroups) {
      for (const m of g.members) {
        paths.add(m.file_path);
      }
    }
    for (const fp of noFaceFiles) {
      paths.add(fp);
    }
    return Array.from(paths);
  }, [mutableGroups, noFaceFiles]);

  const { metaMap, setRating, setColorLabel, setPickStatus } = usePhotoMeta(allFilePaths);

  // Native menu actions that target the gallery view (Settings, Help,
  // Compare, EXIF, Export, etc.). App.tsx forwards `faceflow:menu`
  // CustomEvents whose `detail` is the menu item's id.
  const menuActionsRef = React.useRef<Record<string, () => void>>({});
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const fn = menuActionsRef.current[id];
      if (fn) {
        fn();
        return;
      }
      switch (id) {
        case "preferences":
          // Prefer a native sub-window (matches DropZone). Fall back to
          // the in-app modal if the window can't be created.
          invoke("open_app_window", {
            name: "settings",
            title: "Settings",
            width: 480,
            height: 820,
          }).catch(() => setShowSettings(true));
          break;
        case "show_help":
        case "show_shortcuts":
          setShowHelp(true);
          break;
        case "show_onboarding":
          setShowOnboarding(true);
          break;
        case "export":
          setShowExport(true);
          break;
        case "toggle_compare":
          setShowCompare((v) => !v);
          break;
        case "toggle_exif":
          setShowExif((v) => !v);
          break;
        case "find": {
          const el = document.getElementById("faceflow-search-input") as HTMLInputElement | null;
          el?.focus();
          break;
        }
        // Native Edit menu → Select / Deselect All Photos. Previously these
        // ids fell through to `default` and were silently ignored. They are
        // wired through `menuActionsRef.current` (see effect that registers
        // `select_all_photos` / `deselect_all`) so the closure picks up the
        // latest selection callbacks.
        // Native View menu → switch between Grid and List layouts.
        // PhotoGrid listens to the same event and toggles its internal
        // viewMode state.
        default:
          break;
      }
    };
    window.addEventListener("faceflow:menu", handler as EventListener);
    return () => window.removeEventListener("faceflow:menu", handler as EventListener);
  }, []);

  // Fetch event groups when event view is active
  useEffect(() => {
    if (!eventView) return;
    let cancelled = false;
    const run = async () => {
      try {
        const result = await invoke<EventGroup[]>("auto_group_by_event", {
          filePaths: allFilePaths,
          gapMinutes: eventGap,
        });
        if (!cancelled) setEventGroups(result);
      } catch (e) {
        console.error("auto_group_by_event failed:", e);
        if (!cancelled) setEventGroups([]);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [eventView, eventGap, allFilePaths]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const configured = await isAiConfigured(getAiProvider());
      if (!cancelled) setAiConfigured(configured);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [showSettings]);

  // Filter photos based on metadata and search query
  const filteredPhotos = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return currentPhotos.filter((photo) => {
      const meta = metaMap.get(photo.file_path);
      if (filterRating > 0) {
        if (!meta || meta.rating < filterRating) return false;
      }
      if (filterPick !== "all") {
        if (!meta || meta.pick_status !== filterPick) return false;
      }
      if (filterLabel !== "all") {
        if (!meta || meta.color_label !== filterLabel) return false;
      }
      if (filterQuality !== "all") {
        if (filterQuality === "sharp") {
          if (meta && meta.blur_score !== null && meta.blur_score < 50) return false;
        } else if (filterQuality === "eyes_open") {
          if (meta && meta.closed_eyes) return false;
        } else if (filterQuality === "no_defects") {
          if (meta && (meta.closed_eyes || (meta.blur_score !== null && meta.blur_score < 50))) return false;
        }
      }
      // Text search: match file name, AI tags, or person group name
      if (query) {
        const fileName = photo.file_path.split("/").pop()?.toLowerCase() ?? "";
        const tags = aiTags.get(photo.file_path);
        const tagMatch = tags?.some((tag) => tag.toLowerCase().includes(query)) ?? false;
        // Also match the active group name
        const groupName = activeGroupId ? (groupNames.get(activeGroupId) ?? "") : "";
        const nameMatch = groupName.toLowerCase().includes(query);
        if (!fileName.includes(query) && !tagMatch && !nameMatch) return false;
      }
      return true;
    });
  }, [currentPhotos, metaMap, filterRating, filterPick, filterLabel, filterQuality, searchQuery, aiTags, activeGroupId, groupNames]);

  // Resolve selected file paths — cross-group aware
  const selectedPhotoPaths = useMemo(() => {
    return Array.from(selectedPhotoIds)
      .map((id) => allFacesMap.get(id))
      .filter((f): f is FaceEntry => f !== undefined)
      .map((f) => f.file_path);
  }, [selectedPhotoIds, allFacesMap]);

  // Selected EXIF file path (show last selected photo)
  const exifFilePath = useMemo(() => {
    if (selectedPhotoPaths.length > 0) return selectedPhotoPaths[selectedPhotoPaths.length - 1];
    if (filteredPhotos.length > 0) return filteredPhotos[0].file_path;
    return null;
  }, [selectedPhotoPaths, filteredPhotos]);

  // Compare photos — cross-group aware
  const comparePhotos = useMemo(() => {
    return Array.from(selectedPhotoIds)
      .map((id) => allFacesMap.get(id))
      .filter((f): f is FaceEntry => f !== undefined);
  }, [selectedPhotoIds, allFacesMap]);

  // Count selected photos per group (for sidebar badges)
  const selectedCountPerGroup = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of mutableGroups) {
      let count = 0;
      for (const m of g.members) {
        if (selectedPhotoIds.has(m.face_id)) count++;
      }
      if (count > 0) counts.set(g.id, count);
    }
    return counts;
  }, [mutableGroups, selectedPhotoIds]);

  // Don't clear selection when switching person — cross-group selection
  const handleSetActive = useCallback((groupId: string) => {
    setActiveGroupId(groupId);
  }, []);

  const handleToggleGroupSelect = useCallback((groupId: string) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const handleTogglePhotoSelect = useCallback((faceId: string) => {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(faceId)) {
        next.delete(faceId);
      } else {
        next.add(faceId);
      }
      return next;
    });
  }, []);

  const handleRevealPhotos = useCallback(async () => {
    if (selectedPhotoPaths.length === 0) return;
    try {
      await invoke("reveal_in_finder", { filePaths: selectedPhotoPaths });
    } catch (e) {
      console.error("reveal_in_finder failed", e);
    }
  }, [selectedPhotoPaths]);

  const handleExportXmp = useCallback(async () => {
    if (selectedPhotoPaths.length === 0) return;
    try {
      await invoke<number>("export_xmp_sidecars", { photoIds: selectedPhotoPaths, outputDir: "" });
      setAiStatus(t("xmp_export_done").replace("{count}", String(selectedPhotoPaths.length)));
      setTimeout(() => setAiStatus(null), 3000);
    } catch (err) {
      setAiStatus(`${t("xmp_export_failed")}: ${err instanceof Error ? err.message : String(err)}`);
      setTimeout(() => setAiStatus(null), 5000);
    }
  }, [selectedPhotoPaths, t]);

  // M7: Folder-level JSON summary export. Uses all currently visible
  // photos (post-filter) when nothing is explicitly selected.
  const handleExportFolderSummary = useCallback(async () => {
    const targets = selectedPhotoPaths.length > 0
      ? selectedPhotoPaths
      : filteredPhotos.map((p) => p.file_path);
    if (targets.length === 0) {
      setAiStatus(t("folder_summary_no_photos"));
      setTimeout(() => setAiStatus(null), 3000);
      return;
    }
    try {
      const out = await invoke<string>("export_folder_summary", {
        filePaths: targets,
        outputDir: "",
      });
      setAiStatus(`${t("folder_summary_done")}: ${out}`);
      setTimeout(() => setAiStatus(null), 5000);
    } catch (err) {
      setAiStatus(
        `${t("folder_summary_failed")}: ${err instanceof Error ? err.message : String(err)}`,
      );
      setTimeout(() => setAiStatus(null), 5000);
    }
  }, [selectedPhotoPaths, filteredPhotos, t]);

  // Wire dynamic menu actions that depend on callbacks defined later
  useEffect(() => {
    menuActionsRef.current = {
      ...menuActionsRef.current,
      export_xmp: handleExportXmp,
      export_folder_summary: handleExportFolderSummary,
    };
  }, [handleExportXmp, handleExportFolderSummary]);

  const handleSelectAllPersons = useCallback(() => {
    setSelectedGroupIds(new Set(mutableGroups.map((g) => g.id)));
  }, [mutableGroups]);

  const handleDeselectAllPersons = useCallback(() => {
    setSelectedGroupIds(new Set());
  }, []);

  // Remove selected person groups (from current view only — does not touch DB).
  const handleDeletePersons = useCallback(() => {
    if (selectedGroupIds.size === 0) return;
    setMutableGroups((prev) => prev.filter((g) => !selectedGroupIds.has(g.id)));
    setGroupNames((prev) => {
      const next = new Map(prev);
      for (const id of selectedGroupIds) next.delete(id);
      return next;
    });
    if (activeGroupId && selectedGroupIds.has(activeGroupId)) setActiveGroupId(null);
    setSelectedGroupIds(new Set());
  }, [selectedGroupIds, activeGroupId]);

  // Merge selected person groups into the first one.
  const handleMergePersons = useCallback(() => {
    if (selectedGroupIds.size < 2) return;
    setMutableGroups((prev) => {
      const selected = prev.filter((g) => selectedGroupIds.has(g.id));
      if (selected.length < 2) return prev;
      const target = selected[0];
      const rest = selected.slice(1);
      const mergedMembers = [...target.members, ...rest.flatMap((g) => g.members)];
      return prev
        .filter((g) => !rest.find((r) => r.id === g.id))
        .map((g) =>
          g.id === target.id
            ? { ...g, members: mergedMembers, representative: mergedMembers[0] }
            : g,
        );
    });
    setSelectedGroupIds(new Set());
  }, [selectedGroupIds]);

  // Resolve every distinct file path that belongs to *any* of the selected
  // person groups. Used by the unified BottomActionBar so one click can
  // export/rate/reveal every photo of, say, three people at once.
  const selectedPersonsPhotoPaths = useMemo<string[]>(() => {
    if (selectedGroupIds.size === 0) return [];
    const set = new Set<string>();
    for (const g of mutableGroups) {
      if (!selectedGroupIds.has(g.id)) continue;
      for (const m of g.members) set.add(m.file_path);
    }
    return Array.from(set);
  }, [mutableGroups, selectedGroupIds]);


  const handleSelectAll = useCallback(() => {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      for (const p of filteredPhotos) next.add(p.face_id);
      return next;
    });
  }, [filteredPhotos]);

  const handleDeselectAll = useCallback(() => {
    setSelectedPhotoIds(new Set());
  }, []);

  // Bridge native Edit menu → Select / Deselect All Photos. Wired through
  // `menuActionsRef` because the callbacks are defined here, *after* the
  // top-level menu listener, and we need it to pick up the latest closures
  // (i.e. always see the current `filteredPhotos`).
  useEffect(() => {
    menuActionsRef.current = {
      ...menuActionsRef.current,
      select_all_photos: () => handleSelectAll(),
      deselect_all: () => handleDeselectAll(),
    };
  }, [handleSelectAll, handleDeselectAll]);

  // AI bulk for selected persons: temporarily promote the resolved paths
  // to "selected photos" and reuse the existing AI picker pipeline.
  const handleAiAnalyzeForSelectedPersons = useCallback(async () => {
    if (selectedPersonsPhotoPaths.length === 0) return;
    if (!(await isAiConfigured(getAiProvider()))) {
      setAiStatus("API key not configured — open Settings to add one");
      setTimeout(() => setAiStatus(null), 4000);
      return;
    }
    // Map person selections back to face_ids so the existing runAiTasks
    // flow picks them up via its `selectedPhotoIds` branch.
    const ids = new Set<string>();
    for (const g of mutableGroups) {
      if (!selectedGroupIds.has(g.id)) continue;
      for (const m of g.members) ids.add(m.face_id);
    }
    setSelectedPhotoIds(ids);
    setAiPickerOpen(true);
  }, [mutableGroups, selectedGroupIds, selectedPersonsPhotoPaths]);

  // AI flow: open task picker first
  const handleAiAnalyze = useCallback(async () => {
    if (!(await isAiConfigured(getAiProvider()))) {
      setAiStatus("API key not configured — open Settings to add one");
      setTimeout(() => setAiStatus(null), 4000);
      return;
    }
    setAiPickerOpen(true);
  }, []);

  // Run AI tasks chosen by user via the picker
  const runAiTasks = useCallback(
    async (tasks: AiTaskSelection) => {
      setAiPickerOpen(false);

      const entriesToAnalyze =
        selectedPhotoIds.size > 0
          ? Array.from(selectedPhotoIds)
              .map((id) => allFacesMap.get(id))
              .filter((f): f is FaceEntry => f !== undefined)
          : currentPhotos;

      // Per-photo tasks: tags + quality detection
      if ((tasks.tags || tasks.detectQuality) && entriesToAnalyze.length > 0) {
        aiCancelRef.current = false;
        setAiAnalyzing(true);
        setAiStatus(null);
        setAiDialogItems(
          entriesToAnalyze.map((e) => ({ filePath: e.file_path, status: "pending" as const })),
        );
        setAiDialogOpen(true);

        let successCount = 0;
        let failCount = 0;

        try {
          for (let i = 0; i < entriesToAnalyze.length; i++) {
            if (aiCancelRef.current) break;
            const entry = entriesToAnalyze[i];
            setAiDialogItems((prev) =>
              prev.map((it, idx) => (idx === i ? { ...it, status: "running" } : it)),
            );
            try {
              const base64 = await invoke<string>("read_photo_base64", {
                filePath: entry.file_path,
              });

              let tagList: string[] = [];
              if (tasks.tags) {
                const result = await analyzePhoto(base64);
                tagList = result.tags;
                setAiTags((prev) => {
                  const next = new Map(prev);
                  next.set(entry.file_path, result.tags);
                  try {
                    localStorage.setItem("faceflow-ai-tags", JSON.stringify([...next]));
                  } catch {
                    /* quota exceeded, ignore */
                  }
                  return next;
                });
              }

              if (tasks.detectQuality) {
                try {
                  const q = await analyzeQuality(base64);
                  const flags: string[] = [];
                  if (q.is_blurry) flags.push(t("ai_quality_blurry"));
                  if (q.closed_eyes) flags.push(t("ai_quality_closed_eyes"));
                  if (q.out_of_focus) flags.push(t("ai_quality_out_of_focus"));
                  if (q.bad_composition) flags.push(t("ai_quality_bad_composition"));
                  if (flags.length > 0) {
                    setAiTags((prev) => {
                      const next = new Map(prev);
                      const existing = next.get(entry.file_path) ?? [];
                      const merged = Array.from(new Set([...existing, ...flags]));
                      next.set(entry.file_path, merged);
                      try {
                        localStorage.setItem("faceflow-ai-tags", JSON.stringify([...next]));
                      } catch {
                        /* ignore */
                      }
                      return next;
                    });
                    tagList = Array.from(new Set([...tagList, ...flags]));
                  }
                } catch (qErr) {
                  console.warn("AI quality check failed for", entry.file_path, qErr);
                }
              }

              successCount++;
              setAiDialogItems((prev) =>
                prev.map((it, idx) =>
                  idx === i ? { ...it, status: "done", tags: tagList } : it,
                ),
              );
            } catch (err) {
              failCount++;
              const msg = err instanceof Error ? err.message : String(err);
              setAiDialogItems((prev) =>
                prev.map((it, idx) =>
                  idx === i ? { ...it, status: "failed", error: msg } : it,
                ),
              );
              console.error("AI analyze failed for", entry.file_path, err);
            }
          }
        } finally {
          setAiAnalyzing(false);
          if (successCount > 0 || failCount > 0) {
            setAiStatus(`AI: ${successCount} done, ${failCount} failed`);
            setTimeout(() => setAiStatus(null), 5000);
          }
        }
      }

      // Person-merge suggestion task: pairwise compare small persons
      if (tasks.mergePersons) {
        await runMergeSuggestions();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedPhotoIds, allFacesMap, currentPhotos, t],
  );

  // Compare small person clusters pairwise via AI to discover possible merges.
  const runMergeSuggestions = useCallback(async () => {
    // Take small clusters (≤ 4 photos) — these are the typical false splits.
    const candidates = mutableGroups.filter((g) => g.members.length > 0 && g.members.length <= 4);
    if (candidates.length < 2) {
      setAiStatus("Not enough small persons to compare");
      setTimeout(() => setAiStatus(null), 4000);
      return;
    }

    // Limit to top 30 candidates by member count and cap pairs at 60 to bound cost.
    const limited = candidates.slice(0, 30);
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < limited.length; i++) {
      for (let j = i + 1; j < limited.length; j++) {
        pairs.push([i, j]);
        if (pairs.length >= 60) break;
      }
      if (pairs.length >= 60) break;
    }

    aiCancelRef.current = false;
    setAiAnalyzing(true);
    setAiStatus(null);
    // Use AiAnalysisDialog to surface progress; each "item" is a pair.
    setAiDialogItems(
      pairs.map(([i, j]) => ({
        filePath: `${limited[i].representative.file_path} ↔ ${limited[j].representative.file_path}`,
        status: "pending" as const,
      })),
    );
    setAiDialogOpen(true);

    const found: MergeSuggestion[] = [];
    try {
      for (let p = 0; p < pairs.length; p++) {
        if (aiCancelRef.current) break;
        const [ai, bi] = pairs[p];
        const a = limited[ai];
        const b = limited[bi];
        setAiDialogItems((prev) =>
          prev.map((it, idx) => (idx === p ? { ...it, status: "running" } : it)),
        );
        try {
          const [base64A, base64B] = await Promise.all([
            invoke<string>("read_photo_base64", { filePath: a.representative.file_path }),
            invoke<string>("read_photo_base64", { filePath: b.representative.file_path }),
          ]);
          const decision = await compareTwoFaces(base64A, base64B);
          const isMatch = decision.same_person && decision.confidence >= 0.6;
          if (isMatch) {
            found.push({
              groupAId: a.id,
              groupBId: b.id,
              confidence: decision.confidence,
              reason: decision.reason,
            });
          }
          setAiDialogItems((prev) =>
            prev.map((it, idx) =>
              idx === p
                ? {
                    ...it,
                    status: "done",
                    tags: isMatch
                      ? [`match ${(decision.confidence * 100).toFixed(0)}%`]
                      : ["different"],
                  }
                : it,
            ),
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setAiDialogItems((prev) =>
            prev.map((it, idx) =>
              idx === p ? { ...it, status: "failed", error: msg } : it,
            ),
          );
        }
      }
    } finally {
      setAiAnalyzing(false);
      setMergeSuggestions(found);
      if (found.length > 0) {
        setMergeDialogOpen(true);
      } else {
        setAiStatus("No merge suggestions found");
        setTimeout(() => setAiStatus(null), 4000);
      }
    }
  }, [mutableGroups]);

  const handleAcceptMergeSuggestion = useCallback((s: MergeSuggestion) => {
    setMutableGroups((prev) => {
      const a = prev.find((g) => g.id === s.groupAId);
      const b = prev.find((g) => g.id === s.groupBId);
      if (!a || !b) return prev;
      const mergedMembers = [...a.members, ...b.members];
      return prev
        .filter((g) => g.id !== b.id)
        .map((g) =>
          g.id === a.id ? { ...g, members: mergedMembers, representative: mergedMembers[0] } : g,
        );
    });
    setMergeSuggestions((prev) =>
      prev.filter((x) => x.groupAId !== s.groupAId || x.groupBId !== s.groupBId),
    );
  }, []);

  const handleRejectMergeSuggestion = useCallback((index: number) => {
    setMergeSuggestions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ---------- Smart Merge (centroid-based, local) ---------------------------
  // User-rejected smart-merge candidates — keyed by uncertain group id so a
  // dismissed suggestion does not pop back up after a re-render.
  const [rejectedSmartIds, setRejectedSmartIds] = React.useState<Set<string>>(new Set());

  // All currently visible smart-merge candidates that target a confident
  // group still present in the active gallery (and were not dismissed).
  const visibleSmartCandidates = React.useMemo(() => {
    const validIds = new Set(mutableGroups.map((g) => g.id));
    return mergeCandidates.filter(
      (c) =>
        validIds.has(c.confidentGroupId) &&
        validIds.has(c.uncertainGroupId) &&
        !rejectedSmartIds.has(c.uncertainGroupId),
    );
  }, [mergeCandidates, mutableGroups, rejectedSmartIds]);

  // Map<confidentGroupId, count> — drives the "Suggestions: N" badge in the
  // sidebar so the user sees, per person, how many uncertain look-alikes
  // are waiting for review.
  const smartSuggestionCountByGroup = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const c of visibleSmartCandidates) {
      map.set(c.confidentGroupId, (map.get(c.confidentGroupId) ?? 0) + 1);
    }
    return map;
  }, [visibleSmartCandidates]);

  // Suggestions to feed into the dialog while in smart-merge mode (filtered
  // to the clicked confident person), converted to the `MergeSuggestion`
  // shape the existing dialog already understands.
  const smartSuggestionsForDialog = React.useMemo<MergeSuggestion[]>(() => {
    if (!smartTargetGroupId) return [];
    return visibleSmartCandidates
      .filter((c) => c.confidentGroupId === smartTargetGroupId)
      .map((c) => ({
        groupAId: c.confidentGroupId,
        groupBId: c.uncertainGroupId,
        confidence: c.similarity,
        reason: c.reason,
      }));
  }, [visibleSmartCandidates, smartTargetGroupId]);

  const handleShowSuggestionsForGroup = useCallback((groupId: string) => {
    setSmartTargetGroupId(groupId);
    setMergeDialogOpen(true);
  }, []);

  const handleAcceptSmartSuggestion = useCallback((s: MergeSuggestion) => {
    // Same merge mechanics as the AI flow, but mark the uncertain side as
    // confident after the merge so it stops appearing under "Uncertain".
    setMutableGroups((prev) => {
      const a = prev.find((g) => g.id === s.groupAId);
      const b = prev.find((g) => g.id === s.groupBId);
      if (!a || !b) return prev;
      const mergedMembers = [...a.members, ...b.members];
      return prev
        .filter((g) => g.id !== b.id)
        .map((g) =>
          g.id === a.id
            ? { ...g, members: mergedMembers, representative: mergedMembers[0], isUncertain: false }
            : g,
        );
    });
    setRejectedSmartIds((prev) => {
      const next = new Set(prev);
      next.add(s.groupBId);
      return next;
    });
  }, []);

  const handleRejectSmartSuggestion = useCallback(
    (index: number) => {
      const s = smartSuggestionsForDialog[index];
      if (!s) return;
      setRejectedSmartIds((prev) => {
        const next = new Set(prev);
        next.add(s.groupBId);
        return next;
      });
    },
    [smartSuggestionsForDialog],
  );

  const handleCloseMergeDialog = useCallback(() => {
    setMergeDialogOpen(false);
    setSmartTargetGroupId(null);
  }, []);

  // Move selected photos to a target person group
  const handleMovePhotos = useCallback((targetGroupId: string) => {
    if (selectedPhotoIds.size === 0) return;

    setMutableGroups((prev) => {
      const facesToMove: FaceEntry[] = [];
      for (const g of prev) {
        for (const m of g.members) {
          if (selectedPhotoIds.has(m.face_id)) facesToMove.push(m);
        }
      }
      if (facesToMove.length === 0) return prev;

      const result = prev.map((g) => {
        const filtered = g.members.filter((m) => !selectedPhotoIds.has(m.face_id));
        if (g.id === targetGroupId) {
          return { ...g, members: [...filtered, ...facesToMove] };
        }
        return { ...g, members: filtered };
      });

      // Update representative for target group
      return result
        .map((g) => ({
          ...g,
          representative: g.members[0] || g.representative,
        }))
        .filter((g) => g.members.length > 0);
    });

    setSelectedPhotoIds(new Set());
  }, [selectedPhotoIds]);

  // Create a new person group and move selected photos into it
  const handleCreateGroupAndMove = useCallback(() => {
    if (selectedPhotoIds.size === 0) return;

    const newId = `__custom_${Date.now()}`;
    setMutableGroups((prev) => {
      const facesToMove: FaceEntry[] = [];
      for (const g of prev) {
        for (const m of g.members) {
          if (selectedPhotoIds.has(m.face_id)) facesToMove.push(m);
        }
      }
      if (facesToMove.length === 0) return prev;

      const cleaned = prev
        .map((g) => ({
          ...g,
          members: g.members.filter((m) => !selectedPhotoIds.has(m.face_id)),
        }))
        .map((g) => ({
          ...g,
          representative: g.members[0] || g.representative,
        }))
        .filter((g) => g.members.length > 0);

      const newGroup: FaceGroup = {
        id: newId,
        representative: facesToMove[0],
        members: facesToMove,
      };

      return [...cleaned, newGroup];
    });

    setGroupNames((prev) => {
      const next = new Map(prev);
      next.set(newId, `Person (new)`);
      return next;
    });
    setActiveGroupId(newId);
    setSelectedPhotoIds(new Set());
  }, [selectedPhotoIds]);

  // Rename a group
  const handleRenameGroup = useCallback((groupId: string, name: string) => {
    setGroupNames((prev) => {
      const next = new Map(prev);
      if (name.trim()) {
        next.set(groupId, name.trim());
      } else {
        next.delete(groupId);
      }
      return next;
    });
  }, []);

  // Get display name for a group
  const getGroupName = useCallback((groupId: string, index: number) => {
    return groupNames.get(groupId) || `Person ${index + 1}`;
  }, [groupNames]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    enabled: !showExport && !showCompare,
    onRating: (rating) => {
      if (selectedPhotoPaths.length > 0) {
        setRating(selectedPhotoPaths, rating);
      }
    },
    onPickStatus: (status) => {
      if (selectedPhotoPaths.length > 0) {
        setPickStatus(selectedPhotoPaths, status);
      }
    },
    onColorLabel: (label) => {
      if (selectedPhotoPaths.length > 0) {
        setColorLabel(selectedPhotoPaths, label);
      }
    },
    onSelectAll: handleSelectAll,
    onDeselectAll: handleDeselectAll,
    onDelete: () => {
      if (selectedPhotoPaths.length > 0) {
        setPickStatus(selectedPhotoPaths, "reject");
      }
    },
  });

  return (
    <div className="flex h-full w-full flex-col">
      {/* Toolbar */}
      <Toolbar
        groupCount={mutableGroups.length}
        selectedPhotoCount={selectedPhotoIds.size}
        selectedPhotoPaths={selectedPhotoPaths}
        metaMap={metaMap}
        onSetRating={setRating}
        onSetColorLabel={setColorLabel}
        onSetPickStatus={setPickStatus}
        onRevealPhotos={handleRevealPhotos}
        onExport={() => setShowExport(true)}
        onExportXmp={handleExportXmp}
        onCompare={() => setShowCompare(true)}
        onToggleExif={() => setShowExif((v) => !v)}
        onReset={onReset}
        showExif={showExif}
        filterRating={filterRating}
        onFilterRatingChange={setFilterRating}
        filterPick={filterPick}
        onFilterPickChange={setFilterPick}
        filterLabel={filterLabel}
        onFilterLabelChange={setFilterLabel}
        filterQuality={filterQuality}
        onFilterQualityChange={setFilterQuality}
        eventView={eventView}
        onToggleEventView={() => setEventView((v) => !v)}
        eventGap={eventGap}
        onEventGapChange={setEventGap}
        eventCount={eventGroups.length}
        groups={mutableGroups}
        groupNames={groupNames}
        activeGroupId={activeGroupId}
        onMovePhotos={handleMovePhotos}
        onCreateGroupAndMove={handleCreateGroupAndMove}
        onHelp={() => setShowHelp(true)}
        onSettings={() => {
          invoke("open_app_window", {
            name: "settings",
            title: "Settings",
            width: 480,
            height: 820,
          }).catch(() => setShowSettings(true));
        }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onAiAnalyze={handleAiAnalyze}
        aiAnalyzing={aiAnalyzing}
        aiConfigured={aiConfigured}
      />

      {/* Content area */}
      {showOnboarding && (
        <div className="flex items-center gap-3 border-b border-accent/15 bg-accent/5 px-5 py-2.5">
          <svg className="h-4 w-4 flex-shrink-0 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
          </svg>
          <p className="flex-1 text-[11px] leading-relaxed text-fg-muted">
            <span className="font-semibold text-fg">{t("gallery_onboarding").split(".")[0]}.</span>{" "}
            {t("gallery_onboarding").split(".").slice(1).join(".")}{" "}
            <span className="text-fg-muted/70">{t("gallery_onboarding_help")}</span>
          </p>
          <button
            onClick={() => {
              setShowOnboarding(false);
              localStorage.setItem("faceflow-onboarding-seen", "1");
            }}
            title="Dismiss hint"
            className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-fg-muted/60 transition-colors hover:bg-surface-elevated hover:text-fg"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        {!eventView && (
          <FaceSidebar
            groups={mutableGroups}
            groupNames={groupNames}
            activeGroupId={activeGroupId}
            selectedGroupIds={selectedGroupIds}
            selectedCountPerGroup={selectedCountPerGroup}
            noFaceCount={noFaceFiles.length}
            lowQualityCount={lowQualityFaces.length}
            allPhotosCount={allPhotosEntries.length}
            suggestionCountByGroup={smartSuggestionCountByGroup}
            onShowSuggestions={handleShowSuggestionsForGroup}
            onSetActive={handleSetActive}
            onToggleGroupSelect={handleToggleGroupSelect}
            onSelectAllPersons={handleSelectAllPersons}
            onDeselectAllPersons={handleDeselectAllPersons}
            onDeleteSelected={handleDeletePersons}
            onMergeSelected={handleMergePersons}
            onRenameGroup={handleRenameGroup}
          />
        )}
        {eventView ? (
          <div className="flex-1 overflow-y-auto">
            {eventGroups.length === 0 ? (
              <div className="flex h-full items-center justify-center text-[13px] text-fg-muted">
                No events found. Try adjusting the time gap.
              </div>
            ) : (
              eventGroups.map((event) => {
                // Build FaceEntry-like items for event photos
                const eventPhotos: FaceEntry[] = event.file_paths.map((fp, i) => ({
                  face_id: `__event_${event.id}_${i}`,
                  file_path: fp,
                  bbox_x1: 0, bbox_y1: 0, bbox_x2: 0, bbox_y2: 0,
                  embedding: "",
                  detection_score: 0,
                  preview_base64: "",
                }));
                return (
                  <div key={event.id}>
                    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-edge/50 bg-surface-alt/90 px-4 py-2 backdrop-blur-sm">
                      <svg className="h-3.5 w-3.5 flex-shrink-0 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                      </svg>
                      <span className="text-[12px] font-semibold text-fg">{event.name}</span>
                      <span className="text-[11px] text-fg-muted">{event.start_time}</span>
                      <span className="text-[10px] text-fg-muted/50">-</span>
                      <span className="text-[11px] text-fg-muted">{event.end_time}</span>
                      <span className="ml-auto text-[10px] tabular-nums text-fg-muted">
                        {event.file_paths.length} photo{event.file_paths.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <PhotoGrid
                      photos={eventPhotos}
                      personLabel=""
                      selectedIds={selectedPhotoIds}
                      onToggleSelect={handleTogglePhotoSelect}
                      onSelectAll={handleSelectAll}
                      onDeselectAll={handleDeselectAll}
                      metaMap={metaMap}
                      aiTags={aiTags}
                    />
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <PhotoGrid
            photos={filteredPhotos}
            personLabel={
              isAllPhotosActive
                ? t("sidebar_all_photos")
                : isNoFacesActive
                  ? t("sidebar_no_faces")
                  : isLowQualityActive
                    ? t("sidebar_low_quality")
                    : activeIndex >= 0
                      ? getGroupName(activeGroup!.id, activeIndex)
                      : ""
            }
            selectedIds={selectedPhotoIds}
            onToggleSelect={handleTogglePhotoSelect}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
            showBbox={!isNoFacesActive && !isAllPhotosActive}
            metaMap={metaMap}
            aiTags={aiTags}
          />
        )}
        {showExif && (
          <ExifPanel filePath={exifFilePath} onClose={() => setShowExif(false)} />
        )}
      </div>

      {/* Floating bottom action bar (M4) — appears when EITHER photos or
          persons are selected. When persons are selected (and no individual
          photos), the actions operate on every photo of every selected
          person. */}
      {(() => {
        const photoMode = selectedPhotoPaths.length > 0;
        const personMode = !photoMode && selectedGroupIds.size > 0;
        const targetPaths = photoMode ? selectedPhotoPaths : selectedPersonsPhotoPaths;
        const count = photoMode ? selectedPhotoPaths.length : (personMode ? selectedPersonsPhotoPaths.length : 0);
        const clearSelection = () => {
          if (photoMode) handleDeselectAll();
          else handleDeselectAllPersons();
        };
        return (
          <BottomActionBar
            selectedCount={count}
            onClearSelection={clearSelection}
            onExport={() => {
              // Write the fresh selection payload and force a clean
              // export window. If an export window is already open from
              // a previous selection it would silently reuse the stale
              // payload (Rust `open_app_window` just focuses existing
              // windows), so close it first and then recreate.
              (async () => {
                try {
                  localStorage.setItem(
                    "faceflow-export-payload",
                    JSON.stringify({ filePaths: targetPaths, groups: mutableGroups }),
                  );
                } catch {
                  /* localStorage may be full / disabled */
                }
                try {
                  const wins = await getAllWebviewWindows();
                  const existing = wins.find((w) => w.label === "faceflow-export");
                  if (existing) await existing.close();
                } catch {
                  /* ignore — fall through to open */
                }
                invoke("open_app_window", {
                  name: "export",
                  title: "Export",
                  width: 540,
                  height: 820,
                }).catch(() => setShowExport(true));
              })();
            }}
            onPick={() => setPickStatus(targetPaths, "pick")}
            onReject={() => setPickStatus(targetPaths, "reject")}
            onClearStatus={() => setPickStatus(targetPaths, "none")}
            onRate={(r) => setRating(targetPaths, r)}
            onSetColorLabel={(label) => setColorLabel(targetPaths, label)}
            onReveal={() => {
              if (targetPaths.length === 0) return;
              invoke("reveal_in_finder", { filePaths: targetPaths }).catch((e) =>
                console.error("reveal_in_finder failed", e),
              );
            }}
            onCompare={photoMode ? () => setShowCompare(true) : undefined}
            onAiAnalyze={personMode && aiConfigured ? handleAiAnalyzeForSelectedPersons : undefined}
            groups={photoMode ? mutableGroups : undefined}
            groupNames={photoMode ? groupNames : undefined}
            activeGroupId={photoMode ? activeGroupId : undefined}
            onMovePhotos={photoMode ? handleMovePhotos : undefined}
            onCreateGroupAndMove={photoMode ? handleCreateGroupAndMove : undefined}
          />
        );
      })()}

      {/* Modals */}
      {showExport && selectedPhotoPaths.length > 0 && (
        <ExportDialog filePaths={selectedPhotoPaths} groups={mutableGroups} onClose={() => setShowExport(false)} />
      )}
      {showCompare && comparePhotos.length >= 2 && (
        <CompareView photos={comparePhotos} onClose={() => setShowCompare(false)} />
      )}
      {showHelp && (
        <HelpDialog onClose={() => setShowHelp(false)} />
      )}
      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}

      <AiAnalysisDialog
        open={aiDialogOpen}
        items={aiDialogItems}
        isRunning={aiAnalyzing}
        onClose={() => setAiDialogOpen(false)}
        onCancel={() => {
          aiCancelRef.current = true;
        }}
      />

      <AiTaskPicker
        open={aiPickerOpen}
        defaultSelectedCount={selectedPhotoIds.size}
        totalPhotos={currentPhotos.length}
        onClose={() => setAiPickerOpen(false)}
        onRun={runAiTasks}
      />

      <MergeSuggestionsDialog
        open={mergeDialogOpen}
        suggestions={smartTargetGroupId ? smartSuggestionsForDialog : mergeSuggestions}
        groups={mutableGroups}
        groupNames={groupNames}
        onClose={handleCloseMergeDialog}
        onAccept={smartTargetGroupId ? handleAcceptSmartSuggestion : handleAcceptMergeSuggestion}
        onReject={smartTargetGroupId ? handleRejectSmartSuggestion : handleRejectMergeSuggestion}
      />

      {/* AI status toast */}
      {aiStatus && (
        <div className="fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 rounded-lg border border-edge bg-surface px-4 py-2.5 shadow-xl">
          <div className="flex items-center gap-2.5">
            {aiAnalyzing && (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            )}
            <span className="text-[12px] text-fg">{aiStatus}</span>
          </div>
        </div>
      )}
    </div>
  );
};
