use std::path::Path;

use ndarray::Array4;
use ort::session::{Session, SessionOutputs};
use ort::value::Value;

/// 5 reference landmarks for ArcFace 112x112 alignment (left-eye, right-eye, nose, left-mouth, right-mouth).
const ARCFACE_REF: [[f32; 2]; 5] = [
    [38.2946, 51.6963],
    [73.5318, 51.5014],
    [56.0252, 71.7366],
    [41.5493, 92.3655],
    [70.7299, 92.2041],
];

const DET_INPUT_SIZE: usize = 640;
const REC_INPUT_SIZE: usize = 112;
const STRIDES: [usize; 3] = [8, 16, 32];
const NUM_ANCHORS: usize = 2;
const NMS_THRESHOLD: f32 = 0.4;

/// A detected face with bounding box, landmarks, score, and embedding.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct DetectedFace {
    pub bbox: [f32; 4],
    pub landmarks: [[f32; 2]; 5],
    pub score: f32,
    pub embedding: Vec<f32>,
}

/// Holds loaded ONNX models for face detection and recognition.
pub struct FaceModels {
    det_session: Session,
    rec_session: Session,
}

impl FaceModels {
    /// Load detection and recognition ONNX models from a directory.
    pub fn load(models_dir: &Path) -> Result<Self, String> {
        let det_path = models_dir.join("det_10g.onnx");
        let rec_path = models_dir.join("w600k_r50.onnx");

        if !det_path.exists() {
            return Err(format!("Detection model not found: {}", det_path.display()));
        }
        if !rec_path.exists() {
            return Err(format!(
                "Recognition model not found: {}",
                rec_path.display()
            ));
        }

        let det_session = Session::builder()
            .map_err(|e| format!("Failed to create detection session builder: {e}"))?
            .with_intra_threads(4)
            .map_err(|e| format!("Failed to set threads: {e}"))?
            .commit_from_file(&det_path)
            .map_err(|e| format!("Failed to load detection model: {e}"))?;

        let rec_session = Session::builder()
            .map_err(|e| format!("Failed to create recognition session builder: {e}"))?
            .with_intra_threads(4)
            .map_err(|e| format!("Failed to set threads: {e}"))?
            .commit_from_file(&rec_path)
            .map_err(|e| format!("Failed to load recognition model: {e}"))?;

        log::info!("Loaded face models from {}", models_dir.display());
        Ok(Self {
            det_session,
            rec_session,
        })
    }

    /// Run face detection + recognition on JPEG bytes.
    /// Returns detected faces with embeddings.
    pub fn detect_faces(
        &mut self,
        image_bytes: &[u8],
        threshold: f32,
    ) -> Result<Vec<DetectedFace>, String> {
        let img = image::load_from_memory(image_bytes)
            .map_err(|e| format!("Failed to decode image: {e}"))?
            .to_rgb8();

        let (orig_w, orig_h) = (img.width() as usize, img.height() as usize);

        // --- Detection ---
        let (input_tensor, det_scale) = preprocess_detection(&img);
        let det_input = Value::from_array(input_tensor)
            .map_err(|e| format!("Failed to create detection input: {e}"))?;
        let det_outputs = self
            .det_session
            .run(ort::inputs!["input.1" => det_input])
            .map_err(|e| format!("Detection inference failed: {e}"))?;

        let mut raw_faces = postprocess_detection(&det_outputs, det_scale, threshold)?;

        // NMS
        nms(&mut raw_faces, NMS_THRESHOLD);
        log::info!(
            "detect_faces: {}x{} -> {} faces",
            orig_w,
            orig_h,
            raw_faces.len()
        );

        // --- Recognition in batches ---
        const REC_BATCH_SIZE: usize = 8;
        let mut results = Vec::with_capacity(raw_faces.len());

        // Pre-align all faces
        let aligned_faces: Vec<image::RgbImage> = raw_faces
            .iter()
            .map(|face| align_face(&img, &face.landmarks))
            .collect();

        for chunk_start in (0..raw_faces.len()).step_by(REC_BATCH_SIZE) {
            let chunk_end = (chunk_start + REC_BATCH_SIZE).min(raw_faces.len());
            let batch_size = chunk_end - chunk_start;

            // Build batched tensor [N, 3, 112, 112]
            let mut batch_tensor =
                Array4::<f32>::zeros((batch_size, 3, REC_INPUT_SIZE, REC_INPUT_SIZE));
            for (bi, face_idx) in (chunk_start..chunk_end).enumerate() {
                let aligned = &aligned_faces[face_idx];
                for y in 0..REC_INPUT_SIZE {
                    for x in 0..REC_INPUT_SIZE {
                        let pixel = aligned.get_pixel(x as u32, y as u32);
                        batch_tensor[[bi, 0, y, x]] = (pixel[0] as f32 - 127.5) / 127.5;
                        batch_tensor[[bi, 1, y, x]] = (pixel[1] as f32 - 127.5) / 127.5;
                        batch_tensor[[bi, 2, y, x]] = (pixel[2] as f32 - 127.5) / 127.5;
                    }
                }
            }

            let rec_value = Value::from_array(batch_tensor)
                .map_err(|e| format!("Failed to create batched recognition input: {e}"))?;

            let rec_outputs = self
                .rec_session
                .run(ort::inputs!["input.1" => rec_value])
                .map_err(|e| format!("Batched recognition inference failed: {e}"))?;

            let emb_view = rec_outputs[0]
                .try_extract_tensor::<f32>()
                .map_err(|e| format!("Failed to extract batch embeddings: {e}"))?;

            let emb_data = emb_view.1;
            let emb_dim = if batch_size > 0 {
                emb_data.len() / batch_size
            } else {
                512
            };

            for bi in 0..batch_size {
                let face_idx = chunk_start + bi;
                let face = &raw_faces[face_idx];
                let raw_emb: Vec<f32> = emb_data[bi * emb_dim..(bi + 1) * emb_dim].to_vec();
                let embedding = l2_normalize(&raw_emb);

                let bbox = [
                    face.bbox[0].max(0.0).min(orig_w as f32),
                    face.bbox[1].max(0.0).min(orig_h as f32),
                    face.bbox[2].max(0.0).min(orig_w as f32),
                    face.bbox[3].max(0.0).min(orig_h as f32),
                ];

                results.push(DetectedFace {
                    bbox,
                    landmarks: face.landmarks,
                    score: face.score,
                    embedding,
                });
            }
        }

        Ok(results)
    }
}

