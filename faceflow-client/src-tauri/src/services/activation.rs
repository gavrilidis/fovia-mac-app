use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

type HmacSha256 = Hmac<Sha256>;

/// Maximum number of days the app works offline before requiring an online check.
const GRACE_PERIOD_DAYS: u64 = 30;

/// Compile-time embedded secret (read from `activation.secret` via build.rs).
const SECRET: &str = env!("FACEFLOW_SECRET");

/// Characters used in serial keys — no ambiguous glyphs (0/O, 1/I/L removed).
const CHARSET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/// Supabase configuration.
const SUPABASE_URL: &str = "https://bfqwcdgdsdjhfhwngcxu.supabase.co";
const SUPABASE_ANON_KEY: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmcXdjZGdkc2RqaGZod25nY3h1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMDgyNzMsImV4cCI6MjA5MTY4NDI3M30.u2HfA9EdDycryhbfK1DjTtvyS7Ya-P1ujgBqnAb5DAQ";

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

/// Get the macOS hardware UUID to uniquely identify this machine.
pub fn get_machine_id() -> Result<String, String> {
    let output = std::process::Command::new("ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()
        .map_err(|e| format!("Failed to run ioreg: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if line.contains("IOPlatformUUID") {
            // Line looks like: "IOPlatformUUID" = "XXXXXXXX-XXXX-..."
            if let Some(uuid) = line.split('"').nth(3) {
                return Ok(uuid.to_string());
            }
        }
    }
    Err("Could not find IOPlatformUUID".to_string())
}

/// Activate a key online via Supabase. Returns Ok(()) if this key+machine pair
/// is accepted (first activation or same machine re-activation).
/// Returns Err if the key is already bound to a different machine.
pub async fn activate_online(key: &str, machine_id: &str) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    // Check if this key already exists in the database
    let check_url = format!(
        "{}/rest/v1/activations?serial_key=eq.{}&select=machine_id",
        SUPABASE_URL, key
    );
    let resp = client
        .get(&check_url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", SUPABASE_ANON_KEY))
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    let body = resp
        .text()
        .await
        .map_err(|e| format!("Response read error: {e}"))?;

    let records: Vec<serde_json::Value> =
        serde_json::from_str(&body).map_err(|e| format!("JSON parse error: {e}"))?;

    if let Some(existing) = records.first() {
        // Key exists — check if same machine
        let existing_machine = existing["machine_id"].as_str().unwrap_or("");
        if existing_machine == machine_id {
            // Same machine re-activation — update last_check timestamp
            let update_url = format!("{}/rest/v1/activations?serial_key=eq.{}", SUPABASE_URL, key);
            let _ = client
                .patch(&update_url)
                .header("apikey", SUPABASE_ANON_KEY)
                .header("Authorization", format!("Bearer {}", SUPABASE_ANON_KEY))
                .header("Content-Type", "application/json")
                .body(r#"{"last_check":"now()"}"#)
                .send()
                .await;
            return Ok(());
        } else {
            return Err("This serial number is already activated on another Mac.".to_string());
        }
    }

    // Key not yet registered — insert new activation
    let insert_url = format!("{}/rest/v1/activations", SUPABASE_URL);
    let payload = serde_json::json!({
        "serial_key": key,
        "machine_id": machine_id,
    });

    let resp = client
        .post(&insert_url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", SUPABASE_ANON_KEY))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=minimal")
        .body(payload.to_string())
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    if resp.status().is_success() || resp.status().as_u16() == 201 {
        Ok(())
    } else {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        // Unique constraint violation = key already taken by another machine
        if body.contains("duplicate") || body.contains("unique") {
            Err("This serial number is already activated on another Mac.".to_string())
        } else {
            Err(format!("Activation server error ({}): {}", status, body))
        }
    }
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
    let ts_path = app_data.join("last_check.ts");
    if ts_path.exists() {
        std::fs::remove_file(&ts_path).ok();
    }
    Ok(())
}

/// Save the current Unix timestamp as the last successful online check.
pub fn save_last_check(app_data: &Path) -> Result<(), String> {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Time error: {e}"))?
        .as_secs();
    let ts_path = app_data.join("last_check.ts");
    std::fs::write(&ts_path, ts.to_string()).map_err(|e| format!("Failed to save last_check: {e}"))
}

/// Read the stored last-online-check timestamp. Returns None if missing.
pub fn read_last_check(app_data: &Path) -> Option<u64> {
    let ts_path = app_data.join("last_check.ts");
    std::fs::read_to_string(&ts_path)
        .ok()
        .and_then(|s| s.trim().parse::<u64>().ok())
}

/// Check if the grace period has expired (more than 30 days since last online check).
pub fn is_grace_period_valid(app_data: &Path) -> bool {
    let Some(last_check) = read_last_check(app_data) else {
        // No timestamp recorded — treat as expired so the first run must go online
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
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let check_url = format!(
        "{}/rest/v1/activations?serial_key=eq.{}&select=machine_id",
        SUPABASE_URL, key
    );
    let resp = client
        .get(&check_url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", SUPABASE_ANON_KEY))
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    let body = resp
        .text()
        .await
        .map_err(|e| format!("Response read error: {e}"))?;

    let records: Vec<serde_json::Value> =
        serde_json::from_str(&body).map_err(|e| format!("JSON parse error: {e}"))?;

    if let Some(existing) = records.first() {
        let existing_machine = existing["machine_id"].as_str().unwrap_or("");
        if existing_machine == machine_id {
            // Update last_check on server
            let update_url = format!("{}/rest/v1/activations?serial_key=eq.{}", SUPABASE_URL, key);
            let _ = client
                .patch(&update_url)
                .header("apikey", SUPABASE_ANON_KEY)
                .header("Authorization", format!("Bearer {}", SUPABASE_ANON_KEY))
                .header("Content-Type", "application/json")
                .body(r#"{"last_check":"now()"}"#)
                .send()
                .await;
            return Ok(true);
        }
        // Key moved to different machine
        return Ok(false);
    }

    // Key not found in database at all
    Ok(false)
}
