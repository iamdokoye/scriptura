# Changelog

All notable changes to Scriptura are listed here, newest first.

## [0.1.36] - 2026-10-23

### Added
- **Songs.** A new Songs tab in the Presentation workspace with a song library (title, author and copyright columns, search over lyrics, favourites and collections), a Song Editor (Words and Slides tabs, live slide preview, play order, Apply / OK / Cancel) and importers for plain text, CCLI SongSelect text and OpenLyrics files. Long sections split into evenly sized slides, with a lines-per-slide setting.
- **Song schedule, preview and live.** The Songs tab mirrors the Scriptures screen: Schedule, Preview and Live across the top, the library below. Double-click a song to add it to the schedule; Go Live sends slides to the output window, styled by your presentation theme. BLACK and CLEAR work on songs too. PageDown / PageUp step the live slide.

### Changed
- **Settings** fade and slide in and out, sections fade in as you switch, saved preferences load before the first open, and the feedback email uses the real app version.
- The Ask Scripture panel header lines up with the library's reference bar in the Live Show console.

## [0.1.35] - 2026-10-21

### Changed
- **New default look: Ink.** The default accent is now a warm near-black (warm off-white in dark mode), with cream and soft-charcoal surfaces. Indigo and the other accents are still available under Settings, Appearance. Existing installs keep their saved accent.
- **Sign-in and welcome emails** use the same cream and ink palette.

### Added
- **Settings redesigned** as a centred window with a section list on the left (Account, General, Appearance, Study Tools, Presentation, AI Scripture Search, Sync & Backup, Help, About) and one section at a time on the right. The Account section shows sign in or out, your current plan, today's Ask Scripture usage and a license key field (not active yet).
- **Account button and sign-in window**: a Sign in button in the top bar (your initial once signed in) opens a window where you enter your email and the code we send you. It also shows who you're signed in as, with Sign out and Delete account. There is an Account row in Settings too, and the Ask Scripture panel uses the same sign-in form.
- **Ask Scripture Claude Gateway**: Ask Scripture no longer requires a GPU service. Searches run through a Supabase Edge Function gateway backed directly by Anthropic Claude (Haiku 5.5). Users sign in with a 6-digit email code and search without needing to configure or supply any API keys.
- **Strict KJV Database Verification**: Every reference nominated by the AI is cross-checked against the 31,102 verses in the King James Bible (`kjv_verses` in Postgres). Hallucinated books or chapters are discarded, verse numbers are clamped, and passages are checked against real scripture text before reaching the user.
- **Privacy & Account Deletion**: Users can delete their account directly from Settings, cascading the deletion across all user data on the server. Question text is never stored in the database or logged in server telemetry.
- **Token & Cost Tracking**: Atomically tracks token usage per user with daily plan limits and a global spend circuit breaker, with live cost estimation based on active Anthropic model rates.
- **Advanced Connections**: Users can bring their own Anthropic Claude API key stored locally in Rust or connect to an own Modal search server.
- **Thayer's Greek Lexicon**: Full New Testament Greek Thayer definitions bundled offline (all 5,523 Strong's numbers G1–G5624) with hierarchical sense outlines and clickable Scripture references. Select "Thayer" via the pill toggle or set it as default in Settings.
- **Ask Scripture** in the Live Show console: a panel beside the verse list where you describe a passage, topic or feeling in plain words and get matching verses. Click a result to load it into Preview and select it. Sign in with your email (a one-time code, no password) and it searches through the Scriptura gateway, with a daily limit per account. Open it with the **Ask** button or `Mod+Shift+K`. Anyone who runs their own search server on Modal can connect it instead (`services/scripture-search/README.md`). Accounts, usage limits and the gateway live in `supabase/` (see its README).

### Changed
- Ask Scripture checks its own answers: Claude reads the real text of each candidate verse and only passages it judges a match or related are shown, labelled in the panel. If nothing fits it says so instead of guessing, and if the check can't run the results are marked as unchecked. The search service also uses a larger embedding model (Qwen3-Embedding-4B) and matches each verse together with its neighbours, so stories can be found by describing them.
- The Live Show search bar is now a single input with no modes. What you type decides what happens: `jn 3:16` or `v5` jumps to a verse, anything else searches the text, `/john` forces a text search for a word that is also a book name, and starting with `?` asks Ask Scripture. The icon and the tag at the right edge show what the bar decided. `Mod+K` and `Mod+L` both just focus the bar.

## [0.1.34] - 2026-10-18

### Fixed
- Version 0.1.33 never shipped: its build stopped on an unused variable in the Live Show console. Everything listed under 0.1.33 is in this release.

## [0.1.33] - 2026-10-18

