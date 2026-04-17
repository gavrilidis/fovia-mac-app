fn main() {
    let env_secret = std::env::var("FACEFLOW_SECRET").ok();
    let file_secret = std::fs::read_to_string("activation.secret")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());
    let secret = env_secret
        .filter(|v| !v.trim().is_empty())
        .or(file_secret)
        .expect(
            "FACEFLOW secret not configured. Set FACEFLOW_SECRET or create src-tauri/activation.secret for local development.",
        );
    println!("cargo:rustc-env=FACEFLOW_SECRET={secret}");
    println!("cargo:rerun-if-changed=activation.secret");
    println!("cargo:rerun-if-env-changed=FACEFLOW_SECRET");

    tauri_build::build()
}
