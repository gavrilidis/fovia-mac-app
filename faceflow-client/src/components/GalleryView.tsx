import React, { useCallback, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FaceEntry, FaceGroup, ColorLabel, PickStatus, EventGroup } from "../types";
import { FaceSidebar } from "./FaceSidebar";
import { PhotoGrid } from "./PhotoGrid";
import { Toolbar } from "./Toolbar";
import { ExifPanel } from "./ExifPanel";
import { ExportDialog } from "./ExportDialog";
import { CompareView } from "./CompareView";
import { HelpDialog } from "./HelpDialog";
import { SettingsPanel } from "./SettingsPanel";
import { usePhotoMeta } from "../hooks/usePhotoMeta";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useI18n } from "../i18n";
import { isAiConfigured, analyzePhoto } from "../services/aiService";

interface GalleryViewProps {
  groups: FaceGroup[];
  noFaceFiles: string[];
  onReset: () => void;
}

const NO_FACES_ID = "__no_faces__";

export const GalleryView: React.FC<GalleryViewProps> = ({ groups, noFaceFiles, onReset }) => {
  const { t } = useI18n();

  // Mutable groups — allow moving photos between persons
  const [mutableGroups, setMutableGroups] = React.useState<FaceGroup[]>(groups);
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
  const [showOnboarding, setShowOnboarding] = React.useState(true);

  // Search & AI
  const [searchQuery, setSearchQuery] = React.useState("");
  const [aiAnalyzing, setAiAnalyzing] = React.useState(false);
  const [aiStatus, setAiStatus] = React.useState<string | null>(null);
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

  const currentPhotos = isNoFacesActive ? noFaceEntries : (activeGroup?.members || []);

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

  const handleRevealSelected = useCallback(async () => {
    if (selectedGroupIds.size === 0) return;
    const filePaths = mutableGroups
      .filter((g) => selectedGroupIds.has(g.id))
      .flatMap((g) => g.members.map((m) => m.file_path));
    try {
      await invoke("reveal_in_finder", { filePaths });
    } catch (e) {
      console.error("reveal_in_finder failed", e);
    }
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

  // AI analyze selected photos
  const handleAiAnalyze = useCallback(async () => {
    if (!isAiConfigured()) {
      setAiStatus("API key not configured — open Settings to add one");
      setTimeout(() => setAiStatus(null), 4000);
      return;
    }
    setAiAnalyzing(true);
    setAiStatus(null);
    let successCount = 0;
    let failCount = 0;
    try {
      // If no photos selected, analyze all photos in current view
      const entriesToAnalyze = selectedPhotoIds.size > 0
        ? Array.from(selectedPhotoIds)
            .map((id) => allFacesMap.get(id))
            .filter((f): f is FaceEntry => f !== undefined)
        : currentPhotos;

      if (entriesToAnalyze.length === 0) {
        setAiStatus("No photos to analyze");
        setTimeout(() => setAiStatus(null), 3000);
        setAiAnalyzing(false);
        return;
      }

      for (let i = 0; i < entriesToAnalyze.length; i++) {
        const entry = entriesToAnalyze[i];
        setAiStatus(`Analyzing ${i + 1} / ${entriesToAnalyze.length}...`);
        try {
          // Read photo as base64 via Tauri
          const base64 = await invoke<string>("read_photo_base64", { filePath: entry.file_path });
          const result = await analyzePhoto(base64);
          successCount++;
          setAiTags((prev) => {
            const next = new Map(prev);
            next.set(entry.file_path, result.tags);
            // Persist to localStorage
            try {
              localStorage.setItem("faceflow-ai-tags", JSON.stringify([...next]));
            } catch { /* quota exceeded, ignore */ }
            return next;
          });
        } catch (err) {
          failCount++;
          console.error("AI analyze failed for", entry.file_path, err);
        }
      }
    } catch (err) {
      console.error("AI analyze error:", err);
      setAiStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
      setTimeout(() => setAiStatus(null), 5000);
    } finally {
      setAiAnalyzing(false);
      if (successCount > 0 || failCount > 0) {
        const msg = failCount > 0
          ? `Done: ${successCount} tagged, ${failCount} failed`
          : `Done: ${successCount} photos tagged`;
        setAiStatus(msg);
        setTimeout(() => setAiStatus(null), 4000);
      }
    }
  }, [selectedPhotoIds, allFacesMap, currentPhotos]);

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
        onSettings={() => setShowSettings(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onAiAnalyze={handleAiAnalyze}
        aiAnalyzing={aiAnalyzing}
        aiConfigured={isAiConfigured()}
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
            onClick={() => setShowOnboarding(false)}
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
            onSetActive={handleSetActive}
            onToggleGroupSelect={handleToggleGroupSelect}
            onRevealSelected={handleRevealSelected}
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
                      hideBbox
                      metaMap={metaMap}
                    />
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <PhotoGrid
            photos={filteredPhotos}
            personLabel={isNoFacesActive ? "No Faces" : activeIndex >= 0 ? getGroupName(activeGroup!.id, activeIndex) : ""}
            selectedIds={selectedPhotoIds}
            onToggleSelect={handleTogglePhotoSelect}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
            hideBbox={isNoFacesActive}
            metaMap={metaMap}
          />
        )}
        {showExif && (
          <ExifPanel filePath={exifFilePath} onClose={() => setShowExif(false)} />
        )}
      </div>

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
