# Livery roadmap

The improvement programme agreed on 2026-11-16. Each phase is committed locally once its tests pass. Tick items off as they land.

## Phase 1 · Foundation
- [ ] Reformat renderer and main-process code (no behaviour change)
- [ ] Split `renderer/app.js` into modules by area
- [ ] Full integration suite matches the pre-split baseline

## Phase 2 · Quick editing wins
- [ ] Arrow-key nudge (Shift = larger steps)
- [ ] Align and distribute selected artwork
- [ ] Eyedropper: pick a colour from the canvas
- [ ] Outline (stroke) on text and shapes
- [ ] Lock layers in the Layers list
- [ ] Team-colour palette per project and recent colours

## Phase 3 · Interface and ease of use
- [ ] Resizable split between properties and Layers
- [ ] Toasts dismiss on navigation and after a shorter time
- [ ] Compact list view in the library, with usage counts
- [ ] Settings page: default scale, units, backup folder, undo depth (move the header Light/Dark toggle there)
- [ ] Recent projects on the welcome screen, sensible default names
- [ ] "Try a sample car" on the welcome screen
- [ ] Step-by-step in-app hints instead of one long Help page

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
- [ ] Code signing for Windows/macOS (needs a paid certificate; owner's decision)
