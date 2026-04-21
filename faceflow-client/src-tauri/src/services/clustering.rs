use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Cluster {
    indices: Vec<usize>,
    centroid: Vec<f32>,
}

// Quality thresholds — must mirror `faceGrouping.ts::isLowQuality` so the
// live persons/faces counter shown during a scan converges to the same
// number as the post-scan HAC + quality-filter pipeline. Without this,
// the scanner would seed the OnlineClusterer with low-confidence /
// tiny-bbox detections that the final pass discards, causing the live
// counter to drastically over-estimate persons (e.g. 100+ persons shown
// during scan vs ~30 in the final gallery).
pub const MIN_DETECTION_SCORE: f32 = 0.65;
pub const MIN_FACE_SIDE_PX: f32 = 80.0;
pub const MIN_FACE_AREA_PX: f32 = 90.0 * 90.0;

/// Returns `true` when a detected face is too small or too uncertain to be
/// trusted by the live person estimator. Inputs come straight from the
/// detector (`bbox` in `[x1, y1, x2, y2]`, `score` from SCRFD).
pub fn is_low_quality(bbox: &[f32; 4], score: f32) -> bool {
    if score < MIN_DETECTION_SCORE {
        return true;
    }
    let w = bbox[2] - bbox[0];
    let h = bbox[3] - bbox[1];
    if w < MIN_FACE_SIDE_PX || h < MIN_FACE_SIDE_PX {
        return true;
    }
    if w * h < MIN_FACE_AREA_PX {
        return true;
    }
    false
}

/// Convenience overload for `[f64; 4]` bboxes coming from the database
/// (faces persisted in earlier scans).
pub fn is_low_quality_f64(bbox: &[f64; 4], score: f64) -> bool {
    let bbox_f32 = [
        bbox[0] as f32,
        bbox[1] as f32,
        bbox[2] as f32,
        bbox[3] as f32,
    ];
    is_low_quality(&bbox_f32, score as f32)
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let mut dot = 0.0f32;
    let mut norm_a = 0.0f32;
    let mut norm_b = 0.0f32;
    for i in 0..a.len() {
        dot += a[i] * b[i];
        norm_a += a[i] * a[i];
        norm_b += b[i] * b[i];
    }
    let denom = norm_a.sqrt() * norm_b.sqrt();
    if denom == 0.0 {
        0.0
    } else {
        dot / denom
    }
}

fn compute_centroid(embeddings: &[Vec<f32>], indices: &[usize]) -> Vec<f32> {
    if indices.is_empty() {
        return Vec::new();
    }
    let dim = embeddings[indices[0]].len();
    let mut centroid = vec![0.0f32; dim];
    for idx in indices {
        for (i, value) in embeddings[*idx].iter().enumerate() {
            centroid[i] += *value;
        }
    }
    let inv = 1.0f32 / indices.len() as f32;
    for c in &mut centroid {
        *c *= inv;
    }
    centroid
}