### Added
- The Module Manager library opens instantly: a bundled catalog is shown straight away, the last downloaded catalog is cached between launches, and the live repositories refresh in parallel in the background.
- Select a range of scriptures in the library with Shift-click or Shift + arrow keys, then add the whole range to the schedule. `Mod+Q` now adds the previewed verse or selected range to the schedule, and the service queue drawer moved to `Mod+Shift+Q`.
- The Strong's sheet keeps the full lexicon entry for Abbott-Smith, BDB and LSJ: Greek and Hebrew words, Septuagint notes, and verse citations you can click, laid out as an indented outline of senses.

### Fixed
- Some Strong's lexicon entries were cut off or came out empty (for example G2149 and G4396) because one unclosed `[` in the source swallowed the rest of the entry.
- Lexicon entries from STEPBible no longer begin with a stray `: `, and TFLSJ sense numbers (`2)`, `II)`) are no longer left inside a dangling bold tag. Mismatched bold, italic and citation tags in the source are repaired.

## [0.1.32] - 2026-10-18

### Added
- The Live Show console now has an EasyWorship-style **Schedule | Preview | Live** layout: three columns across the top, with the verse library full-width below. Preview and Live each end in an output strip with a thumbnail of the real output screen, "Slide n of N" and previous/next arrows. Double-click a slide or a Schedule item to send it live, and the Live column's slides and arrows change the part on screen. This replaces the old Live display card, Main Output panel and "Next in queue" bar. Header buttons go icon-only below 1100 px so everything still fits the 900 px minimum width.

### Fixed
- The light/dark fade stuttered. It now cross-fades a snapshot of the old screen into the new one instead of repainting every frosted-glass layer each frame. Browsers without support for it, and people who ask their OS for reduced motion, switch instantly.
- In the new Live Show layout the columns touched each other and the headers were cramped. The columns now have a proper gutter between them, the Preview title no longer truncates, and the Preview and Live thumbnails are the same size.

## [0.1.31] - 2026-10-11

### Added
- Redesigned Theme Designer: a three-pane layout with a theme library, a canvas with undo/redo and zoom, and a collapsible inspector. It has configurable grids with optional snap-to-grid.
- Themes now control the live output's text: font size, line height and letter spacing come from the theme, so the text options in Settings only affect reading text. Existing themes were seeded from your current settings, so the live output looks the same after upgrading.
- Themes can have a picture background and a verse-box fill (what makes a lower-third bar).
- Two new built-in themes next to Midnight: **Lower Third** (chroma-key green with a bottom bar) and **Dusk Landscape** (a picture background). Built-in themes can't be deleted or edited in place, so duplicate one to make your own. The "New theme" menu also offers Plain background, Lower third and Picture background starting points.
- Switching between light and dark mode now fades instead of snapping. It is skipped when your OS asks for reduced motion.

### Fixed
- A fresh install showed "SWORD module error: data dir not found" for StrongsGreek instead of a Bible. The library counted lexicons as a readable Bible. Only a Bible can now be the reading module, and a first launch with no Bible installs the KJV automatically and opens it.
- The presentation top bar ran off the edge of the window at the 900 px minimum width, hiding Help, light/dark and Settings. It now drops its lowest-priority items as the window narrows.
- Dragging past the edge of the window, or a sheet sliding in, could scroll the whole page a few pixels and show a white stripe along the bottom. The page frame no longer scrolls.

## [0.1.30] - 2026-10-07

### Added
- Accent colour presets in Settings → Appearance: indigo (default), blue, teal, green, gold, orange and rose, each with light and dark shades. The choice is saved with your other preferences.
- Double-click a verse or split part in the Live Show verse list to send it to the live output. Strong's lookup on a word moved to Option/Alt-click, or a single click on the number tag that appears above the word on hover.
- Grammatical markers such as the Greek article (G3588) and the Hebrew direct-object marker (H853) no longer appear as Strong's tags. A phrase like "his hand" now offers only its real word.
- `docs/SHORTCUTS.md`: every keyboard shortcut and gesture in the app, with when each is active.

### Fixed
- The Abbott-Smith and Full LSJ tabs showed the article instead of the real word for a phrase like "the Spirit". Whether a number is a grammatical marker is now judged from the bundled Strong's entry for every lexicon.

## [0.1.29] - 2026-10-04

### Added
- The Live Show verse list now scrolls to the verse you select, whether you typed a reference, picked a word-search result, used the arrow keys or chose a queue item. It eases into place instead of jumping, and unfolding a split verse brings its parts into view.

### Fixed
- Text looked cramped with Strong's on. Line height now grows while Strong's is shown, and the dashed underlines sit lower and are softer.
- A Live Show panel could start collapsed if its saved size came from a window that hadn't been laid out yet. Panel sizes are now kept within their limits.