// ---- Detection preprocessing ----

/// Resize image to 640x640 with padding, normalize, convert to NCHW RGB tensor.
fn preprocess_detection(img: &image::RgbImage) -> (Array4<f32>, f32) {
    let (w, h) = (img.width() as usize, img.height() as usize);
    let im_ratio = h as f32 / w as f32;

    let (new_w, new_h) = if im_ratio > 1.0 {
        let new_h = DET_INPUT_SIZE;
        let new_w = (new_h as f32 / im_ratio) as usize;
        (new_w, new_h)
    } else {
        let new_w = DET_INPUT_SIZE;
        let new_h = (new_w as f32 * im_ratio) as usize;
        (new_w, new_h)
    };

    let det_scale = new_h as f32 / h as f32;

    let resized = image::imageops::resize(
        img,
        new_w as u32,
        new_h as u32,
        image::imageops::FilterType::Triangle,
    );

    // Create NCHW RGB tensor with zero-padding
    // InsightFace SCRFD uses swapRB=True on BGR input → expects RGB channel order
    let mut tensor = Array4::<f32>::zeros((1, 3, DET_INPUT_SIZE, DET_INPUT_SIZE));
    for y in 0..new_h {
        for x in 0..new_w {
            let pixel = resized.get_pixel(x as u32, y as u32);
            // pixel from RgbImage is already [R, G, B] — pass through
            tensor[[0, 0, y, x]] = (pixel[0] as f32 - 127.5) / 128.0; // R
            tensor[[0, 1, y, x]] = (pixel[1] as f32 - 127.5) / 128.0; // G
            tensor[[0, 2, y, x]] = (pixel[2] as f32 - 127.5) / 128.0; // B
        }
    }

    (tensor, det_scale)
}

// ---- Detection postprocessing ----

struct RawFace {
    bbox: [f32; 4],
    landmarks: [[f32; 2]; 5],
    score: f32,
}

