pub mod bible;
pub mod conf;
pub mod crossref;
pub mod file_cache;
pub mod lexicon;
pub mod stepbible;

pub use bible::BibleReader;
#[allow(unused_imports)]
pub use conf::{ModuleConf, ModuleType};
pub use lexicon::LexiconReader;

/// Shared low-level block/compression utilities used by both bible and lexicon readers.
pub mod block {
    use crate::types::{AppError, Result};
    use flate2::read::ZlibDecoder;
    use std::io::Read;

    pub fn decompress_zlib(data: &[u8]) -> Result<Vec<u8>> {
        let mut out = Vec::new();
        ZlibDecoder::new(data)
            .read_to_end(&mut out)
            .map_err(|e| AppError::Sword(format!("zlib decompress failed: {e}")))?;
        Ok(out)
    }

    /// Read a little-endian u32 from a byte slice at the given offset
    pub fn read_u32_le(data: &[u8], offset: usize) -> Option<u32> {
        data.get(offset..offset + 4)
            .map(|b| u32::from_le_bytes(b.try_into().unwrap()))
    }

    /// Read a little-endian u16
    pub fn read_u16_le(data: &[u8], offset: usize) -> Option<u16> {
        data.get(offset..offset + 2)
            .map(|b| u16::from_le_bytes(b.try_into().unwrap()))
    }

    /// Read a null-terminated string from data at offset
    #[allow(dead_code)]
    pub fn read_cstr(data: &[u8], offset: usize) -> Option<&str> {
        let slice = &data[offset..];
        let end = slice.iter().position(|&b| b == 0)?;
        std::str::from_utf8(&slice[..end]).ok()
    }
}

#[allow(dead_code)]
pub trait ModuleReader {
    fn module_id(&self) -> &str;
}