pub fn cluster_faces(embeddings: Vec<Vec<f32>>, threshold: f32) -> Vec<Vec<usize>> {
    if embeddings.is_empty() {
        return Vec::new();
    }
    // Diagnostic trace: lets us see (in `npm run tauri dev` console) how
    // many faces went in, what threshold was used, and how many clusters
    // each pass produced. Crucial for debugging "why N persons instead
    // of M" complaints.
    let total_faces = embeddings.len();
    eprintln!(
        "[clustering] start: {} faces, threshold={:.3}",
        total_faces, threshold
    );
    let mut clusters: Vec<Option<Cluster>> = embeddings
        .iter()
        .enumerate()
        .map(|(idx, emb)| {
            if emb.is_empty() {
                None
            } else {
                Some(Cluster {
                    indices: vec![idx],
                    centroid: emb.clone(),
                })
            }
        })
        .collect();

    loop {
        let mut best_sim = -1.0f32;
        let mut best_i = None;
        let mut best_j = None;
        for i in 0..clusters.len() {
            let Some(ci) = &clusters[i] else { continue };
            for (j, cj) in clusters.iter().enumerate().skip(i + 1) {
                let Some(cj) = cj else { continue };
                let sim = cosine_similarity(&ci.centroid, &cj.centroid);
                if sim > best_sim {
                    best_sim = sim;
                    best_i = Some(i);
                    best_j = Some(j);
                }
            }
        }

        if best_sim <= threshold {
            break;
        }
        let (Some(i), Some(j)) = (best_i, best_j) else {
            break;
        };
        let (Some(left), Some(right)) = (&clusters[i], &clusters[j]) else {
            break;
        };
        let mut merged = left.indices.clone();
        merged.extend_from_slice(&right.indices);
        let centroid = compute_centroid(&embeddings, &merged);
        clusters[i] = Some(Cluster {
            indices: merged,
            centroid,
        });
        clusters[j] = None;
    }

    let after_hac = clusters.iter().filter(|c| c.is_some()).count();
    eprintln!("[clustering] after HAC: {} clusters", after_hac);

    // ---- Second pass: rescue singletons by attaching them to the nearest
    // multi-member cluster if similarity is above a looser threshold.
    // Multi-member centroids are statistically more reliable, so this catches
    // single-shot odd-angle / odd-lighting faces that HAC failed to merge.
    //
    // CAVEAT: relaxing the threshold by 0.06 made sense for the legacy 0.32
    // default, but it silently over-merged distinct people once the user
    // started picking strict values like 0.78 (typical symptom: 8 persons
    // found where there should be 14). When the user explicitly chooses a
    // strict threshold (>= 0.6), the rescue pass must not loosen it.
    let rescue_threshold = if threshold >= 0.6 {
        threshold
    } else {
        (threshold - 0.06_f32).max(0.20_f32)
    };
    let mut active: Vec<usize> = (0..clusters.len())
        .filter(|i| clusters[*i].is_some())
        .collect();

    // Collect singleton indices (in cluster space) and target indices (multi-member).
    let singletons: Vec<usize> = active
        .iter()
        .copied()
        .filter(|i| clusters[*i].as_ref().is_some_and(|c| c.indices.len() == 1))
        .collect();
    let targets: Vec<usize> = active
        .iter()
        .copied()
        .filter(|i| clusters[*i].as_ref().is_some_and(|c| c.indices.len() >= 2))
        .collect();

    for s in singletons {
        let Some(scluster) = clusters[s].as_ref().map(|c| c.centroid.clone()) else {
            continue;
        };
        let mut best_sim = -1.0f32;
        let mut best_t: Option<usize> = None;
        for &t in &targets {
            let Some(tc) = clusters[t].as_ref() else {
                continue;
            };
            let sim = cosine_similarity(&scluster, &tc.centroid);
            if sim > best_sim {
                best_sim = sim;
                best_t = Some(t);
            }
        }
        if let Some(t) = best_t {
            if best_sim > rescue_threshold {
                let mut merged = clusters[t].as_ref().unwrap().indices.clone();
                merged.extend_from_slice(&clusters[s].as_ref().unwrap().indices);
                let centroid = compute_centroid(&embeddings, &merged);
                clusters[t] = Some(Cluster {
                    indices: merged,
                    centroid,
                });
                clusters[s] = None;
            }
        }
    }

    // ---- Third pass: merge small clusters whose centroids are still
    // close (looser than HAC threshold) — addresses the case where the
    // same person is split into 2-3 sub-clusters by HAC's strict cutoff.
    //
    // Same caveat as the rescue pass: when the user picks a strict
    // threshold (>= 0.6) we must not loosen it. Skipping the third pass
    // entirely for strict thresholds is the only way to honour the
    // user's intent ("keep these distinct people apart").
    if threshold >= 0.6 {
        let mut out = Vec::new();
        for cluster in clusters.into_iter().flatten() {
            out.push(cluster.indices);
        }
        eprintln!(
            "[clustering] strict threshold {:.3}: skipping small-merge pass, {} final clusters (rescue_threshold={:.3})",
            threshold, out.len(), rescue_threshold
        );
        return out;
    }
    let small_merge_threshold = (threshold - 0.05_f32).max(0.20_f32);
    loop {
        active = (0..clusters.len())
            .filter(|i| clusters[*i].is_some())
            .collect();
        let mut best_sim = -1.0f32;
        let mut best_pair: Option<(usize, usize)> = None;
        for ai in 0..active.len() {
            let i = active[ai];
            let Some(ci) = &clusters[i] else { continue };
            // Only attempt looser merging on small clusters (≤6 members).
            if ci.indices.len() > 6 {
                continue;
            }
            for &j in active.iter().skip(ai + 1) {
                let Some(cj) = &clusters[j] else { continue };
                if cj.indices.len() > 6 {
                    continue;
                }
                let sim = cosine_similarity(&ci.centroid, &cj.centroid);
                if sim > best_sim {
                    best_sim = sim;
                    best_pair = Some((i, j));
                }
            }
        }
        if best_sim <= small_merge_threshold {
            break;
        }
        let Some((i, j)) = best_pair else { break };
        let mut merged = clusters[i].as_ref().unwrap().indices.clone();
        merged.extend_from_slice(&clusters[j].as_ref().unwrap().indices);
        let centroid = compute_centroid(&embeddings, &merged);
        clusters[i] = Some(Cluster {
            indices: merged,
            centroid,
        });
        clusters[j] = None;
    }

    let mut out = Vec::new();
    for cluster in clusters.into_iter().flatten() {
        out.push(cluster.indices);
    }
    eprintln!(
        "[clustering] loose threshold {:.3}: {} final clusters",
        threshold,
        out.len()
    );
    out
}

