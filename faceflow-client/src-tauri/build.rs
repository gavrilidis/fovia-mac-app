fn main() {
    // Embed activation secret at compile time.
    // The file must exist locally but is .gitignore'd.
    let secret_path = std::path::Path::new("activation.secret");
    if secret_path.exists() {
        let secret = std::fs::read_to_string(secret_path)
            .expect("Failed to read activation.secret")
            .trim()
            .to_string();
        println!("cargo:rustc-env=FACEFLOW_SECRET={secret}");
    } else {
        // Fallback for CI/clean builds — no valid keys will work
        println!("cargo:rustc-env=FACEFLOW_SECRET=no_secret_configured");
    }
    println!("cargo:rerun-if-changed=activation.secret");

    tauri_build::build()
}
