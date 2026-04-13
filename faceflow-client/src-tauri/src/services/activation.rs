use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::path::Path;

type HmacSha256 = Hmac<Sha256>;

/// Compile-time embedded secret (read from `activation.secret` via build.rs).
const SECRET: &str = env!("FACEFLOW_SECRET");

/// Characters used in serial keys — no ambiguous glyphs (0/O, 1/I/L removed).
const CHARSET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/// Validate a serial key of the form `XXXXX-XXXXX-XXXXX-XXXXX-XXXXX`.
/// First 4 groups = random payload, 5th group = HMAC-derived checksum.
pub fn validate_key(key: &str) -> bool {
    let key = key.trim().to_uppercase();
    let parts: Vec<&str> = key.split('-').collect();
    if parts.len() != 5 {
        return false;
    }

    // Each group must be exactly 5 chars from our charset
    for part in &parts {
        if part.len() != 5 || !part.bytes().all(|b| CHARSET.contains(&b)) {
            return false;
        }
    }

    let payload = format!("{}{}{}{}", parts[0], parts[1], parts[2], parts[3]);
    let expected = compute_checksum(&payload);
    parts[4] == expected
}

/// Compute the 5-char HMAC checksum for a 20-char payload.
fn compute_checksum(payload: &str) -> String {
    let mut mac =
        HmacSha256::new_from_slice(SECRET.as_bytes()).expect("HMAC accepts any key length");
    mac.update(payload.as_bytes());
    let result = mac.finalize().into_bytes();

    // Map first 5 bytes of the HMAC digest to our charset
    let mut check = String::with_capacity(5);
    for &byte in result.iter().take(5) {
        check.push(CHARSET[(byte as usize) % CHARSET.len()] as char);
    }
    check
}

/// Check if a valid license key is stored on disk.
pub fn is_activated(app_data: &Path) -> bool {
    let license_path = app_data.join("license.key");
    if let Ok(contents) = std::fs::read_to_string(&license_path) {
        validate_key(contents.trim())
    } else {
        false
    }
}

/// Save a validated key to disk.
pub fn save_license(app_data: &Path, key: &str) -> Result<(), String> {
    std::fs::create_dir_all(app_data)
        .map_err(|e| format!("Failed to create app data dir: {e}"))?;
    let license_path = app_data.join("license.key");
    std::fs::write(&license_path, key.trim())
        .map_err(|e| format!("Failed to save license: {e}"))
}

/// Remove the stored license (deactivate).
pub fn remove_license(app_data: &Path) -> Result<(), String> {
    let license_path = app_data.join("license.key");
    if license_path.exists() {
        std::fs::remove_file(&license_path)
            .map_err(|e| format!("Failed to remove license: {e}"))?;
    }
    Ok(())
}
