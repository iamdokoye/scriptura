# Changelog

All notable changes to Scriptura are listed here, newest first.

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
