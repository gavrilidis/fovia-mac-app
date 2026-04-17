use hmac::{Hmac, Mac};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

type HmacSha256 = Hmac<Sha256>;

/// Maximum number of days the app works offline before requiring an online check.
const GRACE_PERIOD_DAYS: u64 = 30;

/// Compile-time embedded secret (read from `FACEFLOW_SECRET` by build.rs).
const SECRET: &str = env!("FACEFLOW_SECRET");

/// Characters used in serial keys — no ambiguous glyphs (0/O, 1/I/L removed).
const CHARSET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/// Supabase configuration.
const SUPABASE_ANON_KEY: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmcXdjZGdkc2RqaGZod25nY3h1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMDgyNzMsImV4cCI6MjA5MTY4NDI3M30.u2HfA9EdDycryhbfK1DjTtvyS7Ya-P1ujgBqnAb5DAQ";
const ACTIVATE_FUNCTION_URL: &str = "https://bfqwcdgdsdjhfhwngcxu.supabase.co/functions/v1/activate";

#[derive(Debug, Deserialize)]
struct ActivationResponse {
    valid: bool,
    activated_at: Option<String>,
    expires_check: Option<String>,
    error: Option<String>,
}

/// Validate a serial key of the form `XXXXX-XXXXX-XXXXX-XXXXX-XXXXX`.
/// First 4 groups = random payload, 5th group = HMAC-derived checksum.
pub fn validate_key(key: &str) -> bool {
    let key = key.trim().to_uppercase();
    let parts: Vec<&str> = key.split('-').collect();
    if parts.len() != 5 {
        return false;
    }

    for part in &parts {
        if part.len() != 5 || !part.bytes().all(|b| CHARSET.contains(&b)) {
            return false;
        }
    }

    let payload = format!("{}{}{}{}", parts[0], parts[1], parts[2], parts[3]);
    let Some(expected) = compute_checksum(&payload) else {
        return false;
    };
    parts[4] == expected
}

fn compute_checksum(payload: &str) -> Option<String> {
    let mut mac = HmacSha256::new_from_slice(SECRET.as_bytes()).ok()?;
    mac.update(payload.as_bytes());
    let result = mac.finalize().into_bytes();

    let mut check = String::with_capacity(5);
    for &byte in result.iter().take(5) {
        check.push(CHARSET[(byte as usize) % CHARSET.len()] as char);
    }
    Some(check)
}

/// Get the macOS hardware UUID to uniquely identify this machine.
pub fn get_machine_id() -> Result<String, String> {
    let output = std::process::Command::new("ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()
        .map_err(|e| format!("Failed to run ioreg: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if line.contains("IOPlatformUUID") {
            if let Some(uuid) = line.split('"').nth(3) {
                return Ok(uuid.to_string());
            }
        }
    }
    Err("Could not find IOPlatformUUID".to_string())
}

fn activation_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))
}

async fn call_activation_function(
    client: &reqwest::Client,
    serial_key: &str,
    machine_id: &str,
) -> Result<ActivationResponse, String> {
    let payload = serde_json::json!({
        "serial_key": serial_key,
        "machine_id": machine_id,
    });
    let resp = client
        .post(ACTIVATE_FUNCTION_URL)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", SUPABASE_ANON_KEY))
        .header("Content-Type", "application/json")
        .body(payload.to_string())
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Response read error: {e}"))?;
    if !status.is_success() {
        return Err(format!("Activation server error ({}): {}", status, text));
    }
    serde_json::from_str::<ActivationResponse>(&text).map_err(|e| format!("JSON parse error: {e}"))
}

/// Activate a key online via Supabase Edge Function.
pub async fn activate_online(key: &str, machine_id: &str) -> Result<(), String> {
    let client = activation_client()?;
    let response = call_activation_function(&client, key, machine_id).await?;
    if response.valid {
        return Ok(());
    }
    Err(response
        .error
        .unwrap_or_else(|| "This serial number is already activated on another Mac.".to_string()))
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
    std::fs::create_dir_all(app_data).map_err(|e| format!("Failed to create app data dir: {e}"))?;
    let license_path = app_data.join("license.key");
    std::fs::write(&license_path, key.trim()).map_err(|e| format!("Failed to save license: {e}"))
}

/// Remove the stored license (deactivate).
pub fn remove_license(app_data: &Path) -> Result<(), String> {
    let license_path = app_data.join("license.key");
    if license_path.exists() {
        std::fs::remove_file(&license_path)
            .map_err(|e| format!("Failed to remove license: {e}"))?;
    }
    let primary = app_data.join("last_check.ts");
    if primary.exists() {
        let _ = std::fs::remove_file(primary);
    }
    if let Some(secondary) = secondary_last_check_path() {
        if secondary.exists() {
            let _ = std::fs::remove_file(secondary);
        }
    }
    Ok(())
}

