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
- [ ] Rulers and draggable guides; snap to centre line and panel edges
- [ ] Text: letter spacing, drop shadow, text along a curve
- [ ] Preset shapes: number boards and roundels, chequers, badges
- [ ] Mirror a whole view to the opposite side
- [ ] Side-by-side views while designing

## Phase 5 · Slotcar features
- [ ] Real-world scale: set the car length in mm; show sizes in mm
- [ ] Print masking templates and decals at true size
- [ ] Paint catalogue: hobby paint brands with codes and colours
- [ ] Workshop PDF: painting order and masking steps per colour
- [ ] Send decals to SlotForge Decals
- [ ] Photo tracing aids: photo opacity, symmetry line

## Phase 6 · Systems
- [ ] Lighter undo (store changes instead of whole-project copies)
- [ ] Automatic backups to a chosen folder
- [ ] Update check against GitHub releases
- [ ] Translations: move UI text out of the code; Dutch, German, French
- [ ] Integration tests that pause like a real user
- [ ] Fix timing-sensitive suites that fail at random in long runs (seen: canvas-pan, fitting, library-details, pinch-curved-lines)
- [ ] Code signing for Windows/macOS (needs a paid certificate; owner's decision)
