import type { FaceEntry, FaceGroup } from "../types";

const SIMILARITY_THRESHOLD = 0.6;

function parseEmbedding(embeddingJson: string): number[] {
  try {
    return JSON.parse(embeddingJson) as number[];
  } catch {
    return [];
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

export function groupFacesByIdentity(faces: FaceEntry[]): FaceGroup[] {
  if (faces.length === 0) return [];

  const embeddings = faces.map((f) => parseEmbedding(f.embedding));
  const assigned = new Set<number>();
  const groups: FaceGroup[] = [];

  for (let i = 0; i < faces.length; i++) {
    if (assigned.has(i)) continue;

    assigned.add(i);
    const members: FaceEntry[] = [faces[i]];

    // Only cluster if embedding is valid
    if (embeddings[i].length > 0) {
      for (let j = i + 1; j < faces.length; j++) {
        if (assigned.has(j)) continue;
        if (embeddings[j].length === 0) continue;

        const similarity = cosineSimilarity(embeddings[i], embeddings[j]);
        if (similarity > SIMILARITY_THRESHOLD) {
          assigned.add(j);
          members.push(faces[j]);
        }
      }
    }

    groups.push({
      id: faces[i].face_id,
      representative: faces[i],
      members,
    });
  }

  return groups.sort((a, b) => b.members.length - a.members.length);
}
