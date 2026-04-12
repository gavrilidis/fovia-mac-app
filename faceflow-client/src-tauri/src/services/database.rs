use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS scans (
    id          TEXT    PRIMARY KEY,
    folder_path TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    total_files INTEGER NOT NULL DEFAULT 0,
    total_faces INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS scanned_files (
    file_path   TEXT    PRIMARY KEY,
    scan_id     TEXT    NOT NULL,
    file_hash   TEXT    NOT NULL,
    FOREIGN KEY (scan_id) REFERENCES scans(id)
);

CREATE TABLE IF NOT EXISTS faces (
    face_id         TEXT    PRIMARY KEY,
    scan_id         TEXT    NOT NULL,
    file_path       TEXT    NOT NULL,
    bbox_x1         REAL    NOT NULL,
    bbox_y1         REAL    NOT NULL,
    bbox_x2         REAL    NOT NULL,
    bbox_y2         REAL    NOT NULL,
    embedding       BLOB    NOT NULL,
    detection_score REAL    NOT NULL,
    preview_jpeg    BLOB,
    FOREIGN KEY (scan_id) REFERENCES scans(id)
);

CREATE TABLE IF NOT EXISTS photo_metadata (
    file_path    TEXT    PRIMARY KEY,
    rating       INTEGER NOT NULL DEFAULT 0,
    color_label  TEXT    NOT NULL DEFAULT 'none',
    pick_status  TEXT    NOT NULL DEFAULT 'none',
    quality_score REAL,
    blur_score    REAL,
    closed_eyes   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT    NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS photo_tags (
    file_path TEXT    NOT NULL,
    tag_id    INTEGER NOT NULL,
    PRIMARY KEY (file_path, tag_id),
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_faces_scan   ON faces(scan_id);
CREATE INDEX IF NOT EXISTS idx_faces_file   ON faces(file_path);
CREATE INDEX IF NOT EXISTS idx_scanned_scan ON scanned_files(scan_id);
CREATE INDEX IF NOT EXISTS idx_photo_tags_file ON photo_tags(file_path);
CREATE INDEX IF NOT EXISTS idx_photo_meta_rating ON photo_metadata(rating);
CREATE INDEX IF NOT EXISTS idx_photo_meta_label ON photo_metadata(color_label);
CREATE INDEX IF NOT EXISTS idx_photo_meta_pick ON photo_metadata(pick_status);
";

/// Open (or create) the database at the given path and apply the schema.
pub fn open_database(db_path: &Path) -> Result<Connection, String> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create database directory: {e}"))?;
    }

    let conn = Connection::open(db_path).map_err(|e| format!("Failed to open database: {e}"))?;

    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .map_err(|e| format!("Failed to set pragmas: {e}"))?;

    conn.execute_batch(SCHEMA)
        .map_err(|e| format!("Failed to create schema: {e}"))?;

    Ok(conn)
}

// ---- Scan records ----

pub fn insert_scan(
    conn: &Connection,
    scan_id: &str,
    folder_path: &str,
    total_files: usize,
    total_faces: usize,
) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO scans (id, folder_path, total_files, total_faces) VALUES (?1, ?2, ?3, ?4)",
        params![scan_id, folder_path, total_files as i64, total_faces as i64],
    )
    .map_err(|e| format!("Failed to insert scan: {e}"))?;
    Ok(())
}

/// Update the totals on an existing scan record.
pub fn update_scan_totals(
    conn: &Connection,
    scan_id: &str,
    total_files: usize,
    total_faces: usize,
) -> Result<(), String> {
    conn.execute(
        "UPDATE scans SET total_files = ?1, total_faces = ?2 WHERE id = ?3",
        params![total_files as i64, total_faces as i64, scan_id],
    )
    .map_err(|e| format!("Failed to update scan totals: {e}"))?;
    Ok(())
}

// ---- Scanned files (for incremental scanning) ----

/// Check if a file was already scanned (returns its hash if so).
pub fn get_file_hash(conn: &Connection, file_path: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT file_hash FROM scanned_files WHERE file_path = ?1",
        params![file_path],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|e| format!("Failed to query file hash: {e}"))
}

/// Mark a file as scanned with its hash.
pub fn insert_scanned_file(
    conn: &Connection,
    file_path: &str,
    scan_id: &str,
    file_hash: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO scanned_files (file_path, scan_id, file_hash) VALUES (?1, ?2, ?3)",
        params![file_path, scan_id, file_hash],
    )
    .map_err(|e| format!("Failed to insert scanned file: {e}"))?;
    Ok(())
}

// ---- Faces ----

/// Delete all face records for a specific file (used before re-scanning).
pub fn delete_faces_for_file(conn: &Connection, file_path: &str) -> Result<(), String> {
    conn.execute("DELETE FROM faces WHERE file_path = ?1", params![file_path])
        .map_err(|e| format!("Failed to delete faces for file: {e}"))?;
    Ok(())
}