fn postprocess_detection(
    outputs: &SessionOutputs,
    det_scale: f32,
    threshold: f32,
) -> Result<Vec<RawFace>, String> {
    // det_10g outputs: 9 tensors
    // [0..3) = scores for strides 8,16,32
    // [3..6) = bboxes for strides 8,16,32
    // [6..9) = keypoints for strides 8,16,32
    let fmc = 3usize;
    let mut faces = Vec::new();

    for idx in 0..fmc {
        let scores_val = &outputs[idx];
        let bboxes_val = &outputs[idx + fmc];
        let kps_val = &outputs[idx + fmc * 2];

        let scores_data = scores_val
            .try_extract_tensor::<f32>()
            .map_err(|e| format!("Score extraction failed: {e}"))?
            .1;
        let bboxes_data = bboxes_val
            .try_extract_tensor::<f32>()
            .map_err(|e| format!("Bbox extraction failed: {e}"))?
            .1;
        let kps_data = kps_val
            .try_extract_tensor::<f32>()
            .map_err(|e| format!("Kps extraction failed: {e}"))?
            .1;

        let stride = STRIDES[idx];
        let feat_h = DET_INPUT_SIZE / stride;
        let feat_w = DET_INPUT_SIZE / stride;
        let num_predictions = feat_h * feat_w * NUM_ANCHORS;

        for i in 0..num_predictions {
            // Flat indexing: scores shape [1, N, 1] → data[i]
            let score = scores_data[i];
            if score < threshold {
                continue;
            }

            // Compute anchor center
            let anchor_idx = i / NUM_ANCHORS;
            let ay = anchor_idx / feat_w;
            let ax = anchor_idx % feat_w;
            let cx = (ax as f32) * stride as f32;
            let cy = (ay as f32) * stride as f32;

            // Decode bbox: shape [1, N, 4] → flat index i*4+j
            let left = bboxes_data[i * 4] * stride as f32;
            let top = bboxes_data[i * 4 + 1] * stride as f32;
            let right = bboxes_data[i * 4 + 2] * stride as f32;
            let bottom = bboxes_data[i * 4 + 3] * stride as f32;

            let x1 = (cx - left) / det_scale;
            let y1 = (cy - top) / det_scale;
            let x2 = (cx + right) / det_scale;
            let y2 = (cy + bottom) / det_scale;

            // Decode keypoints: shape [1, N, 10] → flat index i*10+k
            let mut landmarks = [[0.0f32; 2]; 5];
            for k in 0..5 {
                landmarks[k][0] = (cx + kps_data[i * 10 + k * 2] * stride as f32) / det_scale;
                landmarks[k][1] = (cy + kps_data[i * 10 + k * 2 + 1] * stride as f32) / det_scale;
            }

            faces.push(RawFace {
                bbox: [x1, y1, x2, y2],
                landmarks,
                score,
            });
        }
    }

    // Sort by score descending
    faces.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(faces)
}

fn nms(faces: &mut Vec<RawFace>, iou_threshold: f32) {
    let mut keep = vec![true; faces.len()];

    for i in 0..faces.len() {
        if !keep[i] {
            continue;
        }
        for j in (i + 1)..faces.len() {
            if !keep[j] {
                continue;
            }
            if iou(&faces[i].bbox, &faces[j].bbox) > iou_threshold {
                keep[j] = false;
            }
        }
    }

    let mut idx = 0;
    faces.retain(|_| {
        let k = keep[idx];
        idx += 1;
        k
    });
}

fn iou(a: &[f32; 4], b: &[f32; 4]) -> f32 {
    let ix1 = a[0].max(b[0]);
    let iy1 = a[1].max(b[1]);
    let ix2 = a[2].min(b[2]);
    let iy2 = a[3].min(b[3]);

    let inter_w = (ix2 - ix1).max(0.0);
    let inter_h = (iy2 - iy1).max(0.0);
    let inter_area = inter_w * inter_h;

    let area_a = (a[2] - a[0]) * (a[3] - a[1]);
    let area_b = (b[2] - b[0]) * (b[3] - b[1]);
    let union_area = area_a + area_b - inter_area;

    if union_area <= 0.0 {
        return 0.0;
    }
    inter_area / union_area
}

// ---- Face alignment (for recognition) ----

