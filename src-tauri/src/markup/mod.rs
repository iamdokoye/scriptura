pub mod gbf;
pub mod osis;
pub mod thml;

use crate::sword::conf::MarkupType;
use crate::types::{Result, TextSpan};

/// Dispatch to the appropriate parser based on the module's declared markup type.
/// Returns a structured list of text spans (not raw HTML).
pub fn parse(raw: &str, markup: &MarkupType) -> Result<Vec<TextSpan>> {
    if raw.trim().is_empty() {
        return Ok(vec![]);
    }
    match markup {
        MarkupType::Osis => osis::parse(raw),
        MarkupType::Gbf => gbf::parse(raw),
        MarkupType::ThMl => thml::parse(raw),
        MarkupType::Plain => Ok(vec![TextSpan::plain(raw.trim())]),
    }
}
