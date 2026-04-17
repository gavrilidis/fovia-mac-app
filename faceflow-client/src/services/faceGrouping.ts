import { invoke } from "@tauri-apps/api/core";
import type { FaceEntry, FaceGroup } from "../types";

function parseEmbedding(embeddingJson: string): number[] {
  try {
    return JSON.parse(embeddingJson) as number[];
  } catch {
    return [];
  }
}

export async function groupFacesByIdentity(
  faces: FaceEntry[],
  threshold = 0.38,
): Promise<FaceGroup[]> {
  if (faces.length === 0) return [];
  const embeddings = faces.map((f) => parseEmbedding(f.embedding));
  const clusters = await invoke<number[][]>("cluster_faces_command", { embeddings, threshold });
  const groups = clusters
    .map((indices) => indices.map((idx) => faces[idx]).filter(Boolean))
    .filter((members) => members.length > 0)
    .map((members) => ({
      id: members[0].face_id,
      representative: members[0],
      members,
    }));
  return groups.sort((a, b) => b.members.length - a.members.length);
}
