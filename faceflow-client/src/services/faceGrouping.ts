import { invoke } from "@tauri-apps/api/core";
import type { FaceEntry, FaceGroup } from "../types";

function parseEmbedding(embeddingJson: string): number[] {
  try {
    return JSON.parse(embeddingJson) as number[];
  } catch {
    return [];
  }
}

/**
 * Quality criteria — anything not passing these is treated as a "low quality"
 * face (small / blurry / partial / mis-detected) and kept out of clustering so
 * it doesn't pollute person groups.
 */
const MIN_DETECTION_SCORE = 0.65;
const MIN_FACE_SIDE_PX = 80;
const MIN_FACE_AREA_PX = 90 * 90;

export function isLowQuality(face: FaceEntry): boolean {
  if (face.detection_score < MIN_DETECTION_SCORE) return true;
  const w = face.bbox_x2 - face.bbox_x1;
  const h = face.bbox_y2 - face.bbox_y1;
  if (w < MIN_FACE_SIDE_PX || h < MIN_FACE_SIDE_PX) return true;
  if (w * h < MIN_FACE_AREA_PX) return true;
  return false;
}

export interface GroupingResult {
  groups: FaceGroup[];
  lowQualityFaces: FaceEntry[];
}

export async function groupFacesByIdentity(
  faces: FaceEntry[],
  threshold = 0.78,
): Promise<GroupingResult> {
  if (faces.length === 0) return { groups: [], lowQualityFaces: [] };

  const goodFaces: FaceEntry[] = [];
  const lowQualityFaces: FaceEntry[] = [];
  for (const f of faces) {
    if (isLowQuality(f)) lowQualityFaces.push(f);
    else goodFaces.push(f);
  }

  if (goodFaces.length === 0) {
    return { groups: [], lowQualityFaces };
  }

  const embeddings = goodFaces.map((f) => parseEmbedding(f.embedding));
  const clusters = await invoke<number[][]>("cluster_faces_command", { embeddings, threshold });
  const groups = clusters
    .map((indices) => indices.map((idx) => goodFaces[idx]).filter(Boolean))
    .filter((members) => members.length > 0)
    .map((members) => ({
      id: members[0].face_id,
      representative: members[0],
      members,
    }));
  return {
    groups: groups.sort((a, b) => b.members.length - a.members.length),
    lowQualityFaces,
  };
}

