# Lovable prompt: Scriptura UI, flat/minimal + glassmorphism

Paste everything below the line into Lovable.

---

Design a set of high-fidelity, clickable mock UI screens for **Scriptura**, a desktop Bible study and church presentation app (Tauri window, 1440×900 default, min 1100×700). React + Tailwind + lucide-react icons. All data is hardcoded mock data, no backend.

## 1. Product context

Scriptura is an open-source alternative to e-Sword and Xiphos. Two workspaces, toggled in Settings:

- **Study**: personal Bible reading and research.
- **Presentation**: everything in Study, plus a Live Show console, a Service Queue and a Customization Studio for projecting verses to a second screen at church.

I already have a layout. **Keep the structure in section 3 exactly. Replace the entire visual design** with the language below.

## 2. Design language: modern flat / minimal, with glass used for floating layers

The feel: calm, quiet, editorial, like Linear, Arc, Apple Books or Notion Calendar. Content first, chrome nearly invisible. **No neumorphism, no dual shadows, no embossed or inset controls, no heavy gradients, no skeuomorphism.**

**Flat for everything that sits in the page (80% of the UI)**
- Solid, flat surfaces separated by space, tone shifts and 1px hairlines (`1px solid` at 6–8% ink opacity). Shadows are almost absent: at most a faint `0 1px 2px rgba(0,0,0,0.04)` on cards.
- Buttons are flat: primary = solid accent fill; secondary = transparent with hairline border; ghost = text/icon only with a soft tinted hover (`ink/5%`). Pressed = slightly darker fill. No raised or inset states.
- Active nav/tab = a subtle accent-tinted background pill plus accent icon (no glow bars, no shadows). Selected verse = a faint accent-tinted background with a 2px accent bar on the left edge.
- Inputs: flat fill (`ink/4%`), hairline border, 1.5px accent ring on focus.
- Radii: 8px controls, 12px cards, 16px panels and sheets. Pills only for chips and toggles.
- Generous whitespace on an 8px grid. Dense where needed (lists), airy where reading.
- Icons: Lucide, 1.5px stroke, 18–20px, one color (secondary text), accent when active.

**Glass only for floating layers (about 20% of the UI)**
- Top bar, right/bottom study sheets (Strong's, Commentary, Cross-references, Notes, Compare), Service Queue drawer, ⌘K search palette, settings modal, popovers, dropdowns, tooltips, toasts, the Live Show "now live" card and its output preview chrome.
- Recipe: `background: rgba(255,255,255,0.62)` (light) / `rgba(22,26,36,0.62)` (dark), `backdrop-filter: blur(24px) saturate(150%)`, `border: 1px solid rgba(255,255,255,0.5)` (light) / `rgba(255,255,255,0.08)` (dark), shadow `0 8px 32px rgba(15,20,40,0.10)`, radius 16px.
- Behind the glass, a very soft, low-saturation ambient background: two or three large blurred color blobs (accent, a cool teal, a warm sand) at 12–18% opacity over the base color. It must be calm. Never put scripture text directly on busy color.
- Do not stack glass on glass more than one level deep.

**Rule of thumb:** the Bible text is always on a flat, solid, high-contrast surface. Flat is for reading and doing; glass is for what floats above it.

**Color**
- Light: base `#F6F7F9`, surface `#FFFFFF`, ink `#14181F`, secondary text `#5D6675`, hairline `rgba(20,24,31,0.08)`.
- Dark: base `#0E1116`, surface `#151A22`, ink `#ECEFF4`, secondary text `#8F99AA`, hairline `rgba(255,255,255,0.07)`.
- One accent: indigo `#5B5BF0` (dark mode `#8B8CFF`). Warm gold `#B8892B` used only for bookmarks and Strong's number tags. Red `#E5484D` only for LIVE and destructive actions. A soft green only for "installed/success".
- WCAG AA contrast everywhere. Do not rely on color alone for state.

**Typography**
- UI: Inter or Hanken Grotesk, 14px base, weights 400/500/600. Headings 600, tight tracking.
- Scripture: Source Serif 4, 18–20px, line-height 1.7, max width about 680px.
- Metadata and references: JetBrains Mono, 11px, uppercase, 0.05em tracking, secondary color.
- Verse numbers: 11px superscript in accent or secondary color, no chips or circles.

**Motion**: 150–200ms ease-out. Glass layers fade and slide 8px. Hover = tint change only. Respect reduced motion.

## 3. Layout to preserve (do not change structure)

- **Top bar (56px, glass, full width)**: left: "Scriptura" wordmark and a current-reference button (e.g. "John 1:1"). Center: dual-mode search (a mode-switch icon, then a search field or scripture-jump field with a ⌘K hint). Right: icon buttons: Service Queue (count badge, Presentation only), Parallel view, Text size, Theme (light/dark/system), Settings. In Presentation workspace the top bar instead shows tabs (Scriptures, Slides, Songs), a centre cluster of LIVE / BLACK / CLEAR buttons, and icons (Outputs, Themes, Studio, Alerts, Help, Settings).
- **Left nav rail (64px collapsed, expands to 200px on hover)** in reading views, **full 280px sidebar** in utility views. Study order: Library, Bookmarks, Search, History, Modules, Notes. Presentation order: Live Show, Library, Customize, Search, Modules, Bookmarks, Notes, History.
- **Reading view**: nav rail, then a 220px "Study Library" book navigator (translation picker, parallel-translation picker, Old/New Testament groups as collapsible lists of books), then the scripture pane (chapter title, prev/next chapter, parallel toggle, focus-mode button, verses). Parallel mode splits the scripture pane into 2–3 columns with a thin divider.
- **Verse hover actions**: a small floating glass toolbar at the verse's right edge: copy, note, bookmark, commentary, cross-references, link, compare, add to service queue.
- **Study tools** open as a **bottom sheet** (centered, 56rem max width, drag handle at the top to resize): Strong's (headword in Greek/Hebrew, transliteration, G/H number tag, part of speech, source tabs Strong's / Abbott-Smith / Full LSJ, "occurs N× in the Bible" expandable list by book, lexicon entry), Commentary, Cross-references, Notes, Compare.
- **Service Queue**: 300px glass drawer sliding in from the right over the content (Presentation only). Draggable rows with index, reference, snippet, remove, a footer with count, "Copy list" and a primary "Open Live Show" button.
- **Live Show console**: top half is two columns: left "Live display" showing the active verse in large serif with a LIVE tag; right 320px column with a 16:9 black "Main Output" preview and the Queue list (drag handles, LIVE tag on the active item, Edit / Clear all). Below, a "Next in queue" strip. Bottom 42% dock: translation badge, reference, prev/next, scripture jump field, scrollable verse list, and a 300px Preview column with a GO button and an undo button.
- **Customization Studio** (Presentation): header with title "Presentation themes", description and a "New theme" button. Two columns: a 250px theme library (mini gradient preview, name, default star, alignment and scale) and a theme editor (name, colors, font, gradient, alignment segmented controls, reference label placement, text scale/weight sliders, text shadow toggle, readability checks) beside a large 16:9 live preview with draggable boxes and a Grid toggle.
- **Utility views** (Modules, Search, History, Bookmarks and Notes): full sidebar plus a content area with a page title, subtitle, a toolbar (segmented filters, search field) and a list of rows or cards.
- **Settings**: bottom glass sheet with accordion sections: Workspace (Study / Presentation), Appearance, Study Tools, Presentation, Sync & Backup, Help, About.
- **⌘K palette**: centered glass modal with a large input, scope chips, recent searches, result rows and a keyboard-hint footer.

