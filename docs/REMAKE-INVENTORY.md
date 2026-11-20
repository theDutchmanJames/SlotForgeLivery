# Remake inventory (1.4.0)

Which screens were built "to work" and would do well with a **remake**, not just a restyle, in the way Timing and
Paddock were remade. A remake rethinks what the screen is for, its flow and its features, and checks for missing features
to suggest (each one is approved before it is added). A **redesign** keeps the function and only changes the look. Every
item gets a preview with two different options to choose from before anything is built (`docs/ui-reference/<item>-2026-11/`).
Line numbers are from commit ffc897e. Screenshots: a tour of every screen at 1600×1000, dark theme.

Verdicts: **Remake** · **Rework** (a smaller remake of one part) · **Fine**.

## What keeps coming back
1. **Livery has one real page.** Projects, User Library, Import & Export and Help sit in the top nav like pages, but they
   open as dialogs over the Paint Studio (one shared `#dialog`, dialogs-import.js:7). Only Settings is a page.
2. **Three bars before the canvas.** App nav, project bar and the Arrange/View bar take about 195 px. The version, a
   Light/Dark switch and HELP are in the header, and HELP is there twice (header and the bottom of the toolbox).
3. **One right-hand column for two jobs.** The inspector and Layers share the right column, each scrolling in about 380 px.
   The colour folder is cut off ("No paint product chose…"), and Copy/Paste Appearance sits above everything.
4. **Help before content.** Projects and the Library open with an explainer box; Add car ends with two lines of disclaimers
   ("No AI conversion or 3D reconstruction is implied").
5. **One task, different tools.** Preparing a car is Panel Studio ("Prepare your car": Area 1…12, labels,
   Paintable/Reference) *and* the inspector's Prepare template (Region 1…, Body/Protect/Detail/Hide, Recover paintable
   areas, Trace with points).
6. **Project tools hidden in the selection.** Mirror whole side, Real size, Send to Decals, Notes and Copy to view live in
   the inspector's "Workshop & reuse" folder, which shows only when artwork is selected.
7. **Empty slots that look like content.** The view strip shows five big "+" tiles for every one real view; the step hints
   cover the top right of the canvas; toasts land on top of the view labels.

## Tier 1: the biggest wins

