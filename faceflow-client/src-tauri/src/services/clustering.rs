use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Cluster {
    indices: Vec<usize>,
    centroid: Vec<f32>,
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
    if denom == 0.0 { 0.0 } else { dot / denom }
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

    let mut out = Vec::new();
    for cluster in clusters.into_iter().flatten() {
        out.push(cluster.indices);
    }
    out
}

#[tauri::command]
pub fn cluster_faces_command(
    embeddings: Vec<Vec<f32>>,
    threshold: Option<f32>,
) -> Result<Vec<Vec<usize>>, String> {
    Ok(cluster_faces(embeddings, threshold.unwrap_or(0.38)))
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
}