## 4. Screens to produce

Each as a route with the shell, in light and dark (theme toggle works):

1. Reading view (single translation), Strong's sheet open
2. Reading view in parallel mode (3 translations), verse hover toolbar visible
3. Commentary, Cross-references, Notes and Compare sheets (as states of the bottom sheet)
4. Search results (scope bar: All / Old Testament / New Testament / Pick books; results grouped by book, highlighted matches)
5. ⌘K palette
6. Search history
7. Bookmarks and Notes (list + editor)
8. Module manager (Available / Installed tabs, category filter, module rows with install, update, remove and progress states), plus the empty first-run library state
9. Settings sheet
10. Live Show console (Presentation) with the Service Queue drawer open
11. Customization Studio
12. Presentation output window (projected 16:9 only) with 3 themes
13. `/styleguide`: color tokens, type scale, spacing, flat button set, inputs, chips, tabs, list rows, cards, the glass recipe on top of the ambient background, tooltips, toasts, modals, empty states, in light and dark.

## 5. Modularity requirements

- Build a small **design system first**, then screens from it. Tokens as CSS variables (colors, hairline, radii, blur, spacing, type) with a `.dark` swap, referenced by the Tailwind config.
- Primitives with variants and states: `Surface` (flat | glass), `Button` (primary | secondary | ghost | danger | icon), `Input`, `Toggle`, `Slider`, `SegmentedControl`, `Chip`, `Tabs`, `ListRow`, `Card`, `Modal`, `Sheet`, `Drawer`, `Popover`, `Tooltip`, `Toast`, `EmptyState`, `Progress`.
- Independent modules built from them: `TopBar`, `PresentationTopBar`, `NavRail`, `Sidebar`, `BookNavigator`, `ScripturePane`, `ParallelPanes`, `VerseHoverToolbar`, `StudySheet` (+ one content module per tab), `QueueDrawer`, `OutputPreview`, `ThemeEditor`, `ModuleRow`, `SettingsSheet`, `CommandPalette`. Each takes props and has no page-specific dependencies.
- Mock data in a separate `/data` folder (books, verses in three translations, Strong's entries, modules, queue items, themes).

## 6. Behaviour to wire up

- Workspace toggle (in Settings) switches nav items and the top bar, and shows or hides Live Show, Customize and the Queue.
- Theme toggle flips light and dark.
- Book groups expand; clicking a verse selects it; clicking a Strong's word opens the sheet; the sheet drag handle resizes it.
- Parallel toggle shows or hides extra columns. ⌘K opens the palette.
- Live Show: clicking a queue item makes it live and updates the preview; drag to reorder.
- Studio: editing a control updates the live preview immediately.

## 7. Quality bar and things to avoid

- Reads as a premium, quiet reading app. Think more whitespace, fewer boxes, thinner lines.
- Avoid: neumorphic shadows, inset controls, glowing icons, thick gradients, rainbow accents, drop shadows heavier than the glass recipe, glass behind long paragraphs of text, more than one accent color.
- Glass must stay readable: sufficient opacity behind all text, tested over the ambient background in both themes.
- Accessible: visible focus rings, 32px minimum targets, keyboard-reachable controls.
- Do not add navigation items or features, or move panels. Only restyle.

Finish with a dev-only floating screen switcher so I can jump between all screens quickly.
