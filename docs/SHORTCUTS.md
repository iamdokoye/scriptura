# Scriptura shortcuts and gestures

Every keyboard shortcut and mouse gesture in the app, what it does, and when it is active.

**Notation**

- **Mod** means `Ctrl` on Windows/Linux and `Ctrl` *or* `Cmd` on macOS. Both are accepted everywhere in the app.
- **Alt** is `Option` on macOS.
- Bindings match on the physical key (`e.code`) unless noted, so they work on any keyboard layout. The exceptions are `C` and `Ctrl+Shift+E` in presentation mode and `Ctrl+K` / `Ctrl+L` in Study mode, which match the typed letter.
- Bindings are fixed in code. There is no key-rebinding setting. The "Source" column says where each one lives.

**Workspaces.** The app has two workspaces (Settings → Workspace):

- **Study** is the reading experience: top bar, side nav and reading view.
- **Presentation** adds the live-show tools: the top bar with LIVE / BLACK / CLEAR, the Live Show console and the service queue.

Some shortcuts only exist in one of them.

---

## 1. Presentation workspace

### 1.1 Always active (any presentation screen)

Defined in `src/components/PresentationTopBar.tsx`. These work from anywhere in the presentation workspace, including the Live Show console and the Themes screen. Shortcuts with a modifier also work while a text field has focus.

| Keys | Action | Active when |
|---|---|---|
| `C` | Toggle BLACK: cut the output to a plain black screen and back | Not typing in a text field. No modifier held |
| `Mod+Shift+E` | Toggle the emergency "One moment please" standby screen. It overrides black and live content | Always |
| `Mod+Q` | Open or close the service queue drawer | Always |
| `Mod+1` | Verse context: active verse only | Output window is live |
| `Mod+2` | Verse context: active verse + next | Output window is live |
| `Mod+3` | Verse context: previous + active + next | Output window is live |
| `Mod+4` | Verse context: full chapter scroll | Output window is live |
| `Mod+=` or `Mod+Numpad+` | Increase font size by 1 px (max 98) | Always |
| `Mod+-` or `Mod+Numpad-` | Decrease font size by 1 px (min 14) | Always |
| `Mod+Alt+=` | Jump to the next preset font size | Always |
| `Mod+Alt+-` | Jump to the previous preset font size | Always |
| `Alt+H` | Open search history | Always |

- **Font presets:** 14, 16, 32, 48, 64, 72, 98 px. Font-size changes are saved.
- **Verse context** is the "Verse context" setting: 1 = single verse, 2 = active + next, 3 = previous + active + next, 4 = whole chapter with the active verse highlighted.

### 1.2 Live Show console

Defined in `src/views/LiveShowRunner.tsx`. Active only while the Live Show screen is open.

The console works on a **Preview** (what you have lined up) and a **Live** output (what the congregation sees). Moving around changes the Preview. Nothing reaches the output until you send it.

**Needs no text field focus.** Plain keys are ignored while a text field has focus, so typing in the jump bar never moves the show.

| Keys | Action |
|---|---|
| `Enter` | **Go:** send the previewed verse (and split part) to the live output |
| `Backspace` | **Back:** return to the previously live verse (history stack) |
| `←` / `→` | Previous / next verse in Preview. Crosses into the adjacent chapter at the ends |
| `↑` / `↓` | Previous / next item in the service queue, loaded into Preview |

**Works even while typing:**

| Keys | Action |
|---|---|
| `Mod+L` | Focus the verse-jump bar (switches it to verse mode) |
| `Mod+K` | Focus the search bar in word-search mode |
| `Mod+Alt+Q` | Add the previewed verse to the service queue (ignored if it is already queued) |
| `Mod+N` / `Mod+P` | Next / previous chapter in Preview. Does nothing past the end of the book |
| `Mod+↓` / `Mod+↑` | Next / previous verse in Preview (same as `→` / `←`) |

Keys with a modifier are ignored by the plain-key handler above, so `Mod+↓` never also steps the queue.

### 1.3 Verse-jump and search bar (Live Show)

Defined in `src/components/PresentationSearchBar.tsx` and `src/components/ScriptureNav.tsx`.

The first button on the bar cycles **verse jump ↔ word search**. The separate `#` button turns Strong's numbers on or off.

**Verse jump mode**

