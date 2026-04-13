use std::io::Write;
use std::path::Path;

/// Map FaceFlow color labels to XMP xmp:Label values recognised by Adobe Lightroom and Capture One.
fn xmp_label(color: &str) -> &str {
    match color {
        "red" => "Red",
        "yellow" => "Yellow",
        "green" => "Green",
        "blue" => "Blue",
        "purple" => "Purple",
        _ => "",
    }
}

/// Map FaceFlow pick_status to XMP xmp:PickLabel integer.
/// Lightroom convention: 1 = Picked, -1 = Rejected, 0 = Unflagged.
fn xmp_pick(status: &str) -> i32 {
    match status {
        "pick" => 1,
        "reject" => -1,
        _ => 0,
    }
}

/// Write (or overwrite) an Adobe-compatible XMP sidecar for the given image file.
///
/// The sidecar is placed alongside the original:  
///   `/photos/DSC_1234.NEF` → `/photos/DSC_1234.xmp`
///
/// Fields written:
/// - `xmp:Rating`   (0-5)
/// - `xmp:Label`    (Red, Yellow, Green, Blue, Purple, or empty)
/// - `xmp:PickLabel` (1 / -1 / 0 — Lightroom flag)
pub fn write_xmp_sidecar(
    image_path: &str,
    rating: i32,
    color_label: &str,
    pick_status: &str,
) -> Result<(), String> {
    let src = Path::new(image_path);
    let xmp_path = src.with_extension("xmp");

    let label = xmp_label(color_label);
    let pick = xmp_pick(pick_status);

    // Build minimal but standards-compliant XMP packet.
    // Uses only the `xmp:` namespace so both Lightroom and Capture One pick it up.
    let mut xml = String::with_capacity(512);
    xml.push_str("<?xpacket begin=\"\u{feff}\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>\n");
    xml.push_str("<x:xmpmeta xmlns:x=\"adobe:ns:meta/\">\n");
    xml.push_str(" <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n");
    xml.push_str("  <rdf:Description rdf:about=\"\"\n");
    xml.push_str("   xmlns:xmp=\"http://ns.adobe.com/xap/1.0/\">\n");

    xml.push_str(&format!("   <xmp:Rating>{rating}</xmp:Rating>\n"));

    if !label.is_empty() {
        xml.push_str(&format!("   <xmp:Label>{label}</xmp:Label>\n"));
    }

    xml.push_str(&format!("   <xmp:PickLabel>{pick}</xmp:PickLabel>\n"));

    xml.push_str("  </rdf:Description>\n");
    xml.push_str(" </rdf:RDF>\n");
    xml.push_str("</x:xmpmeta>\n");
    xml.push_str("<?xpacket end=\"w\"?>\n");

    let mut file = std::fs::File::create(&xmp_path)
        .map_err(|e| format!("Failed to create XMP sidecar {}: {e}", xmp_path.display()))?;
    file.write_all(xml.as_bytes())
        .map_err(|e| format!("Failed to write XMP sidecar {}: {e}", xmp_path.display()))?;

    log::info!("Wrote XMP sidecar: {}", xmp_path.display());
    Ok(())
}
