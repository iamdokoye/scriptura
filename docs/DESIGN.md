---
name: Calm Editorial Precision
colors:
  surface: '#111319'
  surface-dim: '#111319'
  surface-bright: '#36393f'
  surface-container-lowest: '#0b0e13'
  surface-container-low: '#191c21'
  surface-container: '#1d2025'
  surface-container-high: '#272a30'
  surface-container-highest: '#32353a'
  on-surface: '#e1e2e9'
  on-surface-variant: '#c7c5d5'
  inverse-surface: '#e1e2e9'
  inverse-on-surface: '#2e3036'
  outline: '#918f9e'
  outline-variant: '#464553'
  surface-tint: '#c1c1ff'
  primary: '#c1c1ff'
  on-primary: '#1e1990'
  primary-container: '#8b8cff'
  on-primary-container: '#1e1991'
  inverse-primary: '#5050c0'
  secondary: '#f3be5b'
  on-secondary: '#422d00'
  secondary-container: '#8f6500'
  on-secondary-container: '#ffeed6'
  tertiary: '#5cdda8'
  on-tertiary: '#003825'
  tertiary-container: '#1aad7c'
  on-tertiary-container: '#003926'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c1c1ff'
  on-primary-fixed: '#0a006b'
  on-primary-fixed-variant: '#3736a7'
  secondary-fixed: '#ffdea9'
  secondary-fixed-dim: '#f3be5b'
  on-secondary-fixed: '#271900'
  on-secondary-fixed-variant: '#5e4100'
  tertiary-fixed: '#7afac3'
  tertiary-fixed-dim: '#5cdda8'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#005138'
  background: '#111319'
  on-background: '#e1e2e9'
  surface-variant: '#32353a'
typography:
  display-lg:
    fontFamily: Source Serif 4
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  display-md:
    fontFamily: Source Serif 4
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
  scripture-reading:
    fontFamily: Source Serif 4
    fontSize: 19px
    fontWeight: '400'
    lineHeight: 32px
  scripture-reading-mobile:
    fontFamily: Source Serif 4
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 28px
  scripture-poetry:
    fontFamily: Source Serif 4
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 32px
  ui-header:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
  ui-body:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  ui-medium:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  ui-subtext:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  metadata-mono:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
  verse-superscript:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 11px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style
The brand personality centers on quiet contemplation, monastic clarity, and technical speed. Designed for desktop environments—scholarship chambers, sanctuary presentation booths, and focused personal reflection—the interface recedes entirely to let the text command presence.

The aesthetic fuses **Editorial Minimalism** with **Selective Glassmorphism**:
- **80% Solid Grounding:** Deep, untextured, opaque canvas layers maximize legibility and reading stamina during prolonged study sessions.
- **20% Frosted Floating Chrome:** Modals, navigation sidebars, and control bars float above the textual plane using a 24px backdrop blur, 150% saturation, and razor-sharp hairline borders inspired by macOS native utilities, Linear, and Arc.
- **Atmospheric Context:** Floating chrome rests above extremely soft, warm radial ambient blooms (warm sand, deep indigo, soft teal) that register only peripherally, preventing sterile digital fatigue without interrupting typographic focus.

## Colors
The system defaults to dark mode for auditorium projection setups and late-night study, backed by a matching high-contrast daylight mode.

### Light Mode
- **Canvas Base:** `#F6F7F9` (cool stone)
- **Surface Elevation:** `#FFFFFF`
- **Ink Primary:** `#14181F`
- **Ink Muted (Secondary):** `#5D6675`
- **Hairline Dividers:** `rgba(20, 24, 31, 0.08)`
- **Glass Panel Surface:** `rgba(255, 255, 255, 0.72)` with border `rgba(255, 255, 255, 0.60)`

### Dark Mode (Default)
- **Canvas Base:** `#0E1116` (void black-blue)
- **Surface Elevation:** `#151A22` (deep obsidian)
- **Ink Primary:** `#ECEFF4` (soft paper white)
- **Ink Muted (Secondary):** `#8F99AA`
- **Hairline Dividers:** `rgba(255, 255, 255, 0.07)`
- **Glass Panel Surface:** `rgba(21, 26, 34, 0.72)` with border `rgba(255, 255, 255, 0.10)`