| Input | Result |
|---|---|
| `jn 3:16`, `1co 2:3`, `Matthew 5` | Book (abbreviations ok), chapter, optional verse |
| `v5` | Verse 5 of the previewed chapter |
| `Space` after a partial book name | Completes the book name and adds a space |
| `Space` after a chapter number | Inserts `:` so you can type the verse straight away |
| `Enter` | Jump to the reference (verse defaults to 1, chapter to 1) |
| `Esc` | Clear the box |

**Word-search mode**

| Keys | Action |
|---|---|
| Typing | Debounced (200 ms) full-text search in the current Bible, up to 40 results, hits highlighted |
| `↓` / `↑` | Move the highlighted result |
| `Enter` | Load the highlighted result into Preview |
| `Esc` | Clear the box and close the results |

Words with apostrophes (`king's`, `king’s`) and hyphens match. Symbols such as `:` or `OR` are treated as plain text.

### 1.4 Mouse gestures (Live Show verse list)

| Gesture | Action |
|---|---|
| Click a verse | Select it into Preview. A split verse also unfolds its parts |
| Click a split verse again | Fold the parts back up |
| Click a part (`p2`, `p3`, …) | Select that part into Preview |
| **Double-click** a verse or a part | **Send it to the live output** (works on any word in the row too) |
| **Option/Alt-click** a word (Strong's on) | Open the Strong's concordance for that word, without sending anything live |
| Click the small number tag (`H430`) that appears above a word on hover | Open the Strong's lookup for that number |
| Click another verse | Folds any open split verse |
| Drag a panel divider | Resize the panel. Sizes are remembered |
| Double-click a panel divider | Reset that panel to its default size |

Resizable panels and their saved settings (browser storage keys, default sizes):

| Panel | Key | Default | Limits |
|---|---|---|---|
| Main Output / Queue column width | `scriptura.live.asideWidth` | 320 px | 240 px to 60% of window |
| Main Output preview height | `scriptura.live.outputHeight` | 186 px | 80 px up to the output's aspect ratio |
| Verse picker height | `scriptura.live.bottomHeight` | 38% of window | 200 px to window height − 260 |
| Preview column width | `scriptura.live.previewWidth` | 300 px | 220 px to 50% of window |
| Queue drawer width (`Mod+Q`) | `scriptura.queueDrawerWidth` | 324 px | 280 px to 70% of window |

Stored sizes are clamped to these limits when the app starts, so a size saved in a different-sized window can't leave a panel collapsed.

The verse list scrolls to the selected verse whenever the selection changes. This is a short eased glide, about 280 ms. Scrolling with the wheel or clicking during it stops it.

---

## 2. Study workspace

### 2.1 Top bar

Defined in `src/components/TopBar.tsx`.

| Keys | Action |
|---|---|
| `Mod+K` | Switch to word search and focus the search box |
| `Mod+L` | Switch to scripture navigation and focus the reference box |
| `Alt+H` | Open search history |

The mode button in the bar toggles the same two modes.

### 2.2 Reading view

Defined in `src/hooks/useReadingShortcuts.ts`. Active while the reading view is open.

| Keys | Action | Active when |
|---|---|---|
| `Mod+F` | Toggle fullscreen reading | Always |
| `Esc` | Close the fullscreen search palette, otherwise exit fullscreen | Palette open or fullscreen on |
| `Mod+K` | Open the word-search palette | Fullscreen only |
| `Mod+L` | Focus the scripture navigator | Fullscreen only |
| `Mod+P` | Previous chapter (verse 1) | Always |
| `Mod+N` | Next chapter (verse 1) | Always |
| `Mod+↓` / `Mod+↑` | Next / previous verse in the chapter | Always |
| `Mod+=` or `Mod+Numpad+` | Font size +1 px (max 98) | Always |
| `Mod+-` or `Mod+Numpad-` | Font size −1 px (min 14) | Always |
| `Mod+Alt+=` | Jump to the next preset font size | Always |
| `Mod+Alt+-` | Jump to the previous preset font size | Always |
| `Alt+H` | Open search history | Always |
| `Alt+P` | Previous search result | A search has results |
| `Alt+N` | Next search result | A search has results |
| `Mod+Alt+Q` | Add the current verse to the service queue | Presentation workspace only |
| `Mod+Q` | Open or close the service queue panel | Presentation workspace only |
| `Mod+1` to `Mod+4` | Presentation verse context | Output window is live |

### 2.3 Mouse gestures (reading view)

Defined in `src/components/VersePanes.tsx` and `src/components/VerseSplitPanel.tsx`.

| Gesture | Action |
|---|---|
| Click a verse | Make it the current verse |
| **Double-click** a word (Strong's on) | Open the Strong's concordance for that word. In Study mode there is no go-live action, so double-click keeps this meaning |
| Click the small number tag above a word on hover | Open the Strong's lookup for that number |
| Hover a verse | Shows its action buttons: add note, commentary, cross-references, compare translations and add to queue (when shown). Copy and bookmark buttons also appear but are not wired to anything yet |
| Click a part chip (`a`, `b`, `c`…) or a part in the side panel | Send that part of a split verse to the output |

---

## 3. Panels, palettes and dialogs

| Where | Keys | Action |
|---|---|---|
| Strong's concordance sheet | `Esc` | Close it. Handled first, so it never also closes something behind it |
| Settings | `Esc` | Close Settings |
| Shortcuts overlay (Settings) | `Esc` | Close the overlay |
| Fullscreen search palette | `↓` / `↑` | Move the highlighted result |
| Fullscreen search palette | `Enter` | Go to the highlighted result and close the palette |
| Notes editor | `Mod+Enter` | Save the note |
| Strong's sheet | Drag the top edge | Resize its height. The height is saved |

---

## 4. Quick reference

| Keys | Study | Presentation |
|---|---|---|
| `Mod+K` | Word search | Word-search mode in the Live Show bar |
| `Mod+L` | Scripture navigator | Verse-jump mode in the Live Show bar |
| `Mod+N` / `Mod+P` | Next / previous chapter | Next / previous chapter in Preview |
| `Mod+↓` / `Mod+↑` | Next / previous verse (current verse) | Next / previous verse (Preview) |
| `Mod+Q` | Queue panel (presentation only) | Queue drawer |
| `Mod+Alt+Q` | Add current verse to queue | Add previewed verse to queue |
| `Mod+1`–`4` | Verse context (output live) | Verse context (output live) |
| `Mod +/-` | Font size | Font size |
| `Alt+H` | History | History |
| `Esc` | Close panels / exit fullscreen | Close panels |
| `C` | none | Black out the output |
| `Enter` | none | Send the previewed verse live |

---

## 5. Notes and caveats

- **Presentation mode vs Study.** The Live Show console and the presentation top bar are mounted only in the Presentation workspace. The reading view's shortcuts (section 2.2) are not mounted there. That is why the presentation workspace has its own copies of `Mod+P/N`, `Mod+↑/↓`, font-size keys and `Alt+H`.
- **`Mod+P` blocks printing, `Mod+F` blocks find.** Both are intercepted deliberately.
- **Double-click moved.** In the Live Show verse list, double-click used to look up a Strong's number. It now sends the verse live. Use Option/Alt-click or the hover tag for the lookup.
- **The in-app shortcuts overlay is out of date.** It lives in `src/components/Settings.tsx` (`SHORTCUT_GROUPS`). It lists the reading-view shortcuts only, and marks `Mod+K` / `Mod+L` as fullscreen-only. It does not list the Live Show console keys, the black-out key, or the emergency key. This document is the complete list.
- **No rebinding.** Keys are fixed. Moving a binding means editing the file named in the source note for its section.
- **Typing guard.** In presentation mode, plain keys (`C`, `Enter`, `Backspace`, arrows) are skipped while an `<input>`, `<textarea>` or editable element has focus, so typing is never hijacked. Modifier shortcuts are not skipped.

## 6. Source map

| Area | File |
|---|---|
| Presentation-wide shortcuts | `src/components/PresentationTopBar.tsx` |
| Live Show console keys and gestures | `src/views/LiveShowRunner.tsx` |
| Live Show verse-jump / search / Strong's toggle | `src/components/PresentationSearchBar.tsx`, `src/components/ScriptureNav.tsx` |
| Panel resizing and saved sizes | `src/hooks/useResizable.tsx` |
| Eased verse-list scroll | `src/lib/animateScroll.ts` |
| Study top bar | `src/components/TopBar.tsx` |
| Reading view shortcuts | `src/hooks/useReadingShortcuts.ts` |
| Reading view gestures | `src/components/VersePanes.tsx`, `src/components/VerseSplitPanel.tsx` |
| Dialog keys | `src/components/StrongsSheet.tsx`, `src/components/Settings.tsx`, `src/components/FullscreenSearchPalette.tsx`, `src/components/NotesSheet.tsx` |