fn derive_machine_hmac_key(machine_id: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(machine_id.as_bytes());
    hasher.update(b":");
    hasher.update(SECRET.as_bytes());
    let digest = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&digest);
    key
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

fn sign_timestamp(machine_id: &str, timestamp: u64) -> Option<String> {
    let key = derive_machine_hmac_key(machine_id);
    let mut mac = HmacSha256::new_from_slice(&key).ok()?;
    mac.update(timestamp.to_string().as_bytes());
    Some(hex_encode(&mac.finalize().into_bytes()))
}

fn write_last_check_file(path: &Path, timestamp: u64, machine_id: &str) -> Result<(), String> {
    let sig = sign_timestamp(machine_id, timestamp)
        .ok_or_else(|| "Failed to sign last_check timestamp".to_string())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create timestamp directory {}: {e}", parent.display()))?;
    }
    std::fs::write(path, format!("{timestamp}:{sig}"))
        .map_err(|e| format!("Failed to write {}: {e}", path.display()))
}

fn read_last_check_file(path: &Path, machine_id: &str) -> Result<Option<u64>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let content =
        std::fs::read_to_string(path).map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    let mut parts = content.trim().split(':');
    let ts = parts
        .next()
        .ok_or_else(|| format!("Invalid last_check format in {}", path.display()))?
        .parse::<u64>()
        .map_err(|_| format!("Invalid timestamp format in {}", path.display()))?;
    let sig = parts
        .next()
        .ok_or_else(|| format!("Missing signature in {}", path.display()))?;
    if parts.next().is_some() {
        return Err(format!("Invalid last_check structure in {}", path.display()));
    }
    let expected = sign_timestamp(machine_id, ts)
        .ok_or_else(|| format!("Failed to verify signature for {}", path.display()))?;
    if sig != expected {
        return Err(format!("Invalid last_check signature in {}", path.display()));
    }
    Ok(Some(ts))
}

fn secondary_last_check_path() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".faceflow_check"))
}

fn resolve_last_check_timestamp(app_data: &Path, machine_id: &str) -> Option<u64> {
    let primary = read_last_check_file(&app_data.join("last_check.ts"), machine_id).ok()?;
    let secondary = if let Some(path) = secondary_last_check_path() {
        read_last_check_file(&path, machine_id).ok()?
    } else {
        None
    };
    [primary, secondary].into_iter().flatten().max()
}

/// Save the current Unix timestamp as the last successful online check.
pub fn save_last_check(app_data: &Path, machine_id: &str) -> Result<(), String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Time error: {e}"))?
        .as_secs();
    let previous = resolve_last_check_timestamp(app_data, machine_id).unwrap_or(0);
    let ts = now.max(previous);
    write_last_check_file(&app_data.join("last_check.ts"), ts, machine_id)?;
    if let Some(path) = secondary_last_check_path() {
        write_last_check_file(&path, ts, machine_id)?;
    }
    Ok(())
}

/// Read verified last-online-check timestamp from mirrored files.
pub fn read_last_check(app_data: &Path, machine_id: &str) -> Option<u64> {
    resolve_last_check_timestamp(app_data, machine_id)
}

/// Check if the grace period has expired (more than 30 days since last online check).
pub fn is_grace_period_valid(app_data: &Path, machine_id: &str) -> bool {
    let Some(last_check) = read_last_check(app_data, machine_id) else {
        return false;
    };
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let elapsed_days = (now.saturating_sub(last_check)) / 86400;
    elapsed_days <= GRACE_PERIOD_DAYS
}

/// Perform a background online license check. Returns Ok(true) if still valid,
/// Ok(false) if the key was revoked / bound to another machine, and Err on
/// network failures (caller should fall back to grace period).
pub async fn background_check(key: &str, machine_id: &str) -> Result<bool, String> {
    let client = activation_client()?;
    let response = call_activation_function(&client, key, machine_id).await?;
    if response.valid {
        log::debug!(
            "Activation validated, activated_at={:?}, expires_check={:?}",
            response.activated_at,
            response.expires_check
        );
    }
    Ok(response.valid)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_serial_rejects_invalid_format() {
        assert!(!validate_key("INVALID"));
        assert!(!validate_key("AAAAA-BBBBB-CCCCC-DDDDD"));
        assert!(!validate_key("AAAAA-BBBBB-CCCCC-DDDDD-OOOOO"));
    }

    #[test]
    fn grace_period_signature_roundtrip() {
        let dir = std::env::temp_dir().join(format!("faceflow-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let machine_id = "machine-test-id";
        save_last_check(&dir, machine_id).expect("save_last_check");
        let ts = read_last_check(&dir, machine_id).expect("timestamp should exist");
        assert!(ts > 0);
        assert!(is_grace_period_valid(&dir, machine_id));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
