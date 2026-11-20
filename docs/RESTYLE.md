# Livery restyle plan

Bringing Livery in line with the shared SlotForge look first built in SlotForge Timing 2.4.0.
The source of every style is `..\Timing\SlotForgeRestyle.md` (names below are its style names) with mock-ups in
`..\Timing\docs\ui-reference\redesign-2026-11`. Agreed 2026-11-19. Each phase is committed locally once its tests pass.

**Always:** the artwork people design (canvas, their fonts, previews of their liveries) keeps its own look; only the app around it changes.
Every phase is checked by eye at 1600 px and 900 px wide in Dark, Light and one coloured theme (Midnight or Ocean).
Tests that look for old class names or texts are updated; the new look is not reverted to make an old test pass.

## Phase 1 · Foundation (colours and type)
- [x] **Graphite:** replace fixed colours (`#343c48` hover, `#e5484d16` active tint, `#ff999d` danger text, `#495362` window border…) with the theme mixes, so every theme looks right
- [x] Add `--accent-fill` / `--accent-text`; focus ring `#4c9aff`; Light accent `#c92424`
- [x] **Type Trio:** bundle Barlow Condensed and Roboto Mono from Timing's `renderer/fonts` (SIL OFL, licences listed in THIRD-PARTY-NOTICES)
- [x] Barlow for titles (windows, pages, panel and card titles); Roboto Mono for data numbers (mm readouts, X/Y/W/H, zoom %, counts)
- [x] **Finishing Touches:** themed scroll bars and file pickers
- [x] All Phase 1 rules live in `renderer/restyle.css`, loaded last. Still to do in later phases: the red top lines on Settings cards and the coloured top line on library cards (Phases 5–6), red menu icons (Phase 2)

## Phase 2 · Controls
- [x] **Pit Buttons:** one flat family, 32 px: secondary (default), `.primary`, `.ghost`, `.quiet`, `.danger`, `.icon-button`, `.sm`. The secondary tint mixes into `transparent`, not `--panel`, so buttons stay visible on the page background in light themes
- [x] Pressed toggles and selected list rows: quiet grey, no red underline. The selected drawing tool keeps a soft accent tint (as Timing's Pit Board toggles); header menu icons grey, accent only on the open page
- [x] **Gear Selector:** `.segmented` groups, Cards/List, the Light/Dark switch, library tabs and Help tabs
- [x] **Toggle Chips:** the canvas options (Snap, Grid, Rulers, Finish preview; Side by side later moved above the canvas as the pair switch) and every `.checkbox-line` option in dialogs. Livery has no many-choice checkbox sets; the paint brand stays a list
- [x] Fields: 34 px inputs and selects, one style everywhere

## Phase 3 · Windows and folders
- [x] **Workshop Window:** every window shares one look: panel colour, Barlow title with a line under it, grey intro line, quiet close button, buttons bottom right with the main one last (Livery's own markup already had that order). Choice cards and notes inside windows lost their amber bars
- [x] **Flag Dialog:** `openDialog(…, kind)` and `confirmAction(…, kind)` take `'confirm'` (?), `'alert'` (i) or `'danger'` (!). Danger: delete project, remove library item, remove or replace a view, close without saving, library recovery. The answer button is the filled accent
- [x] **Folder:** the inspector's fold-out groups: Barlow title, chevron on the right, accent mark when open; the folder icon is grey and takes the accent only while open

## Phase 4 · Paint Studio
- [x] **Pit Board** across the top of the studio (the old project bar, `index.html`): ‹ Projects, eyebrow (car · scale · view), the project name as a big Barlow title (click to rename), the saved state (`saveStatus(state, text)` in `core.js` sets `data-state`: local, saving, saved, failed, paused), Undo / Redo as icon buttons, then Save livery, Export PNG and Export PDF. On the welcome screen the car tile shows instead of the back button
- [x] Below it the tools in named groups: Tool (the current tool), Arrange (Snap, Grid, Rulers), View (Side by side, Finish preview), Prepare template on the right. The old context bar moved up into the Pit Board, so the bar runs the full width; all ids and inputs are unchanged
- [x] Toolbox on the same side-list surface as the inspector and Layers; view tiles already quiet since Phase 2

## Phase 5 · Library and projects
- [x] **Paddock Rail** for the Library's four kinds (My Cars, Liveries, Shapes & Images, Fonts) instead of the tab row; it becomes a wrapping row below 900 px. `LIBRARY_KINDS` in `library.js` holds each kind's name, icon and Page Note. (Paints live in the Paint catalogue and packages in Import & Export; they are not library kinds)
- [x] **Control Strip** above the list: the main button (Add car, Save current, Import artwork, Import font) left; search with a magnifier, sort and Cards / List right; the pager is the page number with two icon buttons
- [x] **Showroom Card** for cars, liveries, artwork, fonts and projects: the real preview edge to edge (16:9), Barlow name, quiet detail line, a button foot (use, Edit, export, bin last). List view is one slim row with the same parts. The export-package cards keep their tick-box layout
- [x] **Paint** per library kind (cars blue, liveries pink, artwork green, fonts violet; darker in light themes) on the rail icon of the open kind, its Page Note tile and its empty state only; calm dashed empty states with a sentence that says what to do
- [x] **Page Note** on every library page and on Your projects (`pageNote()` in `library.js`). The template-preparation steps already open with an icon, a title and a line in the inspector, so they keep that

## Phase 6 · Settings and Help
- [x] **Double Rail + Settings Sheet:** Settings has a side list (App theme, Studio, Automatic backups, Updates, each with a one-line status) and slim rows: name and one line left, switch / segmented choice / list right; theme tiles stay pictures. `settingsSheet()` in `preferences.js` rearranges the page after it is drawn (controls are moved, never rebuilt). The side list works as a table of contents (click scrolls, it follows the scroll), as Timing's System Sheet, so every control stays on one page. Lists of up to five options are segmented choices (`data-seg-for`); the list stays hidden behind it. Livery has no number fields or sliders in Settings, so no stepper was needed
- [x] **Help Reader:** the quick tour as a calm reading column (Barlow title, 14.5 px text) with its sections in a side list

## Phase 7 · Exports and welcome
- [x] **Replay Monitor** for PNG export and Print at true size: the options in a Folder on the left, a live preview on the right. PNG shows the real image on the checkerboard; true size shows every page of the PDF small (`trueSizePages()` builds the list for both the preview and the PDF), marked "preview, not to scale". The Workshop PDF has no options, so it still saves straight away without a window
- [x] Welcome screen on the theme's surfaces: Add a car (main), Try a sample car, Import a shared package (outline); recent projects as small Showroom cards with the real preview, rebuilt only when the list changes. No Broadcast Hero: Livery has no header picture of its own, and the car tile already leads the page
- ~~Add Livery's changes to Timing's restyle change log~~ — skipped at the owner's request (2026-11-19); the Timing folder is left unchanged

## Not used (race-only styles)
Pit Wall, Lane Desk, Lane Check, Start Lights, Grid Slot, Timing Tower, Race Sheet, Scrutineering, Cue Card, Live Desk,
Parc Fermé, Widget Bench, Picture Bench, Tech Sheet.