## [0.1.28] - 2026-10-04

### Added
- Light/dark mode toggle in the presentation top bar, next to Settings. It uses the same saved theme setting as Settings.

### Fixed
- Word search returned nothing for words with an apostrophe, such as "king's". Searches now split words the way the index does, and symbols like `-` or `:` in a search can no longer break it. Hyphenated words now match too.
- Split verses lost their Strong's tagging in the Live Show verse list and Preview. Each part now keeps the Strong's numbers, italics and headings of the words it covers.

## [0.1.27] - 2026-10-04

### Added
- Live Show reference bar: one button cycles between verse jump and word search. Word search shows highlighted matches as you type. `Ctrl+L` and `Ctrl+K` focus the two modes.
- A separate Strong's button turns Strong's concordance on or off. It uses the same saved setting as Settings.
- Resizable panels in the Live Show console: the Main Output and Queue column, the Main Output preview, the verse panel and the Preview column. The Ctrl+Q queue drawer can also be resized. Sizes are remembered, and double-clicking a divider resets it.
- Split verses show as one folded row with a `1/N` chip. Click it to unfold the parts. They fold again when you move to another verse.
- Presentation-mode shortcuts that only worked in the reading view: `Ctrl+P` / `Ctrl+N` (chapter), `Ctrl+Up` / `Ctrl+Down` (verse), `Ctrl +/-` and `Ctrl+Alt +/-` (font size), and `Alt+H` (history).

### Changed
- The Main Output panel now shows the real output screen, scaled down, instead of a rough thumbnail. Wrapping, text shrinking and verse parts match the live feed.

### Fixed
- Presentation-mode shortcuts did nothing while a text field had focus, and ignored Cmd on Mac. Ctrl and Cmd shortcuts now work from inside inputs.
- Verse splits in the console disagreed with the output screen. They were measured in physical monitor pixels, so on Retina displays long verses looked like they fit. The console now uses the output window's real size.

## [0.1.26] - 2026-10-04

### Added
- Presentation workspace v2: a top bar (tabs, LIVE / BLACK / CLEAR, Outputs, Themes, Settings) replaces the sidebar.
- Rebuilt Live Show console with a live display preview, service queue and verse list.
- Verse-part splitting, Strong's lookup and quick reference jump in the Live Show console. Console shortcuts restored.
- "Calm Editorial Precision" visual design: flat surfaces, frosted-glass chrome, consistent corner radii, quieter toolbar icons and firmer glass drawers.

### Fixed
- Psalm headings (canonical section titles) now render in bold when "Show Strong's numbers" is on. Every word of a heading carries a Strong's number, and that rendering path skipped the bold styling.

### Changed
- App version now matches the release. Manifests had stayed at 0.1.21 since v0.1.21.

## [0.1.25] - 2026-09-13

### Added
- Canonical section headings, such as Psalm superscriptions, are parsed from OSIS `<title>` and shown in bold.

### Fixed
- A missing space between a Psalm heading and the first line of the verse.

## [0.1.24] - 2026-09-13

### Fixed
- The split popup no longer disappears in the operator console on multi-monitor setups. Splits are now measured against the monitor the presentation is actually on, not always the first monitor.

## [0.1.23] - 2026-09-13

### Fixed
- Long verses such as Esther 8:9 are split into as many parts as they need. Parts are no longer capped at two lines, and the last part is no longer squeezed with the overflow.

## [0.1.22] - 2026-09-13

### Fixed
- Verse splitting only produced parts "a" and "b" for long verses.

## [0.1.21] - 2026-09-13

### Changed
- Verse splitting measures the text in a hidden element sized like the real presentation box, replacing the character-count estimate. It adapts to screen size, font and margins.

## [0.1.20] - 2026-09-13

### Fixed
- The split threshold was too high, so long verses such as John 3:16 were not split.

## [0.1.19] - 2026-09-13

### Added
- Clickable part chips on the operator console, with the active part highlighted.

## [0.1.18] - 2026-09-13

### Fixed
- Restored the three-line target for verse splitting.

## [0.1.17] - 2026-09-06

### Added
- Verse splitting that adapts to the presentation view.
- Ctrl+Up / Ctrl+Down verse navigation.

## [0.1.16] - 2026-08-30

### Added
- Book-scoped search: filter by Old Testament, New Testament or specific books.

## [0.1.15] - 2026-08-30

### Changed
- Presentation sync improvements between the operator console and the output window.

## [0.1.14] - 2026-08-30

### Added
- Verse splitting for long verses.
- Configurable scroll padding.
- Alignment grid.

### Fixed
- Reference label placement.

Earlier releases are not itemized here. See the commit history for details.
