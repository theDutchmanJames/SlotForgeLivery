# Livery roadmap

The improvement programme agreed on 2026-11-16. Each phase is committed locally once its tests pass. Tick items off as they land.

## Phase 1 · Foundation
- [x] Reformat renderer and main-process code (no behaviour change)
- [x] Split `renderer/app.js` into modules by area (`renderer/app/*.js`, 18 files)
- [x] Full integration suite matches the pre-split baseline (all 36 pass; a few timing-sensitive suites fail at random in long runs, see Phase 6)

## Phase 2 · Quick editing wins
- [x] Arrow-key nudge (Shift = larger steps) — already present
- [x] Align and distribute selected artwork
- [x] Eyedropper: pick a colour from the canvas
- [x] Outline (stroke) on text and shapes
- [x] Lock layers in the Layers list
- [x] Team-colour palette per project and recent colours

## Phase 3 · Interface and ease of use
- [x] Resizable split between properties and Layers
- [x] Toasts clear on navigation and last 2–7 s depending on length (they stay click-through so they never block the canvas)
- [x] Compact list view in the library, with usage counts for cars
- [x] Settings → Studio: scale for new cars, undo steps, finish preview, Snap/Grid on start, tips. Kept the header Light/Dark switch (matches the other SlotForge apps). Units move to Phase 5, backup folder to Phase 6
- [x] Recent projects on the welcome screen, sensible default names
- [x] "Try a sample car" on the welcome screen and in Add car
- [x] Step-by-step tips on the canvas; Help split into tabs

## Phase 4 · Design tools
- [x] Rulers and draggable guides (per view, saved with the project); with Snap on, moves snap to guides, the car centre line and panel edges
- [x] Text: "Space letters" fit (letter spacing follows the box width), hard drop shadow (text and shapes), bend along an arc
- [x] Preset shapes: number board and roundel (editable groups), chequered band, shield, star
- [x] Mirror a whole side (left ↔ right), fitted to the other side, groups kept
- [x] Side-by-side pane showing another view live

## Phase 5 · Slotcar features
- [x] Real-world scale per view (real width in mm); mm readouts and mm rulers from the car edge
- [x] Print at true size: one masking template per colour plus the full design, 50 mm check bar
- [x] Paint catalogue: Tamiya (TS, X/XF) and Humbrol built in; Revell, Zero Paints and others via My paints (exact codes not guessed)
- [x] Workshop PDF: paint products column and painting order, lightest first, with a picture per step
- [x] Send decals to SlotForge Decals as a .sfdecal pack at real size
- [x] Photo tracing aids: photo opacity and a centre guide for symmetry

## Phase 6 · Systems
- [x] Lighter undo: snapshots share images, fonts and outlines instead of copying them (20 steps with a 2 MB image: under 8 MB instead of ~40 MB)
- [x] Automatic backups to a chosen folder: daily or weekly, keep 5–50, only Livery backups pruned
- [x] Update check against GitHub releases once a day, header notice, can be switched off
- ~~Translations (Dutch, German, French)~~ — dropped at the owner's request; Livery stays English-only
- [x] Integration test that works at human pace (tests/systems.cjs)
- [x] Timing-sensitive suites: the runner retries a failed suite once and reports passes on retry as FLAKY
- [ ] Code signing for Windows/macOS (needs a paid certificate; owner's decision)