### 1. Paint Studio workspace · Remake · **Done ("Workbench", option A of `ui-reference/studio-2026-11`)**
One top bar with the ≡ menu and Print & export, the Layers column with team colours, view tabs above the canvas, a status bar
with the canvas switches, the Selection and Workshop tabs, a quick bar over the selection and a right-click menu. Code:
`renderer/app/workbench.js`, `renderer/workbench.css`; test: `tests/workbench.cjs`. Still open from this item: livery colours
linked to real paints and "keep both sides in step" (both with #5), the painting order shown in the canvas.
- **What's wrong today:**
  - the three bars at the top (see 2 above)
  - the inspector and Layers squeezed into one column (3)
  - the project tools inside the selection (6)
  - the view strip of empty tiles (7)
  - the inspector itself is one 4,900-character HTML string that is then sorted into folders by searching the page
    (inspector.js:163, `organiseInspector` 196-292)
  - team colours are removed by right-click only (events.js:622), and the canvas and Layers have no right-click menu
- **Ideas:**
  - one slim top bar
  - Layers and the inspector as two real columns, or as tabs
  - the views as tabs or a filmstrip that only shows the real views, with "Add view" as one button
  - a project-level **Workshop** panel (real size, paints, mirror, notes, decals)
  - a right-click menu on the canvas and Layers
  - a small floating bar beside the selection (colour, duplicate, mirror, delete)

### 2. Prepare template (the flow) · Remake · **Done ("Guided setup", option A of `ui-reference/prepare-2026-11`)**
Add a car is steps 1–2 with a stepper; the setup page does 3 Panels, 4 Parts (your own part names, up to 40 characters,
now valid everywhere a label is stored) and 5 Size (real length ÷ scale, saved as the view's real size), then saves the car
(update it, or save as a new car) and opens it to paint. Prepare template offers it again for vector views. Code:
`renderer/app/setup.js`, `renderer/setup.css`; test: `tests/setup.cjs`. Still open: the Right side as a mirror of the Left,
photos (still traced in the studio's preparation tools), and the detailed editor (Panel Studio) remains for complex drawings.
- **What's wrong today:**
  - four tools with four names for one task (5 above)
  - only 8 fixed part labels with one body label, "Bodywork" (model.js:6), so the bonnet, roof, doors or number panel
    can't be grouped for painting
  - "Finish preparation" silently overwrites the car in the library (actions.js:96-119)
  - angled photos need skew and pinch sliders set by hand (fit-lines.js:85-110)
  - the real size (mm) is asked for much later, inside a selection's inspector (workshop.js:15-19), and the scale chosen
    in Add car is never used to work it out
- **Ideas:**
  - one guided flow: Import → Pick the paintable panels → Name the parts → Real size → Done
  - part labels you can make yourself (bonnet, roof, doors…)
  - prepare the left side and mirror it to the right
  - "Save as a new car" or "Update the car" at the end, instead of a silent overwrite

### 3. Projects, Library and Import & Export · Remake (one place) · **Done ("Parts Room", option A of `ui-reference/garage-2026-11`)**
The Garage page: a rail of cars and library sections, a car's liveries as cards with colours and status (Being painted,
Finished), a detail panel (open, rename, duplicate, use on another car, share, save as design, Move to Trash), the Trash
(30 days, put back), the library sections inside the page, and Backups with "bring back what's missing". Code:
`renderer/app/garage.js`, `renderer/garage.css`, backup listing in `src/maintenance.cjs`; test: `tests/garage.cjs`. Still
open: "Replace my library" from a backup, a Trash for cars, designs, artwork and fonts (they are still removed at once),
dragging a file in to add a car, and Import & Export remains a dialog. The Welcome screen is unchanged.
- **What's wrong today:**
  - three dialogs for one collection
  - a "project" and a "livery" overlap: a project is one livery on one car, and a livery is a saved design for any car
  - Projects has no search, sort, duplicate or rename (library.js:388-414), while the Library has them
  - deleting a project or a library item can't be undone (events.js:299-351)
  - every PNG that is added is also saved to the library without asking (dialogs-import.js:252)
  - Import & Export is four buttons of plumbing, and decal import is reached three ways
- **Ideas:**
  - a real **Garage** page: cars with their liveries under them, and a big card per livery with the car's picture
  - Duplicate, Rename, a Trash with Restore
  - search and filter by car, scale or series
  - Import and Export as actions on that page, not a destination

### 4. Export and the workshop · Remake (one Print centre)
- **What's wrong today:**
  - Export PDF goes straight to a save dialog, with no preview (export.js:211-223)
  - the workshop PDF says "not actual size" (export.js:64)
  - true-size masks are a separate PDF reached only from the inspector (workshop.js:229)
  - the paper size is picked for you, A4/A3/A2 only (workshop.js:290-300)
  - PNG exports one view at a time
- **Ideas:**
  - one **Print centre** with a large preview and a choice of output: Workshop plan, Masks at true size, Decal sheet,
    Pictures (PNG, all views at once)
  - scale chosen as 1:32, 1:24 or 1:43
  - a **waterslide decal sheet**: numbers and logos laid out on A4 or Letter, with an option to mirror them or print a
    white layer underneath, and a ruler to check the print scale (today decals only go out to SlotForge Decals,
    workshop.js:357)

### 5. Colours and paints · Remake · **Done ("Livery colours", option A of `ui-reference/colours-2026-11`)**
Each livery has up to 12 named colours (`project.liveryColours`, `palette` kept in step), shown as cards under Colour, in
Layers and in the Workshop tab. Everything painted in a colour's exact hex uses it: editing repaints every use (one undo),
linking a paint sets `paintRef` on every use, merge and remove. Choose the real paint is a large window sorted by closeness
(CIE Lab), with "Have it?" (`settings.ownedPaints`) and the shopping list, also in the workshop PDF. Code:
`renderer/app/colours.js`, `renderer/colours.css`, the catalogue in `workshop.js`; test: `tests/colours.cjs`. Still open:
paint quantities, sharing a paint shelf between computers, and Notes' free-text paint references (kept as they were).
- **What's wrong today:**
  - paint references exist three times: free text in Notes (export.js:10), the catalogue's paint per colour
    (workshop.js:51-54) and the Library's Edit details (library.js:285-287)
  - Revell and Zero Paints are listed brands with no paints (paints.js:4-5, 89)
  - "Add one of my paints" is hidden in a fold
  - team colours exist, but they are just swatches
- **Ideas:**
  - a **livery palette**: named colours ("Gulf blue") each linked to a real paint, so changing one recolours every use
  - the catalogue as the way to fill that palette
  - a shopping list of paints in the workshop PDF

## Tier 2: rework one part

| Screen | What to rework | Ideas |
|---|---|---|
| Add car | Disclaimer lines; scale is a plain list; Add view and Replace view use the same dialog | Part of the Prepare flow (#2); real length entered here |
| Text and numbers | Always starts as "27" in Arial; fonts are imported from three places | **Number and name sets**: one livery, many race numbers and driver names, exported per car |
| Mirror and Copy to view | Two features for one idea, buried in the inspector; left/right only | "Keep both sides in step"; part of the Workshop panel (#1) |
| Side by side | Read-only; it needs a toggle *and* a drop-down | All views at once as a contact sheet |
| Backups and recovery | No list of backups and no Restore (maintenance.js:14-28); restoring means importing, which *adds* copies (sharing.js:290, 325); "Library recovery required" has no buttons (main.js:173-182) | A backups list with dates and Restore (replace or merge) |
| Import confirm | Shows "2 templates · 1 assets" (sharing.js:291-293), no preview | Cards of what comes in, duplicate check |
| Help | A one-paragraph tab on a huge page; the tab names keep "1." because of a broken pattern (`/^d+.s*/`, dialogs-import.js:288); the version is typed in by hand (dialogs-import.js:272, index.html:24) | A Help reader like Settings; a "?" per panel |
| Welcome | The left and right columns repeat the same steps | A start page that is also the Garage when you have cars (#3) |

## Fine as they are
- **Settings:** three sections, with a rail that shows a summary of each.
- **Update window:** shared with Circuit.
- **Layer order:** dragging plus buttons.
- **Shapes picker.**
- **Notes:** once the paints move to the palette.
- **Export a package.**
- **PNG export dialog:** a good settings-and-preview split, and the model for the Print centre (#4).

## Suggested order
1. **Paint Studio workspace** (#1): it's where you spend all your time, and every later remake sits inside it.
2. **Projects, Library and Import & Export → Garage** (#3), together with the Welcome screen and backups.
3. **Prepare template** (#2), with Add car.
4. **Colours and paints** (#5), then the **Print centre** (#4), since its shopping list and decal sheet build on the palette.
5. The Tier 2 reworks: Text and number sets, Help, Side by side.
