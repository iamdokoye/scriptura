use crate::types::{AppError, Result};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, PartialEq)]
pub enum ModuleType {
    Bible,
    Commentary,
    Lexicon,
    Dictionary,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Encoding {
    Latin1,
    Utf8,
}

#[derive(Debug, Clone, PartialEq)]
pub enum MarkupType {
    Osis,
    Gbf,
    ThMl,
    Plain,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Versification {
    Kjv,
    Nrsv,
    German,
    Luther,
    Vulgate,
    Catholic,
    Other(String),
}

#[derive(Debug, Clone, PartialEq)]
pub enum Compression {
    None,
    Zip, // zText / zLD
}

#[derive(Debug, Clone, PartialEq)]
pub enum BlockType {
    Book,
    Chapter,
    Verse,
}

/// Parsed representation of a SWORD .conf file
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ModuleConf {
    pub module_id: String,
    pub name: String,
    pub description: String,
    pub module_type: ModuleType,
    pub encoding: Encoding,
    pub markup: MarkupType,
    pub versification: Versification,
    pub compression: Compression,
    pub block_type: BlockType,
    pub cipher_key: Option<String>,
    pub feature: Vec<String>,
    pub data_path: String,
    pub language: String,
    pub version: String,
    pub strongs_zero_pad: bool,
    /// Bytes per idx entry: 6 for RawLD (u32 offset + u16 size), 8 for RawLD4 (u32 + u32)
    pub idx_entry_size: usize,
    pub raw: HashMap<String, String>,
}

impl ModuleConf {
    pub fn parse(module_id: &str, conf_path: &Path) -> Result<Self> {
        let content = fs::read_to_string(conf_path).map_err(|e| {
            AppError::Sword(format!("cannot read conf {}: {e}", conf_path.display()))
        })?;

        let mut raw: HashMap<String, String> = HashMap::new();
        for line in content.lines() {
            let line = line.trim();
            if line.starts_with('[') && line.ends_with(']') {
                continue;
            }
            if let Some(eq) = line.find('=') {
                let key = line[..eq].trim().to_lowercase();
                let value = line[eq + 1..].trim().to_string();
                raw.insert(key, value);
            }
        }

        let get = |k: &str| raw.get(k).cloned().unwrap_or_default();

        let module_type = match get("moddrv").to_lowercase().as_str() {
            "rawcom" | "zcom" | "commentary" => ModuleType::Commentary,
            "rawld" | "zld" | "lexdict" => ModuleType::Lexicon,
            "dictionary" => ModuleType::Dictionary,
            _ => ModuleType::Bible,
        };

        let compression = if matches!(
            get("moddrv").to_lowercase().as_str(),
            "ztext" | "zcom" | "zld"
        ) {
            Compression::Zip
        } else {
            Compression::None
        };

        let block_type = match get("blocktype").to_lowercase().as_str() {
            "book" => BlockType::Book,
            "verse" => BlockType::Verse,
            _ => BlockType::Chapter,
        };

        let markup = match get("sourcetype").to_lowercase().as_str() {
            "osis" => MarkupType::Osis,
            "gbf" => MarkupType::Gbf,
            "thml" => MarkupType::ThMl,
            _ => MarkupType::Plain,
        };

        let versification = match get("versification").to_lowercase().as_str() {
            "nrsv" | "nrsva" => Versification::Nrsv,
            "german" => Versification::German,
            "luther" => Versification::Luther,
            "vulgate" => Versification::Vulgate,
            "catholic" => Versification::Catholic,
            other if !other.is_empty() => Versification::Other(other.to_string()),
            _ => Versification::Kjv,
        };

        let feature: Vec<String> = get("feature")
            .split(',')
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty())
            .collect();

        let strongs_zero_pad = feature.contains(&"strongsnumbers".to_string())
            && !raw.contains_key("strongsnozeropad");

        // RawLD uses 6-byte idx entries (u32 offset + u16 size)
        // RawLD4 / zLD use 8-byte idx entries (u32 + u32)
        let idx_entry_size = if get("moddrv").to_lowercase() == "rawld" {
            6
        } else {
            8
        };

        Ok(Self {
            module_id: module_id.to_string(),
            name: get("description"),
            description: get("about"),
            module_type,
            encoding: if get("encoding").to_lowercase().contains("utf") {
                Encoding::Utf8
            } else {
                Encoding::Latin1
            },
            markup,
            versification,
            compression,
            block_type,
            cipher_key: raw.get("cipherkey").filter(|s| !s.is_empty()).cloned(),
            feature,
            data_path: get("datapath"),
            language: get("lang"),
            version: get("version"),
            strongs_zero_pad,
            idx_entry_size,
            raw,
        })
    }

    pub fn requires_cipher(&self) -> bool {
        // If the conf has a CipherKey field at all (even empty), the module is locked
        self.raw.contains_key("cipherkey")
    }
}
