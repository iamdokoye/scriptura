# Lovable prompt: Scriptura UI v2 mock screens

Paste everything below the line into Lovable.

---

Design a set of high-fidelity, clickable mock UI screens for **Scriptura**, a desktop Bible study and church presentation app (Tauri window, 1440×900 default, min 1100×700). React + Tailwind + lucide-react icons. All data is hardcoded mock data. No backend.

## 1. Product context

Scriptura is an open-source alternative to e-Sword and Xiphos. It has two workspaces, toggled from the top bar:

- **Study**: personal Bible reading and research.
- **Presentation**: everything in Study, plus a Live Show console and a Customization Studio for projecting verses to a second screen at church.

I already have a layout I like. **Keep the layout and information architecture exactly as described in section 3. Replace the entire visual design** (colors, shadows, surfaces, radii, typography treatment, iconography style) with the design language in section 2.

## 2. Design language: Neumorphism + Glassmorphism, used with discipline

Use the two styles for different jobs so the app stays legible:

**Neumorphism = the base and the controls.** Soft, tactile, extruded surfaces.
- The app background is a single flat soft tone. Every raised element uses the same background color, with a dual shadow: a light highlight at top-left and a darker shadow at bottom-right.
- Raised (idle): `box-shadow: 8px 8px 16px var(--shadow-dark), -8px -8px 16px var(--shadow-light)`.
- Pressed or active (inset): `inset 6px 6px 12px var(--shadow-dark), inset -6px -6px 12px var(--shadow-light)`.
- Use for: nav rail buttons, toolbar buttons, toggles, sliders, segmented controls, verse-number chips, chapter-number grid buttons, text inputs (inset), progress tracks (inset), and cards in the library.
- Corner radii: 14px for controls, 20px for cards, 28px for large panels. Pill shape for toggles and chips.
- Keep shadows soft and low contrast. No hard borders. A 1px `rgba(255,255,255,0.4)` top-edge highlight is allowed.