/// Align a detected face to 112x112 using similarity transform from 5 landmarks.
fn align_face(img: &image::RgbImage, landmarks: &[[f32; 2]; 5]) -> image::RgbImage {
    // Estimate similarity transform: landmarks -> ARCFACE_REF
    let (a, b, tx, ty) = estimate_similarity_transform(landmarks, &ARCFACE_REF);

    // The forward transform maps src (original image coords) → dst (112x112 coords):
    //   dst_x = a * src_x - b * src_y + tx
    //   dst_y = b * src_x + a * src_y + ty
    // For warping we need the inverse: given dst pixel, find src pixel.
    let det = a * a + b * b;
    if det < 1e-10 {
        // Degenerate transform, return a blank image.
        return image::RgbImage::new(REC_INPUT_SIZE as u32, REC_INPUT_SIZE as u32);
    }
    let inv_a = a / det;
    let inv_b = b / det;
    let inv_tx = -(a * tx + b * ty) / det;
    let inv_ty = (b * tx - a * ty) / det;

    let (w, h) = (img.width(), img.height());
    let mut aligned = image::RgbImage::new(REC_INPUT_SIZE as u32, REC_INPUT_SIZE as u32);

    for dy in 0..REC_INPUT_SIZE {
        for dx in 0..REC_INPUT_SIZE {
            let sx = inv_a * dx as f32 + inv_b * dy as f32 + inv_tx;
            let sy = -inv_b * dx as f32 + inv_a * dy as f32 + inv_ty;

            // Bilinear interpolation
            let sx0 = sx.floor() as i32;
            let sy0 = sy.floor() as i32;
            let fx = sx - sx0 as f32;
            let fy = sy - sy0 as f32;

            if sx0 >= 0 && sx0 + 1 < w as i32 && sy0 >= 0 && sy0 + 1 < h as i32 {
                let p00 = img.get_pixel(sx0 as u32, sy0 as u32);
                let p10 = img.get_pixel((sx0 + 1) as u32, sy0 as u32);
                let p01 = img.get_pixel(sx0 as u32, (sy0 + 1) as u32);
                let p11 = img.get_pixel((sx0 + 1) as u32, (sy0 + 1) as u32);

                let mut px = [0u8; 3];
                for c in 0..3 {
                    let v = p00[c] as f32 * (1.0 - fx) * (1.0 - fy)
                        + p10[c] as f32 * fx * (1.0 - fy)
                        + p01[c] as f32 * (1.0 - fx) * fy
                        + p11[c] as f32 * fx * fy;
                    px[c] = v.clamp(0.0, 255.0) as u8;
                }
                aligned.put_pixel(dx as u32, dy as u32, image::Rgb(px));
            }
        }
    }

    aligned
}

/// Estimate 2D similarity transform (a, b, tx, ty) from src to dst points.
/// Transform: dst_x = a*src_x - b*src_y + tx, dst_y = b*src_x + a*src_y + ty
fn estimate_similarity_transform(src: &[[f32; 2]; 5], dst: &[[f32; 2]; 5]) -> (f32, f32, f32, f32) {
    let n = 5.0f32;

    // Compute centroids
    let (mut src_mx, mut src_my) = (0.0f32, 0.0f32);
    let (mut dst_mx, mut dst_my) = (0.0f32, 0.0f32);
    for i in 0..5 {
        src_mx += src[i][0];
        src_my += src[i][1];
        dst_mx += dst[i][0];
        dst_my += dst[i][1];
    }
    src_mx /= n;
    src_my /= n;
    dst_mx /= n;
    dst_my /= n;

    // Center points
    let mut src_var = 0.0f32;
    let mut dot_xx = 0.0f32; // sum of (sx'*dx' + sy'*dy')
    let mut dot_xy = 0.0f32; // sum of (sx'*dy' - sy'*dx')

    for i in 0..5 {
        let sx = src[i][0] - src_mx;
        let sy = src[i][1] - src_my;
        let dx = dst[i][0] - dst_mx;
        let dy = dst[i][1] - dst_my;

        src_var += sx * sx + sy * sy;
        dot_xx += sx * dx + sy * dy;
        dot_xy += sx * dy - sy * dx;
    }

    if src_var < 1e-10 {
        return (1.0, 0.0, dst_mx - src_mx, dst_my - src_my);
    }

    let a = dot_xx / src_var;
    let b = dot_xy / src_var;
    let tx = dst_mx - a * src_mx + b * src_my;
    let ty = dst_my - b * src_mx - a * src_my;

    (a, b, tx, ty)
}

// ---- Recognition preprocessing ----

/// Create NCHW RGB tensor from aligned 112x112 face image.
#[allow(dead_code)]
fn preprocess_recognition(img: &image::RgbImage) -> Array4<f32> {
    let mut tensor = Array4::<f32>::zeros((1, 3, REC_INPUT_SIZE, REC_INPUT_SIZE));
    for y in 0..REC_INPUT_SIZE {
        for x in 0..REC_INPUT_SIZE {
            let pixel = img.get_pixel(x as u32, y as u32);
            // pixel from RgbImage is already [R, G, B] — pass through (ArcFace expects RGB)
            tensor[[0, 0, y, x]] = (pixel[0] as f32 - 127.5) / 127.5; // R
            tensor[[0, 1, y, x]] = (pixel[1] as f32 - 127.5) / 127.5; // G
            tensor[[0, 2, y, x]] = (pixel[2] as f32 - 127.5) / 127.5; // B
        }
    }
    tensor
}

fn l2_normalize(v: &[f32]) -> Vec<f32> {
    let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm < 1e-10 {
        return v.to_vec();
    }
    v.iter().map(|x| x / norm).collect()
}
