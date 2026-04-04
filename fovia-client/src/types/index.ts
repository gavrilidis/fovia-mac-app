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
}

export interface ScanProgress {
  total_files: number;
  processed: number;
  current_file: string;
  faces_found: number;
}

export interface FaceGroup {
  id: string;
  representative: FaceEntry;
  members: FaceEntry[];
}

export interface VolumeInfo {
  name: string;
  mount_point: string;
  total_bytes: number;
  available_bytes: number;
  is_removable: boolean;
}

export type AppView = "dropzone" | "progress" | "gallery";