#[tauri::command]
pub fn cluster_faces_command(
    embeddings: Vec<Vec<f32>>,
    threshold: Option<f32>,
) -> Result<Vec<Vec<usize>>, String> {
    Ok(cluster_faces(embeddings, threshold.unwrap_or(0.32)))
}

/// Lightweight single-pass online clusterer used during scanning to give the
/// user a *live* estimate of the number of unique persons. Unlike the full
/// HAC pipeline (which is recomputed at scan-end), this version only needs
/// O(P) work per added embedding (P = current cluster count) so it stays
/// cheap even for thousands of faces.
///
/// The estimate is intentionally conservative—the threshold is slightly
/// looser than HAC's default (0.30 vs 0.32) so the live counter does not
/// over-shoot before the final HAC + small-cluster merge runs at the end of
/// the scan and produces the authoritative number.
pub struct OnlineClusterer {
    pub threshold: f32,
    pub centroids: Vec<Vec<f32>>,
    pub counts: Vec<usize>,
}

impl OnlineClusterer {
    pub fn new(threshold: f32) -> Self {
        Self {
            threshold,
            centroids: Vec::new(),
            counts: Vec::new(),
        }
    }

    /// Insert a single face embedding. Returns the index of the cluster it
    /// was assigned to (or a freshly created cluster).
    pub fn add(&mut self, embedding: &[f32]) -> usize {
        let mut best_sim = -1.0f32;
        let mut best_idx: Option<usize> = None;
        for (i, c) in self.centroids.iter().enumerate() {
            let sim = cosine_similarity(c, embedding);
            if sim > best_sim {
                best_sim = sim;
                best_idx = Some(i);
            }
        }

        if let (Some(i), true) = (best_idx, best_sim > self.threshold) {
            // Update centroid as running mean.
            let count = self.counts[i] as f32;
            let new_count = count + 1.0;
            for (j, v) in embedding.iter().enumerate() {
                self.centroids[i][j] = (self.centroids[i][j] * count + *v) / new_count;
            }
            self.counts[i] += 1;
            i
        } else {
            self.centroids.push(embedding.to_vec());
            self.counts.push(1);
            self.centroids.len() - 1
        }
    }

    /// Number of distinct person clusters discovered so far.
    pub fn len(&self) -> usize {
        self.centroids.len()
    }

    pub fn is_empty(&self) -> bool {
        self.centroids.is_empty()
    }

    pub fn reset(&mut self) {
        self.centroids.clear();
        self.counts.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clusters_three_pairs() {
        let embeddings = vec![
            vec![1.0, 0.0],
            vec![0.98, 0.02],
            vec![0.0, 1.0],
            vec![0.02, 0.98],
            vec![-1.0, 0.0],
            vec![-0.98, -0.02],
        ];
        let mut clusters = cluster_faces(embeddings, 0.9);
        clusters.sort_by_key(|c| c.len());
        assert_eq!(clusters.len(), 3);
        assert!(clusters.iter().all(|c| c.len() == 2));
    }

    #[test]
    fn online_clusterer_groups_similar_embeddings() {
        // Three logical persons, two embeddings each, slightly perturbed.
        let inputs: [&[f32]; 6] = [
            &[1.0, 0.0, 0.0],
            &[0.99, 0.05, 0.01],
            &[0.0, 1.0, 0.0],
            &[0.02, 0.98, 0.01],
            &[0.0, 0.0, 1.0],
            &[0.01, 0.02, 0.99],
        ];
        let mut oc = OnlineClusterer::new(0.85);
        for emb in inputs.iter() {
            oc.add(emb);
        }
        assert_eq!(
            oc.len(),
            3,
            "expected 3 distinct clusters, got {}",
            oc.len()
        );
    }

    #[test]
    fn online_clusterer_creates_new_cluster_for_dissimilar() {
        let mut oc = OnlineClusterer::new(0.95);
        oc.add(&[1.0, 0.0]);
        oc.add(&[-1.0, 0.0]);
        assert_eq!(oc.len(), 2);
    }

    #[test]
    fn online_clusterer_reset_clears_state() {
        let mut oc = OnlineClusterer::new(0.5);
        oc.add(&[1.0, 0.0]);
        oc.add(&[0.0, 1.0]);
        assert_eq!(oc.len(), 2);
        oc.reset();
        assert!(oc.is_empty());
    }
}
