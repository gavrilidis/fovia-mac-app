import React, { useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FaceEntry, FaceGroup, ColorLabel, PickStatus } from "../types";
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
      return true;
    });
  }, [currentPhotos, metaMap, filterRating, filterPick, filterLabel]);

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
      />

      {/* Content area */}
      <div className="flex flex-1 overflow-hidden">
        <FaceSidebar
          groups={groups}
          activeGroupId={activeGroupId}
          selectedGroupIds={selectedGroupIds}
          noFaceCount={noFaceFiles.length}
          onSetActive={handleSetActive}
          onToggleGroupSelect={handleToggleGroupSelect}
          onRevealSelected={handleRevealSelected}
        />
        <PhotoGrid
          photos={filteredPhotos}
          personLabel={isNoFacesActive ? "No Faces" : activeIndex >= 0 ? `Person ${activeIndex + 1}` : ""}
          selectedIds={selectedPhotoIds}
          onToggleSelect={handleTogglePhotoSelect}
          hideBbox={isNoFacesActive}
          metaMap={metaMap}
        />
        {showExif && (
          <ExifPanel filePath={exifFilePath} onClose={() => setShowExif(false)} />
        )}
      </div>

      {/* Modals */}
      {showExport && selectedPhotoPaths.length > 0 && (
        <ExportDialog filePaths={selectedPhotoPaths} onClose={() => setShowExport(false)} />
      )}
      {showCompare && comparePhotos.length >= 2 && (
        <CompareView photos={comparePhotos} onClose={() => setShowCompare(false)} />
      )}
    </div>
  );
};
