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
 * face (small / blurry / partial / mis-detected). Previously these faces were
 * dropped entirely; now they are surfaced as "Uncertain Persons" so the user
 * can review them without them polluting the confident persons list.
 */
const MIN_DETECTION_SCORE = 0.65;
const MIN_FACE_SIDE_PX = 80;
const MIN_FACE_AREA_PX = 90 * 90;

/** A confident group with two or fewer members is also flagged uncertain — */
/** singletons frequently turn out to be detector glitches or odd-angle    */
/** shots of a person that already has a larger group elsewhere.           */
const MIN_CONFIDENT_GROUP_SIZE = 3;

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
  const confidentClusters = await clusterEmbeddings(goodFaces, threshold);

  // Uncertain pass — also cluster the low-quality faces (they still have
  // valid embeddings) using the same threshold so visually-similar bad
  // shots end up together rather than as one group per face.
  const uncertainClusters = await clusterEmbeddings(lowQualityFaces, threshold);

  const confidentGroups: FaceGroup[] = [];
  const uncertainGroups: FaceGroup[] = [];

  for (const members of confidentClusters) {
    const group: FaceGroup = {
      id: members[0].face_id,
      representative: members[0],
      members,
      isUncertain: members.length < MIN_CONFIDENT_GROUP_SIZE,
    };
    if (group.isUncertain) {
      uncertainGroups.push(group);
    } else {
      confidentGroups.push(group);
    }
  }

  for (const members of uncertainClusters) {
    uncertainGroups.push({
      id: members[0].face_id,
      representative: members[0],
      members,
      isUncertain: true,
    });
  }

  // Confident persons first (largest → smallest), uncertain persons last.
  confidentGroups.sort((a, b) => b.members.length - a.members.length);
  uncertainGroups.sort((a, b) => b.members.length - a.members.length);

  return {
    groups: [...confidentGroups, ...uncertainGroups],
    lowQualityFaces: [],
  };
}

