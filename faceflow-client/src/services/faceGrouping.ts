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
// Industry-standard ArcFace / InsightFace baselines. These intentionally
// sit on the *permissive* side: it is much easier for the user to review
// and reject false-merge suggestions than to spot a missed match.
export const DEFAULT_QUALITY_THRESHOLD = 0.6;
export const DEFAULT_MIN_FACE_SIZE = 60;

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
  threshold = 0.5,
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

// ---------- Smart Merge Suggestions -----------------------------------------

export interface MergeCandidate {
  /** ID of the confident (target) group the uncertain cluster might belong to. */
  confidentGroupId: string;
  /** ID of the uncertain (source) group being suggested for merge. */
  uncertainGroupId: string;
  /** Cosine similarity between the centroids in [-1, 1]. */
  similarity: number;
  /** Human-readable rationale shown in the dialog. */
  reason: string;
}

function l2Normalize(vec: number[]): number[] {
  let sumSq = 0;
  for (const v of vec) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  if (norm === 0) return vec;
  const out = new Array<number>(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

function centroid(group: FaceGroup): number[] {
  if (group.members.length === 0) return [];
  const dim = parseEmbedding(group.members[0].embedding).length;
  if (dim === 0) return [];
  const acc = new Array<number>(dim).fill(0);
  let counted = 0;
  for (const m of group.members) {
    const e = parseEmbedding(m.embedding);
    if (e.length !== dim) continue;
    for (let i = 0; i < dim; i++) acc[i] += e[i];
    counted += 1;
  }
  if (counted === 0) return [];
  for (let i = 0; i < dim; i++) acc[i] /= counted;
  return l2Normalize(acc);
}

function dot(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return -1;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * For each uncertain group, find the most similar confident group by
 * centroid cosine similarity. Emit a candidate when the similarity falls
 * inside the "review zone" — high enough to be a plausible same-person
 * match but below the strict clustering threshold that would have merged
 * them automatically. The lower bound defaults to 0.40 (well above the
 * "any random face" baseline of ~0.2 for ArcFace) and the upper bound is
 * the user's current cluster threshold.
 *
 * Returns at most one suggestion per uncertain group (its best target),
 * sorted by descending confidence.
 */
export function computeMergeSuggestions(
  groups: FaceGroup[],
  clusterThreshold: number,
  reviewFloor = 0.4,
): MergeCandidate[] {
  const confident = groups.filter((g) => !g.isUncertain && g.members.length > 0);
  const uncertain = groups.filter((g) => g.isUncertain && g.members.length > 0);
  if (confident.length === 0 || uncertain.length === 0) return [];

  const confidentCentroids = confident.map((g) => ({
    id: g.id,
    centroid: centroid(g),
  }));

  const out: MergeCandidate[] = [];
  for (const u of uncertain) {
    const uc = centroid(u);
    if (uc.length === 0) continue;
    let bestId: string | null = null;
    let bestSim = -1;
    for (const c of confidentCentroids) {
      if (c.centroid.length === 0) continue;
      const sim = dot(uc, c.centroid);
      if (sim > bestSim) {
        bestSim = sim;
        bestId = c.id;
      }
    }
    // Only surface as a suggestion when it lands in the "uncertain but
    // promising" band: above the review floor, below the strict cluster
    // threshold (otherwise auto-clustering would have merged it).
    if (bestId && bestSim > reviewFloor && bestSim < clusterThreshold) {
      out.push({
        confidentGroupId: bestId,
        uncertainGroupId: u.id,
        similarity: bestSim,
        reason: `Centroid similarity ${(bestSim * 100).toFixed(0)}% — likely the same person but below the strict ${(clusterThreshold * 100).toFixed(0)}% auto-merge threshold.`,
      });
    }
  }
  out.sort((a, b) => b.similarity - a.similarity);
  return out;
}



