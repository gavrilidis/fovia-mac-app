use std::io::Write;
use std::path::{Path, PathBuf};

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

fn xmp_pick(status: &str) -> i32 {
    match status {
        "pick" => 1,
        "reject" => -1,
        _ => 0,
    }
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

pub fn write_xmp_sidecar(
    image_path: &str,
    rating: i32,
    color_label: &str,
    pick_status: &str,
) -> Result<(), String> {
    write_xmp_sidecar_with_keywords(image_path, None, rating, color_label, pick_status, &[])
        .map(|_| ())
}

pub fn write_xmp_sidecar_with_keywords(
    image_path: &str,
    output_dir: Option<&Path>,
    rating: i32,
    color_label: &str,
    pick_status: &str,
    keywords: &[String],
) -> Result<PathBuf, String> {
    let src = Path::new(image_path);
    let file_stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| format!("Invalid source file path: {image_path}"))?;
    let xmp_path = if let Some(dir) = output_dir {
        dir.join(format!("{file_stem}.xmp"))
    } else {
        src.with_extension("xmp")
    };

    if let Some(parent) = xmp_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            format!(
                "Failed to create XMP output directory {}: {e}",
                parent.display()
            )
        })?;
    }

    let label = xmp_label(color_label);
    let pick = xmp_pick(pick_status);
    let escaped_keywords: Vec<String> = keywords.iter().map(|k| xml_escape(k)).collect();

    let mut xml = String::with_capacity(1024);
    xml.push_str("<?xpacket begin=\"\u{feff}\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>\n");
    xml.push_str("<x:xmpmeta xmlns:x=\"adobe:ns:meta/\">\n");
    xml.push_str(" <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n");
    xml.push_str("  <rdf:Description rdf:about=\"\"\n");
    xml.push_str("   xmlns:xmp=\"http://ns.adobe.com/xap/1.0/\"\n");
    xml.push_str("   xmlns:dc=\"http://purl.org/dc/elements/1.1/\"\n");
    xml.push_str("   xmlns:photoshop=\"http://ns.adobe.com/photoshop/1.0/\">\n");
    xml.push_str(&format!(
        "   <xmp:Rating>{}</xmp:Rating>\n",
        rating.clamp(0, 5)
    ));
    if !label.is_empty() {
        xml.push_str(&format!("   <xmp:Label>{label}</xmp:Label>\n"));
    }
    xml.push_str(&format!("   <xmp:PickLabel>{pick}</xmp:PickLabel>\n"));
    if !escaped_keywords.is_empty() {
        xml.push_str("   <dc:subject><rdf:Bag>\n");
        for keyword in &escaped_keywords {
            xml.push_str(&format!("    <rdf:li>{keyword}</rdf:li>\n"));
        }
        xml.push_str("   </rdf:Bag></dc:subject>\n");
        xml.push_str(&format!(
            "   <photoshop:Keywords>{}</photoshop:Keywords>\n",
            escaped_keywords.join(";")
        ));
    }
    xml.push_str("  </rdf:Description>\n");
    xml.push_str(" </rdf:RDF>\n");
    xml.push_str("</x:xmpmeta>\n");
    xml.push_str("<?xpacket end=\"w\"?>\n");

    let mut file = std::fs::File::create(&xmp_path)
        .map_err(|e| format!("Failed to create XMP sidecar {}: {e}", xmp_path.display()))?;
    file.write_all(xml.as_bytes())
        .map_err(|e| format!("Failed to write XMP sidecar {}: {e}", xmp_path.display()))?;
    Ok(xmp_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn xml_escape_handles_all_special_chars() {
        assert_eq!(xml_escape("a&b<c>d\"e'"), "a&amp;b&lt;c&gt;d&quot;e&apos;");
        assert_eq!(xml_escape("plain"), "plain");
        assert_eq!(xml_escape(""), "");
    }

    #[test]
    fn xmp_label_maps_known_colors() {
        assert_eq!(xmp_label("red"), "Red");
        assert_eq!(xmp_label("blue"), "Blue");
        assert_eq!(xmp_label("none"), "");
        assert_eq!(xmp_label("unknown"), "");
    }

    #[test]
    fn xmp_pick_maps_status_codes() {
        assert_eq!(xmp_pick("pick"), 1);
        assert_eq!(xmp_pick("reject"), -1);
        assert_eq!(xmp_pick("none"), 0);
        assert_eq!(xmp_pick(""), 0);
    }
}