/// Insert a face record. Embedding is stored as raw f32 bytes (little-endian).
pub fn insert_face(
    conn: &Connection,
    face_id: &str,
    scan_id: &str,
    file_path: &str,
    bbox: &[f64; 4],
    embedding: &[f32],
    detection_score: f64,
    preview_jpeg: Option<&[u8]>,
) -> Result<(), String> {
    // Store embedding as raw bytes (4 bytes per f32, little-endian)
    let emb_bytes: Vec<u8> = embedding.iter().flat_map(|v| v.to_le_bytes()).collect();

    conn.execute(
        "INSERT OR REPLACE INTO faces (face_id, scan_id, file_path, bbox_x1, bbox_y1, bbox_x2, bbox_y2, embedding, detection_score, preview_jpeg)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            face_id,
            scan_id,
            file_path,
            bbox[0],
            bbox[1],
            bbox[2],
            bbox[3],
            emb_bytes,
            detection_score,
            preview_jpeg,
        ],
    )
    .map_err(|e| format!("Failed to insert face: {e}"))?;
    Ok(())
}

/// Load faces for a given folder. Deduplicates by keeping only the most recent scan's faces per file.
pub fn load_faces_for_folder(conn: &Connection, folder_path: &str) -> Result<Vec<FaceRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT f.face_id, f.file_path, f.bbox_x1, f.bbox_y1, f.bbox_x2, f.bbox_y2,
                    f.embedding, f.detection_score, f.preview_jpeg
             FROM faces f
             JOIN scanned_files sf ON f.file_path = sf.file_path
                                   AND f.scan_id = sf.scan_id
             JOIN scans s ON s.id = sf.scan_id
             WHERE s.folder_path = ?1
             ORDER BY f.file_path",
        )
        .map_err(|e| format!("Failed to prepare query: {e}"))?;

    let rows = stmt
        .query_map(params![folder_path], |row| {
            let emb_bytes: Vec<u8> = row.get(6)?;
            let embedding: Vec<f32> = emb_bytes
                .chunks_exact(4)
                .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
                .collect();

            Ok(FaceRow {
                face_id: row.get(0)?,
                file_path: row.get(1)?,
                bbox: [row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?],
                embedding,
                detection_score: row.get(7)?,
                preview_jpeg: row.get(8)?,
            })
        })
        .map_err(|e| format!("Failed to query faces: {e}"))?;

    let mut faces = Vec::new();
    for row in rows {
        faces.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(faces)
}

pub struct FaceRow {
    pub face_id: String,
    pub file_path: String,
    pub bbox: [f64; 4],
    pub embedding: Vec<f32>,
    pub detection_score: f64,
    pub preview_jpeg: Option<Vec<u8>>,
}

// ---- Photo metadata (rating, label, pick/reject) ----

pub fn ensure_photo_metadata(conn: &Connection, file_path: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR IGNORE INTO photo_metadata (file_path) VALUES (?1)",
        params![file_path],
    )
    .map_err(|e| format!("Failed to ensure photo metadata: {e}"))?;
    Ok(())
}

pub fn set_rating(conn: &Connection, file_path: &str, rating: i32) -> Result<(), String> {
    ensure_photo_metadata(conn, file_path)?;
    conn.execute(
        "UPDATE photo_metadata SET rating = ?1 WHERE file_path = ?2",
        params![rating.clamp(0, 5), file_path],
    )
    .map_err(|e| format!("Failed to set rating: {e}"))?;
    Ok(())
}

pub fn set_color_label(conn: &Connection, file_path: &str, label: &str) -> Result<(), String> {
    ensure_photo_metadata(conn, file_path)?;
    conn.execute(
        "UPDATE photo_metadata SET color_label = ?1 WHERE file_path = ?2",
        params![label, file_path],
    )
    .map_err(|e| format!("Failed to set color label: {e}"))?;
    Ok(())
}

pub fn set_pick_status(conn: &Connection, file_path: &str, status: &str) -> Result<(), String> {
    ensure_photo_metadata(conn, file_path)?;
    conn.execute(
        "UPDATE photo_metadata SET pick_status = ?1 WHERE file_path = ?2",
        params![status, file_path],
    )
    .map_err(|e| format!("Failed to set pick status: {e}"))?;
    Ok(())
}

pub fn set_quality_metrics(
    conn: &Connection,
    file_path: &str,
    quality_score: f64,
    blur_score: f64,
    closed_eyes: bool,
) -> Result<(), String> {
    ensure_photo_metadata(conn, file_path)?;
    conn.execute(
        "UPDATE photo_metadata SET quality_score = ?1, blur_score = ?2, closed_eyes = ?3 WHERE file_path = ?4",
        params![quality_score, blur_score, closed_eyes as i32, file_path],
    )
    .map_err(|e| format!("Failed to set quality metrics: {e}"))?;
    Ok(())
}