**Glassmorphism = the floating layers.** Anything that sits above the base.
- Panels that float: the top bar, the right study-panel sheets (Strong's, Commentary, Cross-references, Notes, Compare), the Service Queue drawer, the search palette (⌘K), modals, popovers, dropdowns, tooltips, toasts, and the Live Show "now live" card.
- Recipe: `background: rgba(255,255,255,0.45)` (light) or `rgba(30,34,44,0.45)` (dark), `backdrop-filter: blur(20px) saturate(160%)`, `border: 1px solid rgba(255,255,255,0.35)`, soft diffuse shadow `0 20px 50px rgba(0,0,0,0.12)`, radius 24px.
- Behind the glass, place a subtle blurred ambient gradient (two or three large soft color blobs) in the app background so the blur is visible, but keep it quiet enough that reading text never sits on a busy area.

**Rule of thumb:** the Bible text itself is always printed on a calm, high-contrast, solid or near-solid neumorphic surface, never on glass over busy color. Neumorphism is for things you press, glass is for things that float.

**Color**
- Light theme: base `#E6EAF1` (cool pearl), shadow-light `#FFFFFF`, shadow-dark `#B8C0CF`, text `#1F2633`, secondary text `#5B6577`.
- Dark theme: base `#1B1F2A`, shadow-light `#262B38`, shadow-dark `#11141B`, text `#E8EBF2`, secondary text `#9AA3B5`.
- One accent: a deep sapphire-to-violet `#4F5BD5 → #7B5CE0`. Use it for the active nav item glow, primary buttons (raised with a slight gradient), the focus ring, selected verse highlight, and the "Live" state. Add a warm gold `#C9A24B` as a small secondary accent for bookmarks and the Strong's number tags. Red `#E5484D` is reserved for LIVE and destructive actions.
- Ensure WCAG AA contrast for all text. Neumorphic controls must have a clear icon or label contrast even though the surface matches the background.

**Typography**
- UI: Hanken Grotesk (14px base). Headings 600 weight.
- Scripture text: Source Serif 4, 18–20px, line-height 1.7.
- Metadata, references, badges: JetBrains Mono, 11–12px, uppercase with letter-spacing 0.05em.
- Verse numbers: small superscript chip, 11px bold, inset neumorphic circle.

**Iconography**: thin-stroke rounded icons (Lucide), 20px, inside neumorphic buttons. Active icon gets the accent color and a soft glow.

**Motion** (show states in static form where needed): 150–200ms ease. Press animates from raised to inset. Glass panels slide in with fade. Hover on raised elements lifts the shadow slightly.

## 3. Layout to preserve (do not change structure)

Global shell:
- **Top bar (48px, glass)**: left: app wordmark "Scriptura" and a Study/Presentation workspace toggle. Center: a reference breadcrumb (Book › Chapter) and a search field with a scope icon on its left and a "⌘K" hint. Right: icon buttons: Service Queue (with count badge, Presentation only), Split/Parallel view, Text size, Theme (light/dark/system), Settings.
- **Left nav rail (64px collapsed, expands to 200px on hover, neumorphic)**: icons with labels. Study order: Library, Bookmarks, Search, History, Modules, Notes. Presentation order: Live Show, Library, Customize, Search, Modules, Bookmarks, Notes, History. The active item is shown inset with an accent glow bar.
- **Main content area** fills the rest. Right-side study sheets and the Service Queue slide over it as glass panels.

Screens to produce (each as its own route, with the shell, in light AND dark theme via a toggle):

1. **Reading view (Library)**: three columns. (a) Book navigator pane (collapsible accordion of 66 books grouped Old/New Testament, expanding to a chapter-number grid of raised square buttons, current chapter inset and accent-colored). (b) Scripture pane: chapter title, verses with superscript number chips, a selected verse highlighted with a soft accent tint, Strong's-tagged words shown with a subtle dotted underline, prev/next chapter buttons at the bottom. Support a **parallel mode** with 2–3 translation panes side by side (KJV / ESV / NASB), each with a small translation dropdown header, scroll sync indicator. (c) Right study panel as a glass sheet with tabs: **Strong's / Lexicon**, **Commentary**, **Cross-references**, **Notes**, **Compare**. Show a verse action popover (glass) on verse click: Highlight (color swatches), Bookmark, Add note, Copy, Add to Service Queue (Presentation only), Study.
2. **Strong's lexicon sheet** (open state): large Greek/Hebrew word, transliteration, G/H number tag in gold, pronunciation, short definition, extended definition, usage count, pill switcher (Brown-Driver-Briggs / TBESG / LSJ), list of verses where it appears.
3. **Search results**: scope bar (Whole Bible, OT, NT, current book, custom) as a segmented neumorphic control; results grouped by book with highlighted match terms; filters on the left; result count and sort dropdown.
4. **Fullscreen search palette (⌘K)**: centered glass modal, big inset input, scope chips, recent searches, keyboard-hint footer.
5. **Search history**: timeline list with re-run and delete actions.
6. **Bookmarks and Notes**: two-pane. Left: folders/tags, search. Right: bookmark cards (reference, verse snippet, colored dot, tags) and a notes editor with a mini toolbar (bold, italic, list, link verse).
7. **Module manager**: grid of module cards (Bible, Commentary, Lexicon, Dictionary) with cover art placeholders, language flag, size, install/update/remove state, download progress ring (inset track), and a category segmented filter. Include an **empty library / first-run** state with a friendly illustration and a primary "Install your first Bible" button.
8. **Settings**: modal (glass) with sections: Appearance (theme cards, accent swatches, font size slider, reading font), Reading (show Strong's, verse numbers, red-letter), Workspace (Study / Presentation), Data & Import, About.
9. **Live Show console (Presentation)**: split layout. Left large "Now live" glass card showing the current verse in big serif plus a LIVE badge. Right 320px column: a 16:9 output preview thumbnail (dark), then the Queue list (drag handles, index numbers, reference, 2-line snippet, a LIVE tag on the active item), with Clear and Reorder actions. A "Next in queue" strip along the bottom of the top section. Below, a 42% height lower dock containing the chapter/verse picker to send verses to the queue or live (prev/next/blank/freeze big raised buttons).
10. **Service Queue drawer**: 300px glass drawer sliding from the right with the same list, drag-and-drop, delete-all, empty state.
11. **Customization Studio (Presentation)**: header with title "Presentation themes" and a "New theme" button. Two columns: left a theme library list (each card has a mini gradient preview, name, default star, alignment and scale meta). Right: theme editor form (name, font select, size slider, alignment segmented control, text color and background color pickers, gradient editor, shadow/outline toggles, safe-area/margin controls) with a large live 16:9 preview that mirrors changes. Save and Reset buttons.
12. **Output / presentation window**: the projected 16:9 screen only. Show 3 sample themes (dark gradient, light parchment, lower-third overlay).
13. **Compare / Commentary / Cross-reference / Notes sheets** as separate states of the right glass panel.
14. **Component sheet** (route `/styleguide`): every reusable piece in one place for light and dark: buttons (primary, secondary, ghost, danger, icon), toggles, sliders, segmented controls, inputs (default, focus, error), chips/badges, tabs, cards, list rows, tooltips, toasts, modals, dropdowns, progress, empty states, color tokens, type scale, elevation scale (flat / raised / inset / glass).

## 4. Modularity requirements (important)

- Build a small **design system first**, then screens from it. Define all tokens as CSS variables (colors, shadow-light, shadow-dark, radii, blur, spacing, type) with a `.dark` class swap. Tailwind config references the variables.
- Create reusable primitives, each with variants and states: `NeuSurface` (raised | inset | flat), `GlassPanel`, `NeuButton`, `NeuIconButton`, `NeuToggle`, `NeuSlider`, `NeuInput`, `SegmentedControl`, `Chip`, `Tabs`, `Card`, `ListRow`, `Modal`, `Drawer`, `Popover`, `Tooltip`, `Toast`, `EmptyState`, `ProgressRing`.
- Compose larger blocks from the primitives as independent modules: `TopBar`, `NavRail`, `BookNavigator`, `ScripturePane`, `ParallelPanes`, `StudySheet` (plus a tab content module for each), `VerseActionPopover`, `QueueList`, `OutputPreview`, `ThemeEditor`, `ModuleCard`. Each module takes props and has no hardcoded dependencies on a page, so it can be dropped into any screen.
- Keep mock data in a separate `/data` folder (books, verses in three translations, strongs entries, modules, queue items, themes).
- The layout is built with CSS grid and flex with the sizes from section 3, resizable panes where noted, and sensible behaviour at narrower widths (nav stays a rail, study sheet becomes an overlay below 1280px).

## 5. Behaviour to wire up in the mock

- Workspace toggle switches the nav items and shows or hides Live Show, Customize and the Service Queue button.
- Theme toggle flips light and dark smoothly.
- Clicking a book expands its chapter grid. Clicking a verse opens the action popover. Clicking a Strong's word opens the Strong's sheet.
- Parallel view toggle shows or hides the extra translation panes.
- ⌘K opens the search palette.
- In Live Show, clicking a queue item makes it live and updates the preview. Drag to reorder.
- In Customization Studio, editing controls updates the live preview instantly.

## 6. Quality bar

- Looks like a premium, calm, modern reading app, not a dashboard or a gaming UI. Generous spacing (8px grid), restrained palette, plenty of breathing room around scripture text.
- Neumorphic shadows must be subtle and consistent. Avoid the common neumorphism failure of low-contrast, indistinguishable controls: always pair shadows with clear icons, labels and an accent state.
- Glass must remain readable: ensure sufficient background opacity behind text.
- Accessible: visible focus rings (accent glow), 32px minimum touch targets, keyboard-reachable controls.
- Do not introduce new navigation items, new features, or move panels around. Only restyle.

Deliver the screens as a navigable prototype with a top-level screen switcher (a dev-only floating menu) so I can jump between all 14 screens quickly.
