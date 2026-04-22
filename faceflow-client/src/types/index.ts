export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface FaceEntry {
  face_id: string;
  file_path: string;
  bbox_x1: number;
  bbox_y1: number;
  bbox_x2: number;
  bbox_y2: number;
  embedding: string;
  detection_score: number;
  preview_base64: string;
}

export interface ScanResult {
  faces: FaceEntry[];
  total_files: number;
  total_faces: number;
  no_face_files: string[];
  processed_count: number;
  skipped_files: string[];
  /** Set when the user pressed Stop during the scan. */
  was_cancelled: boolean;
}

export interface ScanProgressRow {
  folder_path: string;
  last_processed_index: number;
  total_files: number;
  skipped_files: string[];
  status: string;
  started_at: string;
  updated_at: string;
}

export interface ScanSummary {
  folder_path: string;
  total_files: number;
  processed_count: number;
  skipped_files: string[];
}

export interface ScanProgress {
  total_files: number;
  processed: number;
  current_file: string;
  faces_found: number;
  /** Live estimate of unique persons (online single-pass clustering). */
  unique_persons: number;
  errors: number;
  last_error: string;
  phase: "scanning" | "compressing" | "detecting";
  files_read: number;
  /** How many files were already cached from a previous scan of this folder. */
  previously_processed: number;
  /** All image files in the folder (cached + new). */
  total_in_folder: number;
}

export interface FaceGroup {
  id: string;
  representative: FaceEntry;
  members: FaceEntry[];
  /**
   * `true` when the group did not pass strict clustering / quality
   * criteria (singletons, very small clusters, or low-quality faces).
   * The UI surfaces these as "Uncertain Person N" with a distinct
   * visual marker so the user can review them without polluting the
   * confident persons list.
   */
  isUncertain?: boolean;
}

export interface VolumeInfo {
  name: string;
  mount_point: string;
  total_bytes: number;
  available_bytes: number;
  is_removable: boolean;
}

export interface ModelStatus {
  models_ready: boolean;
  det_model_exists: boolean;
  rec_model_exists: boolean;
  exiftool_ready: boolean;
  models_dir: string;
}

export interface DownloadProgress {
  downloaded_bytes: number;
  total_bytes: number;
  phase: "downloading" | "extracting" | "done" | "downloading_exiftool" | "extracting_exiftool";
}

export type AppView = "loading" | "setup" | "dropzone" | "progress" | "gallery";

// ---- Photo metadata ----

export type ColorLabel = "none" | "red" | "yellow" | "green" | "blue" | "purple";
export type PickStatus = "none" | "pick" | "reject";

export interface PhotoMeta {
  file_path: string;
  rating: number;
  color_label: ColorLabel;
  pick_status: PickStatus;
  quality_score: number | null;
  blur_score: number | null;
  closed_eyes: boolean;
}

export interface TagInfo {
  id: number;
  name: string;
}

export interface ExifData {
  camera_make: string;
  camera_model: string;
  lens: string;
  focal_length: string;
  aperture: string;
  shutter_speed: string;
  iso: string;
  date_taken: string;
  width: number;
  height: number;
}

export interface ExportConfig {
  destination: string;
  rename_template: string;
  max_dimension: number | null;
  jpeg_quality: number | null;
  watermark_text: string;
  export_by_faces: boolean;
  face_groups: FaceGroupExport[] | null;
}

export interface FaceGroupExport {
  label: string;
  file_paths: string[];
}

export interface EventGroup {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  file_paths: string[];
}

export const COLOR_LABEL_MAP: Record<ColorLabel, string> = {
  none: "transparent",
  red: "#ff453a",
  yellow: "#ffd60a",
  green: "#30d158",
  blue: "#0a84ff",
  purple: "#bf5af2",
};
