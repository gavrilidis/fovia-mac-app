use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use rand::RngCore;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri::Manager;

use crate::services::activation;

const SECRET_PREFIX: &str = "secret_";

fn derive_key_material(machine_id: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(machine_id.as_bytes());
    hasher.update(b":");
    hasher.update(env!("FACEFLOW_SECRET").as_bytes());
    let digest = hasher.finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(&digest);
    out
}

fn sanitize_key_name(key_name: &str) -> Result<String, String> {
    if key_name.is_empty() {
        return Err("Secret key name cannot be empty".to_string());
    }
    if !key_name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err("Secret key name contains unsupported characters".to_string());
    }
    Ok(key_name.to_string())
}

fn secret_path(app: &AppHandle, key_name: &str) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    let secrets_dir = app_data.join("secrets");
    std::fs::create_dir_all(&secrets_dir)
        .map_err(|e| format!("Failed to create secrets directory: {e}"))?;
    Ok(secrets_dir.join(format!("{SECRET_PREFIX}{key_name}.enc")))
}

fn encrypt_secret(plain: &str, machine_id: &str) -> Result<String, String> {
    let key = derive_key_material(machine_id);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("Cipher init failed: {e}"))?;

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let encrypted = cipher
        .encrypt(nonce, plain.as_bytes())
        .map_err(|e| format!("Encryption failed: {e}"))?;
    let mut combined = Vec::with_capacity(12 + encrypted.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&encrypted);
    Ok(BASE64.encode(combined))
}

fn decrypt_secret(encoded: &str, machine_id: &str) -> Result<String, String> {
    let raw = BASE64
        .decode(encoded)
        .map_err(|e| format!("Invalid secret encoding: {e}"))?;
    if raw.len() <= 12 {
        return Err("Encrypted secret payload is too short".to_string());
    }
    let key = derive_key_material(machine_id);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("Cipher init failed: {e}"))?;
    let (nonce_raw, payload) = raw.split_at(12);
    let nonce = Nonce::from_slice(nonce_raw);
    let plain = cipher
        .decrypt(nonce, payload)
        .map_err(|e| format!("Decryption failed: {e}"))?;
    String::from_utf8(plain).map_err(|e| format!("Secret is not valid UTF-8: {e}"))
}

fn read_secret_file(path: &Path) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let value = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read secret {}: {e}", path.display()))?;
    Ok(Some(value))
}

#[tauri::command]
pub fn save_secret(app: AppHandle, key_name: String, value: String) -> Result<(), String> {
    let key_name = sanitize_key_name(&key_name)?;
    let machine_id = activation::get_machine_id()?;
    let encrypted = encrypt_secret(&value, &machine_id)?;
    let path = secret_path(&app, &key_name)?;
    std::fs::write(&path, encrypted).map_err(|e| format!("Failed to save secret {}: {e}", path.display()))
}

#[tauri::command]
pub fn get_secret(app: AppHandle, key_name: String) -> Result<Option<String>, String> {
    let key_name = sanitize_key_name(&key_name)?;
    let machine_id = activation::get_machine_id()?;
    let path = secret_path(&app, &key_name)?;
    let Some(encoded) = read_secret_file(&path)? else {
        return Ok(None);
    };
    decrypt_secret(&encoded, &machine_id).map(Some)
}

#[tauri::command]
pub fn delete_secret(app: AppHandle, key_name: String) -> Result<(), String> {
    let key_name = sanitize_key_name(&key_name)?;
    let path = secret_path(&app, &key_name)?;
    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|e| format!("Failed to delete secret {}: {e}", path.display()))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let machine_id = "test-machine-id";
        let plain = "top-secret";
        let encrypted = encrypt_secret(plain, machine_id).expect("encrypt");
        let decrypted = decrypt_secret(&encrypted, machine_id).expect("decrypt");
        assert_eq!(plain, decrypted);
    }
}
