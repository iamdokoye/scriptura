# Changelog

All notable changes to Scriptura are listed here, newest first.

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