### Accents & Semantics
- **Interactive Accent:** `#8B8CFF` in dark mode (`#5B5BF0` in light mode) for focus rings, cursor carets, and active passage states.
- **Exegesis & Tags (Strong's Concordance, Bookmarks):** Warm Gold `#B8892B`.
- **System & Presentation Critical (Live Broadcast, Blackout, Destructive):** Crisp Crimson `#E5484D`.
- **Verified Status (Installed Modules, Synced):** Soft Jade `#2EB886`.

## Typography
Typographic hierarchy is bifurcated between literary exegesis and instrument-grade utility.

- **The Scripture Reader:** Rendered exclusively in `Source Serif 4`. Paragraph and verse layouts must never exceed a maximum text column width of 680px (approx. 65–72 characters per line) to maintain ideal eye movement. Line height is fixed at `1.7` (32px relative to 19px body text).
- **Verse Indicators:** Set in `Inter` semi-bold at 11px superscript with 4px left-spacing and 6px right-spacing. Verse numbers sit in secondary muted ink, transitioning to the primary accent color upon selection or cursor hover.
- **Metadata, Lexicon & Concordance:** Set in `JetBrains Mono` at 11px uppercase with `0.05em` letter-spacing, providing clear distinction for Strong's numbers (e.g., `H7225`, `G3056`), parallel translation IDs, and verse tokens.

## Layout & Spacing
Designed primarily for Tauri desktop target dimensions (1440x900 viewport base scale), applying a persistent dual-rail shell:

- **Primary Navigation Rail (Leftmost):** 56px collapsed / 240px expanded glass drawer.
- **Scripture Viewport (Center Stage):** Fluid column containing the centered 680px constrained reading column, with symmetrical padding that absorbs window resizing.
- **Inspector / Lexicon Panel (Right Dock):** 360px fixed-width surface pane, collapsible with keyboard shortcut or split-screen toggles.
- **Rhythm:** Spacing follows an exact 4px/8px modular scale. Component internal padding strictly uses `space-xs` (4px) to `space-md` (16px), maintaining dense yet breathable analytical desktop tool ergonomics.

## Elevation & Depth
Elevation is articulated through translucent optical physics rather than heavy drop shadows.

- **Layer 0 (Window Canvas):** Pure flat base tint (`#0E1116` / `#F6F7F9`).
- **Layer 1 (Card & Content Blocks):** Flat elevated surface (`#151A22` / `#FFFFFF`) bordered with a 1px hairline boundary (`rgba(255,255,255,0.07)` / `rgba(20,24,31,0.08)`). Zero box-shadow.
- **Layer 2 (Floating Floating Chrome, Command Bars, Floating Verse Actions):** Translucent frosted glass.
  - Backdrop filter: `blur(24px) saturate(150%)`.
  - Background fill: Dark mode `rgba(21, 26, 34, 0.72)`, Light mode `rgba(255, 255, 255, 0.75)`.
  - Border: 1px hairline matching the surface rim (`rgba(255, 255, 255, 0.12)` in dark mode, `rgba(255, 255, 255, 0.80)` in light mode).
  - Ambient Shadow: `0 8px 32px -4px rgba(0, 0, 0, 0.36)`.
- **Under-Glass Ambient Glow:** For live projection indicators or contextual lookups, subtle localized radial gradients (Indigo `#5B5BF0`, Warm Sand `#B8892B`, Soft Teal `#2EB886`) operate beneath glass surfaces at 12–15% opacity with 64px Gaussian dispersion.

## Shapes
Shapes emphasize desktop utility, using small, disciplined corner radiuses to reinforce a modern tool aesthetic:

- **Interactive Controls (Buttons, Inputs, Pill Badges):** `4px` or `8px` (`rounded-sm` / `rounded-md`).
- **Cards, Reference Tiles, and Commentary Blocks:** `8px` to `12px` (`rounded-md` / `rounded-lg`).
- **Floating Modals, Quick-Switcher HUD, and Flyout Drawers:** `12px` to `16px` (`rounded-lg` / `rounded-xl`).
- All glass elements mirror outer container radius minus internal padding to ensure optical nesting balance.

## Components

### Buttons & Interactive Triggers
- **Primary:** Filled accent (`#8B8CFF` dark / `#5B5BF0` light) with contrast ink (`#0E1116` or `#FFFFFF`), 8px border radius, 32px standard height, `Inter` 14px weight 500, padding `8px 14px`.
- **Glass / Secondary:** `rgba(255,255,255,0.06)` background, 1px hairline border, subtle hover state brightening to `rgba(255,255,255,0.12)`.
- **Ghost Action:** Pure text/icon button with hover background `rgba(255,255,255,0.04)`.

### Inputs & Quick-Switcher (HUD)
- **Command Palette (Cmd+K) & Search:** Floating glass panel centered at 600px width. Backdrop blur 24px, 1px perimeter hairline. Integrated search bar with 0-border, transparent background, large 18px text, and leading mono shortcut badges.
- **Form Inputs:** 32px height, 8px radius, solid surface background (`#151A22`), hairline outline. Focus state introduces a 1px primary accent stroke with `0 0 0 2px rgba(139, 140, 255, 0.20)`.

### Scripture Verse Interactivity
- **Verse Line:** Relative container with selectable text. Hover triggers an action button cluster (Copy, Highlight, Present, Lexicon) appearing inside a floating glass capsule 8px above the line.
- **Superscript Verse Tag:** Positioned at verse start, default muted secondary color, switching to accent gold on commentary bookmark.

### Tags & Chips
- **Strong's Concordance Tag:** Compact pill (`padding: 2px 6px`), radius 4px, font `JetBrains Mono` 11px. Tinted gold background (`rgba(184, 137, 43, 0.12)`) and text (`#B8892B`).
- **Live Presentation Badge:** Pulsing indicator dot (Crimson `#E5484D`), uppercase 10px tracking `0.08em`, glass backplate.

### Split-Pane & Commentary Cards
- Flat `#151A22` backgrounds with hairline separations. Top title bars feature 36px fixed heights, uppercase mono titles, and trailing action icons.