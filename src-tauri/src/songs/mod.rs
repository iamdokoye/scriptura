use std::io::Read;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

use quick_xml::events::Event;
use quick_xml::Reader;

use crate::db::Database;
use crate::types::{AppError, ImportResult, Song, SongSection};

// ── ID generation ─────────────────────────────────────────────────────────────

fn new_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64;
    let c = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{:016x}{:08x}", t, c)
}

// ── PPTX parser ───────────────────────────────────────────────────────────────

pub fn parse_pptx(path: &Path) -> Result<Song, AppError> {
    let file = std::fs::File::open(path)?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| AppError::Other(e.to_string()))?;

    // Collect and sort slide entries numerically
    let slide_names: Vec<String> = {
        let mut pairs: Vec<(u32, String)> = (0..archive.len())
            .filter_map(|i| {
                let name = archive.by_index(i).ok()?.name().to_owned();
                if name.starts_with("ppt/slides/slide") && name.ends_with(".xml") {
                    let n = name
                        .strip_prefix("ppt/slides/slide")?
                        .strip_suffix(".xml")?
                        .parse::<u32>()
                        .ok()?;
                    Some((n, name))
                } else {
                    None
                }
            })
            .collect();
        pairs.sort_by_key(|(n, _)| *n);
        pairs.into_iter().map(|(_, name)| name).collect()
    };

    if slide_names.is_empty() {
        return Err(AppError::Other("No slides found in PPTX".into()));
    }

    let title = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Imported Song")
        .to_string();

    let mut sections: Vec<SongSection> = Vec::new();

    for (i, slide_name) in slide_names.iter().enumerate() {
        let mut bytes = Vec::new();
        archive
            .by_name(slide_name)
            .map_err(|e| AppError::Other(e.to_string()))?
            .read_to_end(&mut bytes)?;

        let text = extract_slide_text(&bytes).trim().to_string();
        if text.is_empty() {
            continue;
        }
        sections.push(SongSection {
            label: format!("Slide {}", i + 1),
            content: text,
        });
    }

    let section_order = sections.iter().map(|s| s.label.clone()).collect();

    Ok(Song {
        id: new_id(),
        title,
        author: None,
        copyright: None,
        sections,
        section_order,
        tags: vec![],
        source: "pptx".into(),
        created_at: String::new(),
    })
}

