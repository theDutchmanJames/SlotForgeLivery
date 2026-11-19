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
- [ ] **Pit Buttons:** one flat family (primary, secondary, outline, danger, icon, small), 32 px; give every button its kind
- [ ] Selected tool and pressed toggles: quiet grey, not a red underline; header menu icons in grey (accent only on the open page)
- [ ] **Gear Selector:** `.segmented` groups and the List/Grid switch
- [ ] **Toggle Chips:** multi-choice options (views to export, paint brands, decal-sheet options)
- [ ] Fields: 34 px inputs and selects, one style everywhere

## Phase 3 · Windows and folders
- [ ] **Workshop Window:** Add car, Import & Export, Sharing, Decal import, Paint catalogue and the other dialogs: Barlow title with a line under it, intro line, buttons bottom right with the main one last, no coloured head
- [ ] **Flag Dialog:** Yes/No and message windows with a ? / i / ! badge; a filled red button for what cannot be undone
- [ ] **Folder:** the inspector's fold-out groups (Fit, Gradient, Outline, Shadow…) and folders in dialogs

## Phase 4 · Paint Studio
- [ ] **Pit Board** across the top of the studio: back to Projects, eyebrow (car · view), the project name as a big Barlow field (rename), "✓ Saved" / "● Saving" from autosave, Undo / Redo as icon buttons
- [ ] Below it the tools in named groups (Arrange: Snap, Grid, Guides · View: zoom, compare, rulers), replacing the context bar's loose checkboxes
- [ ] Toolbox, inspector and Layers list on the Graphite surfaces; views strip as quiet tiles

## Phase 5 · Library and projects
- [ ] **Paddock Rail** for the Library's kinds (cars, shapes & images, fonts, paints, packages) instead of the tab row
- [ ] **Control Strip** above every list: Add / Import, search with a magnifier, List/Grid, icon pager
- [ ] **Showroom Card** for projects, cars and artwork: the real preview edge to edge, Barlow name, facts in Roboto Mono, button foot with the bin last
- [ ] **Paint** per library kind on icon tiles only; calm dashed empty states with a sentence that says what to do
- [ ] **Page Note** on library pages and the template-preparation steps

## Phase 6 · Settings and Help
- [ ] **Double Rail + Settings Sheet:** Settings as a side list (Theme, Studio, Paint, Backups, Updates) and slim rows: name and one line left, switch / segmented / stepper right; theme tiles stay pictures
- [ ] **Help Reader:** Help as a calm one-column document with its sections in a side list

## Phase 7 · Exports and welcome
- [ ] **Replay Monitor** for Print at true size, Workshop PDF and PNG export: options in folders on the left, a live preview of the real output on the right, marked as a preview
- [ ] Welcome screen: recent projects as Showroom Cards, Try a sample car and Add car as the main actions; optionally a **Broadcast Hero** header picture
- [ ] Add Livery's changes to the restyle change log so the other apps can follow

## Not used (race-only styles)
Pit Wall, Lane Desk, Lane Check, Start Lights, Grid Slot, Timing Tower, Race Sheet, Scrutineering, Cue Card, Live Desk,
Parc Fermé, Widget Bench, Picture Bench, Tech Sheet.
