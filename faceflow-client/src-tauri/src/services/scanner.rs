use std::path::{Path, PathBuf};
use walkdir::WalkDir;

const RAW_EXTENSIONS: &[&str] = &["cr2", "arw", "raw", "nef", "dng", "orf", "rw2", "raf"];
const IMAGE_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "bmp", "tiff", "tif", "webp", "heic", "heif", "avif", "gif",
];

pub fn is_raw_extension(ext: &str) -> bool {
    RAW_EXTENSIONS.contains(&ext.to_lowercase().as_str())
}

pub fn find_image_files(root: &Path) -> Vec<PathBuf> {
    WalkDir::new(root)
        .follow_links(true)
        .into_iter()
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry.file_type().is_file()
                && entry
                    .path()
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .is_some_and(|ext| {
                        let lower = ext.to_lowercase();
                        RAW_EXTENSIONS.contains(&lower.as_str())
                            || IMAGE_EXTENSIONS.contains(&lower.as_str())
                    })
        })
        .map(|entry| entry.into_path())
        .collect()
}