fn extract_slide_text(xml: &[u8]) -> String {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);

    let mut paragraphs: Vec<String> = Vec::new();
    let mut cur_para: Vec<String> = Vec::new();
    let mut in_txbody = false;
    let mut in_para = false;
    let mut in_run = false;
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => match e.local_name().as_ref() {
                b"txBody" => in_txbody = true,
                b"p" if in_txbody => {
                    in_para = true;
                    cur_para.clear();
                }
                b"r" if in_para => in_run = true,
                _ => {}
            },
            Ok(Event::End(e)) => match e.local_name().as_ref() {
                b"txBody" => in_txbody = false,
                b"p" if in_txbody => {
                    in_para = false;
                    let line = cur_para.join("").trim().to_string();
                    if !line.is_empty() {
                        paragraphs.push(line);
                    }
                    cur_para.clear();
                }
                b"r" => in_run = false,
                _ => {}
            },
            Ok(Event::Text(e)) if in_run => {
                if let Ok(t) = e.unescape() {
                    cur_para.push(t.into_owned());
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    paragraphs.join("\n")
}

// ── EWSX parser ───────────────────────────────────────────────────────────────

pub fn parse_ewsx(path: &Path) -> Result<Vec<Song>, AppError> {
    let bytes = std::fs::read(path)?;
    parse_ewsx_bytes(&bytes)
}

fn parse_ewsx_bytes(bytes: &[u8]) -> Result<Vec<Song>, AppError> {
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);

    let mut songs: Vec<Song> = Vec::new();
    let mut buf = Vec::new();

    let mut cur_title = String::new();
    let mut cur_author: Option<String> = None;
    let mut cur_copyright: Option<String> = None;
    let mut cur_sections: Vec<SongSection> = Vec::new();
    let mut cur_order: Vec<String> = Vec::new();
    let mut cur_label = String::new();
    let mut in_song = false;
    let mut in_lyrics = false;
    let mut in_verse = false;
    let mut in_order = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                let local_bytes = e.local_name().as_ref().to_ascii_lowercase();
                let local = std::str::from_utf8(&local_bytes).unwrap_or("");

                match local {
                    "song" => {
                        in_song = true;
                        cur_title.clear();
                        cur_author = None;
                        cur_copyright = None;
                        cur_sections.clear();
                        cur_order.clear();

                        for attr in e.attributes().flatten() {
                            let key = attr.key.as_ref().to_ascii_lowercase();
                            let key = std::str::from_utf8(&key).unwrap_or("");
                            let val = attr
                                .decode_and_unescape_value(reader.decoder())
                                .map(|v| v.into_owned())
                                .unwrap_or_default();
                            match key {
                                "title" => cur_title = val,
                                "author" => {
                                    if !val.is_empty() {
                                        cur_author = Some(val);
                                    }
                                }
                                "copyright" => {
                                    if !val.is_empty() {
                                        cur_copyright = Some(val);
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    "lyrics" if in_song => in_lyrics = true,
                    "verse" | "slide" if in_lyrics => {
                        in_verse = true;
                        let mut caption = String::new();
                        let mut type_name = String::new();
                        let mut number = String::new();
                        for attr in e.attributes().flatten() {
                            let key = attr.key.as_ref().to_ascii_lowercase();
                            let key = std::str::from_utf8(&key).unwrap_or("");
                            let val = attr
                                .decode_and_unescape_value(reader.decoder())
                                .map(|v| v.into_owned())
                                .unwrap_or_default();
                            match key {
                                "caption" | "label" => caption = val,
                                "type" => type_name = val,
                                "number" => number = val,
                                _ => {}
                            }
                        }
                        cur_label = if !caption.is_empty() {
                            caption
                        } else if !type_name.is_empty() {
                            if !number.is_empty() {
                                format!("{type_name} {number}")
                            } else {
                                type_name
                            }
                        } else {
                            format!("Section {}", cur_sections.len() + 1)
                        };
                    }
                    "slideorder" | "order" if in_song => in_order = true,
                    _ => {}
                }
            }
            Ok(Event::End(e)) => {
                let local_bytes = e.local_name().as_ref().to_ascii_lowercase();
                let local = std::str::from_utf8(&local_bytes).unwrap_or("");
                match local {
                    "song" if in_song => {
                        if !cur_title.is_empty() || !cur_sections.is_empty() {
                            let title = if cur_title.is_empty() {
                                "Untitled".into()
                            } else {
                                cur_title.clone()
                            };
                            let section_order = if cur_order.is_empty() {
                                cur_sections.iter().map(|s| s.label.clone()).collect()
                            } else {
                                cur_order.clone()
                            };
                            songs.push(Song {
                                id: new_id(),
                                title,
                                author: cur_author.clone(),
                                copyright: cur_copyright.clone(),
                                sections: cur_sections.clone(),
                                section_order,
                                tags: vec![],
                                source: "ewsx".into(),
                                created_at: String::new(),
                            });
                        }
                        in_song = false;
                    }
                    "lyrics" => in_lyrics = false,
                    "verse" | "slide" => in_verse = false,
                    "slideorder" | "order" => in_order = false,
                    _ => {}
                }
            }
            Ok(Event::Text(e)) if in_verse => {
                if let Ok(text) = e.unescape() {
                    let content = text.trim().to_string();
                    if !content.is_empty() {
                        cur_sections.push(SongSection {
                            label: cur_label.clone(),
                            content,
                        });
                        in_verse = false;
                    }
                }
            }
            Ok(Event::CData(e)) if in_verse => {
                let content = std::str::from_utf8(e.as_ref())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if !content.is_empty() {
                    cur_sections.push(SongSection {
                        label: cur_label.clone(),
                        content,
                    });
                    in_verse = false;
                }
            }
            Ok(Event::Text(e)) if in_order => {
                if let Ok(text) = e.unescape() {
                    cur_order = text
                        .split([' ', ','])
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect();
                }
                in_order = false;
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(songs)
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_songs(db: tauri::State<'_, Database>) -> std::result::Result<Vec<Song>, String> {
    db.list_songs().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_song(
    id: String,
    db: tauri::State<'_, Database>,
) -> std::result::Result<Option<Song>, String> {
    db.get_song(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_song(song: Song, db: tauri::State<'_, Database>) -> std::result::Result<(), String> {
    db.upsert_song(&song).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_song(id: String, db: tauri::State<'_, Database>) -> std::result::Result<(), String> {
    db.delete_song(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_pptx_songs(
    paths: Vec<String>,
    db: tauri::State<'_, Database>,
) -> std::result::Result<ImportResult, String> {
    let mut imported = 0usize;
    let mut skipped = 0usize;
    let mut errors: Vec<String> = Vec::new();

    for path_str in &paths {
        let path = Path::new(path_str);
        let file_name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();

        match parse_pptx(path) {
            Ok(song) if song.sections.is_empty() => skipped += 1,
            Ok(song) => match db.upsert_song(&song) {
                Ok(_) => imported += 1,
                Err(e) => errors.push(format!("{file_name}: {e}")),
            },
            Err(e) => errors.push(format!("{file_name}: {e}")),
        }
    }

    Ok(ImportResult { imported, skipped, errors })
}

#[tauri::command]
pub fn import_ewsx_songs(
    path: String,
    db: tauri::State<'_, Database>,
) -> std::result::Result<ImportResult, String> {
    let songs = parse_ewsx(Path::new(&path)).map_err(|e| e.to_string())?;
    let total = songs.len();
    let mut imported = 0usize;
    let mut errors: Vec<String> = Vec::new();

    for song in songs {
        if song.sections.is_empty() {
            continue;
        }
        match db.upsert_song(&song) {
            Ok(_) => imported += 1,
            Err(e) => errors.push(format!("{}: {e}", song.title)),
        }
    }

    Ok(ImportResult {
        imported,
        skipped: total.saturating_sub(imported + errors.len()),
        errors,
    })
}
