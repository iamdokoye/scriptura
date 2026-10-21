use crate::types::{AppError, StrongsEntry};
use flate2::read::GzDecoder;
use once_cell::sync::Lazy;
use serde::Deserialize;
use std::collections::HashMap;

const THAYER_GREEK_GZ: &[u8] = include_bytes!("thayer_greek.json.gz");

#[derive(Debug, Clone, Deserialize)]
struct RawThayerEntry {
    number: String,
    lemma: String,
    transliteration: String,
    part_of_speech: String,
    short_def: String,
    long_def: String,
}

static THAYER_ENTRIES: Lazy<HashMap<String, RawThayerEntry>> = Lazy::new(|| {
    let gz = GzDecoder::new(THAYER_GREEK_GZ);
    serde_json::from_reader(gz).unwrap_or_default()
});

pub fn get_entry(strongs_number: &str) -> Result<StrongsEntry, AppError> {
    let n = crate::sword::lexicon::parse_strongs_number(strongs_number)?;
    let key = format!("G{n}");

    let raw = THAYER_ENTRIES
        .get(&key)
        .ok_or_else(|| AppError::Sword(format!("Thayer: entry {strongs_number} not found")))?;

    Ok(StrongsEntry {
        number: raw.number.clone(),
        lemma: raw.lemma.clone(),
        transliteration: raw.transliteration.clone(),
        part_of_speech: raw.part_of_speech.clone(),
        short_def: raw.short_def.clone(),
        long_def: raw.long_def.clone(),
        usage_count: 0,
        usage_by_book: vec![],
        is_untranslated_marker: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_morphe_g3444_thayer_entry() {
        let entry = get_entry("G3444").unwrap();
        assert_eq!(entry.number, "G3444");
        assert!(entry.lemma.contains("μορφ"));
        assert!(entry.short_def.contains("form"));
        assert!(entry
            .long_def
            .contains("the form by which a person or thing strikes the vision"));
        assert!(entry.long_def.contains("external appearance"));
        assert!(entry.long_def.contains("Origin:"));
    }

    #[test]
    fn parses_padded_and_unpadded_numbers() {
        let e1 = get_entry("G0026").unwrap();
        let e2 = get_entry("G26").unwrap();
        assert_eq!(e1.number, "G26");
        assert_eq!(e2.number, "G26");
        assert!(e1.long_def.contains("brotherly love"));
    }
}
