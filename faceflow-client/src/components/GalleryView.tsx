import React, { useCallback, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FaceEntry, FaceGroup, ColorLabel, PickStatus, EventGroup } from "../types";
import { FaceSidebar } from "./FaceSidebar";
import { PhotoGrid } from "./PhotoGrid";
import { Toolbar } from "./Toolbar";
import { ExifPanel } from "./ExifPanel";
import { ExportDialog } from "./ExportDialog";
import { CompareView } from "./CompareView";
import { usePhotoMeta } from "../hooks/usePhotoMeta";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";

interface GalleryViewProps {
  groups: FaceGroup[];
  noFaceFiles: string[];
  onReset: () => void;
}

const NO_FACES_ID = "__no_faces__";

export const GalleryView: React.FC<GalleryViewProps> = ({ groups, noFaceFiles, onReset }) => {
  const [activeGroupId, setActiveGroupId] = React.useState<string | null>(
    groups.length > 0 ? groups[0].id : noFaceFiles.length > 0 ? NO_FACES_ID : null,
  );
  const [selectedGroupIds, setSelectedGroupIds] = React.useState<Set<string>>(new Set());
  const [selectedPhotoIds, setSelectedPhotoIds] = React.useState<Set<string>>(new Set());
  const [showExif, setShowExif] = React.useState(false);
  const [showExport, setShowExport] = React.useState(false);
  const [showCompare, setShowCompare] = React.useState(false);

  // Filters
  const [filterRating, setFilterRating] = React.useState(0);
  const [filterPick, setFilterPick] = React.useState<PickStatus | "all">("all");
  const [filterLabel, setFilterLabel] = React.useState<ColorLabel | "all">("all");
  const [filterQuality, setFilterQuality] = React.useState<string>("all");

  // Event grouping
  const [eventView, setEventView] = React.useState(false);
  const [eventGap, setEventGap] = React.useState(30);
  const [eventGroups, setEventGroups] = React.useState<EventGroup[]>([]);

  const activeGroup = groups.find((g) => g.id === activeGroupId) || null;
  const activeIndex = activeGroup ? groups.indexOf(activeGroup) : -1;
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

  // Collect all file paths for metadata loading
  const allFilePaths = useMemo(() => {
    const paths = new Set<string>();
    for (const g of groups) {
      for (const m of g.members) {
        paths.add(m.file_path);
      }
    }
    for (const fp of noFaceFiles) {
      paths.add(fp);
    }
    return Array.from(paths);
  }, [groups, noFaceFiles]);

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

  // Filter photos based on metadata
  const filteredPhotos = useMemo(() => {
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
      return true;
    });
  }, [currentPhotos, metaMap, filterRating, filterPick, filterLabel, filterQuality]);

  // Resolve selected file paths
  const selectedPhotoPaths = useMemo(() => {
    return filteredPhotos
      .filter((p) => selectedPhotoIds.has(p.face_id))
      .map((p) => p.file_path);
  }, [filteredPhotos, selectedPhotoIds]);

  // Selected EXIF file path (show last selected photo)
  const exifFilePath = useMemo(() => {
    if (selectedPhotoPaths.length > 0) return selectedPhotoPaths[selectedPhotoPaths.length - 1];
    if (filteredPhotos.length > 0) return filteredPhotos[0].file_path;
    return null;
  }, [selectedPhotoPaths, filteredPhotos]);

  // Compare photos
  const comparePhotos = useMemo(() => {
    return filteredPhotos.filter((p) => selectedPhotoIds.has(p.face_id));
  }, [filteredPhotos, selectedPhotoIds]);

  const handleSetActive = useCallback((groupId: string) => {
    setActiveGroupId(groupId);
    setSelectedPhotoIds(new Set());
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
    const filePaths = groups
      .filter((g) => selectedGroupIds.has(g.id))
      .flatMap((g) => g.members.map((m) => m.file_path));
    try {
      await invoke("reveal_in_finder", { filePaths });
    } catch (e) {
      console.error("reveal_in_finder failed", e);
    }
  }, [groups, selectedGroupIds]);

  const handleSelectAll = useCallback(() => {
    setSelectedPhotoIds(new Set(filteredPhotos.map((p) => p.face_id)));
  }, [filteredPhotos]);

  const handleDeselectAll = useCallback(() => {
    setSelectedPhotoIds(new Set());
  }, []);

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
        groupCount={groups.length}
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
      />

      {/* Content area */}
      <div className="flex flex-1 overflow-hidden">
        {!eventView && (
          <FaceSidebar
            groups={groups}
            activeGroupId={activeGroupId}
            selectedGroupIds={selectedGroupIds}
            noFaceCount={noFaceFiles.length}
            onSetActive={handleSetActive}
            onToggleGroupSelect={handleToggleGroupSelect}
            onRevealSelected={handleRevealSelected}
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
            personLabel={isNoFacesActive ? "No Faces" : activeIndex >= 0 ? `Person ${activeIndex + 1}` : ""}
            selectedIds={selectedPhotoIds}
            onToggleSelect={handleTogglePhotoSelect}
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
        <ExportDialog filePaths={selectedPhotoPaths} groups={groups} onClose={() => setShowExport(false)} />
      )}
      {showCompare && comparePhotos.length >= 2 && (
        <CompareView photos={comparePhotos} onClose={() => setShowCompare(false)} />
      )}
    </div>
  );
};
