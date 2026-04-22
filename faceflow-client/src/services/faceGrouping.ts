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
 * face (small / blurry / partial / mis-detected). Low-quality faces are
 * surfaced as "Uncertain Persons" instead of being dropped, so the user
 * can still review them without polluting the confident persons list.
 *
 * The defaults below are the *recommended* values; the actual values used
 * at runtime are read from localStorage (set via Settings → Scan Quality)
 * so tweaks take effect on the very next regroup / scan.
 */
export const LS_QUALITY_THRESHOLD = "faceflow-quality-threshold";
export const LS_MIN_FACE_SIZE = "faceflow-min-face-size";
export const DEFAULT_QUALITY_THRESHOLD = 0.65;
export const DEFAULT_MIN_FACE_SIZE = 80;

function readNumberLS(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw == null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function isLowQuality(face: FaceEntry): boolean {
  const minScore = readNumberLS(LS_QUALITY_THRESHOLD, DEFAULT_QUALITY_THRESHOLD);
  const minSide = readNumberLS(LS_MIN_FACE_SIZE, DEFAULT_MIN_FACE_SIZE);
  if (face.detection_score < minScore) return true;
  const w = face.bbox_x2 - face.bbox_x1;
  const h = face.bbox_y2 - face.bbox_y1;
  if (w < minSide || h < minSide) return true;
  // Area gate scales with the linear gate so a single slider tunes both.
  if (w * h < minSide * minSide) return true;
  return false;
}

export interface GroupingResult {
  groups: FaceGroup[];
  /**
   * Kept for backward compatibility. Always empty in the new pipeline —
   * low-quality faces are now surfaced inside `groups` with
   * `isUncertain: true` instead of being hidden.
   */
  lowQualityFaces: FaceEntry[];
}

async function clusterEmbeddings(
  faces: FaceEntry[],
  threshold: number,
): Promise<FaceEntry[][]> {
  if (faces.length === 0) return [];
  const embeddings = faces.map((f) => parseEmbedding(f.embedding));
  const clusters = await invoke<number[][]>("cluster_faces_command", {
    embeddings,
    threshold,
  });
  return clusters
    .map((indices) => indices.map((idx) => faces[idx]).filter(Boolean))
    .filter((members) => members.length > 0);
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

  // Confident pass — strict clustering on high-quality faces only.
  // Every cluster from this pass is treated as a confident person regardless
  // of its size: small confident clusters are still real people who happened
  // to appear in only a handful of frames, not noise.
  const confidentClusters = await clusterEmbeddings(goodFaces, threshold);

  // Uncertain pass — also cluster the low-quality faces (they still have
  // valid embeddings) using the same threshold so visually-similar bad
  // shots end up together rather than as one group per face.
  const uncertainClusters = await clusterEmbeddings(lowQualityFaces, threshold);

  const confidentGroups: FaceGroup[] = confidentClusters.map((members) => ({
    id: members[0].face_id,
    representative: members[0],
    members,
    isUncertain: false,
  }));

  const uncertainGroups: FaceGroup[] = uncertainClusters.map((members) => ({
    id: members[0].face_id,
    representative: members[0],
    members,
    isUncertain: true,
  }));

  // Confident persons first (largest → smallest), uncertain persons last.
  confidentGroups.sort((a, b) => b.members.length - a.members.length);
  uncertainGroups.sort((a, b) => b.members.length - a.members.length);

  return {
    groups: [...confidentGroups, ...uncertainGroups],
    lowQualityFaces: [],
  };
}


