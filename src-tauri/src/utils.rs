pub fn format_size(bytes: u64) -> String {
    if bytes < 1024 { format!("{} B", bytes) }
    else if bytes < 1024 * 1024 { format!("{:.1} KB", bytes as f64 / 1024.0) }
    else if bytes < 1024 * 1024 * 1024 { format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0)) }
    else { format!("{:.1} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0)) }
}

pub fn detect_image_type(data: &[u8]) -> &str {
    if data.len() < 4 { return "image/webp"; }
    if data[0..2] == [0xFF, 0xD8] { return "image/jpeg"; }
    if data[0..4] == [0x89, 0x50, 0x4E, 0x47] { return "image/png"; }
    "image/webp"
}