#[derive(Debug)]
pub struct PhotoMetaRow {
    pub file_path: String,
    pub rating: i32,
    pub color_label: String,
    pub pick_status: String,
    pub quality_score: Option<f64>,
    pub blur_score: Option<f64>,
    pub closed_eyes: bool,
}

pub fn get_photo_metadata(conn: &Connection, file_path: &str) -> Result<Option<PhotoMetaRow>, String> {
    conn.query_row(
        "SELECT file_path, rating, color_label, pick_status, quality_score, blur_score, closed_eyes FROM photo_metadata WHERE file_path = ?1",
        params![file_path],
        |row| {
            Ok(PhotoMetaRow {
                file_path: row.get(0)?,
                rating: row.get(1)?,
                color_label: row.get(2)?,
                pick_status: row.get(3)?,
                quality_score: row.get(4)?,
                blur_score: row.get(5)?,
                closed_eyes: row.get::<_, i32>(6)? != 0,
            })
        },
    )
    .optional()
    .map_err(|e| format!("Failed to get photo metadata: {e}"))
}

pub fn get_all_photo_metadata(conn: &Connection, file_paths: &[String]) -> Result<Vec<PhotoMetaRow>, String> {
    if file_paths.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders: Vec<String> = file_paths.iter().enumerate().map(|(i, _)| format!("?{}", i + 1)).collect();
    let sql = format!(
        "SELECT file_path, rating, color_label, pick_status, quality_score, blur_score, closed_eyes FROM photo_metadata WHERE file_path IN ({})",
        placeholders.join(",")
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("Failed to prepare metadata query: {e}"))?;
    let params: Vec<&dyn rusqlite::types::ToSql> = file_paths.iter().map(|s| s as &dyn rusqlite::types::ToSql).collect();
    let rows = stmt.query_map(params.as_slice(), |row| {
        Ok(PhotoMetaRow {
            file_path: row.get(0)?,
            rating: row.get(1)?,
            color_label: row.get(2)?,
            pick_status: row.get(3)?,
            quality_score: row.get(4)?,
            blur_score: row.get(5)?,
            closed_eyes: row.get::<_, i32>(6)? != 0,
        })
    }).map_err(|e| format!("Failed to query metadata: {e}"))?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(result)
}

// ---- Tags ----

pub fn create_tag(conn: &Connection, name: &str) -> Result<i64, String> {
    conn.execute(
        "INSERT OR IGNORE INTO tags (name) VALUES (?1)",
        params![name],
    )
    .map_err(|e| format!("Failed to create tag: {e}"))?;
    let id = conn.query_row(
        "SELECT id FROM tags WHERE name = ?1",
        params![name],
        |row| row.get::<_, i64>(0),
    )
    .map_err(|e| format!("Failed to get tag id: {e}"))?;
    Ok(id)
}

pub fn delete_tag(conn: &Connection, tag_id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM tags WHERE id = ?1", params![tag_id])
        .map_err(|e| format!("Failed to delete tag: {e}"))?;
    Ok(())
}

pub fn list_tags(conn: &Connection) -> Result<Vec<(i64, String)>, String> {
    let mut stmt = conn.prepare("SELECT id, name FROM tags ORDER BY name")
        .map_err(|e| format!("Failed to prepare tags query: {e}"))?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| format!("Failed to query tags: {e}"))?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(result)
}

pub fn add_photo_tag(conn: &Connection, file_path: &str, tag_id: i64) -> Result<(), String> {
    conn.execute(
        "INSERT OR IGNORE INTO photo_tags (file_path, tag_id) VALUES (?1, ?2)",
        params![file_path, tag_id],
    )
    .map_err(|e| format!("Failed to add photo tag: {e}"))?;
    Ok(())
}

pub fn remove_photo_tag(conn: &Connection, file_path: &str, tag_id: i64) -> Result<(), String> {
    conn.execute(
        "DELETE FROM photo_tags WHERE file_path = ?1 AND tag_id = ?2",
        params![file_path, tag_id],
    )
    .map_err(|e| format!("Failed to remove photo tag: {e}"))?;
    Ok(())
}

pub fn get_tags_for_photo(conn: &Connection, file_path: &str) -> Result<Vec<(i64, String)>, String> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name FROM tags t JOIN photo_tags pt ON t.id = pt.tag_id WHERE pt.file_path = ?1 ORDER BY t.name"
    ).map_err(|e| format!("Failed to prepare photo tags query: {e}"))?;
    let rows = stmt.query_map(params![file_path], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| format!("Failed to query photo tags: {e}"))?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(result)
}
