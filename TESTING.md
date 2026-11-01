# Preview 0.31 review

The review covers changes since the 0.22 reliability review: custom fonts, simplification and restoration of filtered areas, rendering caches, canvas pan/zoom, and simultaneous painting of selected areas. Related asynchronous export and gesture cleanup paths were also inspected.

Verification on 1 November 2026: syntax checks, all 25 model/storage tests and all 32 desktop integration suites passed. The packaged 0.31 executable separately passed the new interruption/cancellation suite, multi-area editing, and the full save/export/restart smoke workflow. Detailed results are in `test-output/integration-results.json`.

`tests/review-interactions.cjs` reproduces window blur, pointer-capture loss and Escape during artwork movement; checks saved positions and atomic Undo; cancels a pen handle gesture; verifies the wheel anchor with Snap enabled; delays font decoding while closing/replacing the library; and delays PNG rendering while cancelling or clicking Export twice. The tests use isolated profiles and do not modify the user's library.

The canvas regression suites check retained artwork nodes, bounded mask caches, vector-versus-preview pixels, protected openings, hidden panel invalidation, unchanged vector exports, pointer anchoring, pan/zoom cleanup and immediate editing after zoom. `multi-paint.cjs` covers selection across labels, independent gradient copies, batch edits, deselection, view changes, bucket painting and Undo/Redo.

The supplied detailed EPS was exercised locally: 599 detected areas, 73 initial candidates and 526 filtered details. The mirror detail was restored with its original bounds and curves. The private EPS and exported Aston Martin remain test-only inputs and are not bundled with the app.

## Historical verification: Preview 0.9

Verified on Windows on 1 November 2026.

- JavaScript syntax checks passed.
- Six model tests passed: independent template snapshots, livery fitting, readable mirrored lettering, unsafe-image rejection, import bounds validation, and retention of artwork for missing views.
- The full Electron integration test passed against both the source application and the packaged Windows executable.
- Integration checks covered: empty starting library; SVG import and region roles; painting; actual canvas drawing and movement; undo/redo; editable text; transparent PNG upload; explicit artwork library saves; independent named snapshots; saved liveries; notes; native PDF generation; self-contained project export/import; applying a livery to another car; adding and copying between views; manual photo tracing; rejection of unsafe SVG content; saving and restart persistence.
- No renderer exceptions were reported.
- The empty state and editor were visually inspected. Layers are docked below independently scrolling properties to preserve access at smaller window heights.

The test uses an isolated profile under `test-output/`. It does not populate the user's real library or install its fixture car. Test output is excluded from the packaged app.

Automatic photo vectorisation, broad third-party SVG compatibility, exact colour reproduction and calibrated print dimensions are not claimed by this preview.

## EPS and PDF import

- Genuine PostScript EPS and DOS binary-preview EPS convert to editable regions, including Bezier curves and outlined text. Implicitly closed filled paths are recognised as paintable areas.
- Multi-page PDFs offer a page selector; the selected page alone becomes the chosen car view.
- Local SVG references are expanded and user-space clipping is retained through template rendering and package export/import. Clip geometry is not recoloured as paintable geometry.
- Invalid EPS/PDF, invalid page numbers, unsupported bitmap content and cyclic/external SVG references are rejected. Failed imports preserve the open project.
- Ghostscript is run with SAFER restrictions, explicit argv, an isolated temporary folder, a bounded output size and a deadline. A test attempting to write outside that folder is rejected.
- Conversion happens in a separate process. The desktop package includes the converter, MuPDF runtime and third-party license notices.
- EPS/PDF fixtures are test-only; no car templates are pre-installed.

## Enclosed-area repair

- `tests/repair.cjs` verifies candidate detection on an even-odd compound path, a surrounding white rectangle, and a separate ink island within a panel. Pixel checks confirm that artwork fills the recovered body, stays out of windows/ink islands, and leaves the exterior transparent.
- The preview and Cancel leave the original template unchanged. Apply supports Undo/Redo. Recovered flags and vector paths survive package validation; workshop PDF export works.
- The supplied Porsche EPS was tested locally (not shipped or committed). It produces 49 recoverable contours. The two largest body areas were selected through actual canvas clicks and painted successfully. The existing saved template with its hidden background and recoloured outline was also tested, without changing the user's library.
- Optional `REPAIR_EPS` and `REPAIR_LIBRARY` environment variables exercise those private files in an isolated test profile.

## Manual panel selection as the default

- `tests/panels.cjs` checks that import creates zero editable regions and opens the panel chooser. Applying a selection creates only the chosen panels; cancelling does not generate objects. Unfinished imports resume preparation after restart.
- Solid SVG panels and enclosed EPS contours are selectable. Existing selections can be reopened and edited. Pixel checks verify that unselected windows remain protected and that explicitly choosing a window allows it to be painted without its enclosing source body blocking it.
- Source references and panel selection survive a real project package export/import. The optional Generate all vector regions button creates the full object list while retaining chosen panels, and supports Undo.
- The supplied Porsche EPS was exercised with two manual canvas selections, producing exactly two editable panels. PDF export and the existing full-region, EPS/PDF and editing tests passed.

## Preparation workspace and batch labels

- `tests/panel-studio.cjs` exercises five Bodywork areas followed by seven Windows areas, fresh selections after labelling, automatic paintability, relabelling, filters, Undo/Redo and cancellation.
- Real gestures check box selection and pan; zoom, fit and area numbers are checked. The layout is inspected at normal size and 1050 × 720, with the canvas, list and save controls remaining accessible.
- Labels survive restart and a real exported/imported package, including labels on reference-only areas. Original templates remain unchanged until Save preparation.
- Existing panel import, paint clipping, optional region generation and full editing integration tests remain passing.

## Automatic paintability when labelling

- `tests/label-paintability.cjs` verifies that assigning any label creates paintable geometry without a separate Make paintable step. Explicit Reference only overrides survive validation, and assigning another label makes an area paintable again.
- A test copy of the user's saved Test car recovered 12 existing labels. Pixel checks verified that the recovered body receives paint. Cancelling the recovery preview leaves the saved template untouched.
- The five-area/seven-area batch test now verifies 12 automatically paintable regions and retained labels across restart and package export/import.

## Label groups in the painting editor

- `tests/paint-layers.cjs` verifies that saving a labelled import goes straight to painting, with a saved car template and selectable label groups.
- Tests paint two Bodywork areas together, Wheels separately, and one expanded Bodywork child independently. Pixel checks verify different actual rendered colours, visibility and restored paint.
- Canvas selection, undo/redo, restart, project packages, saved livery data and workshop PDF colours/finishes are checked. A private copy of the user's Test car is also painted by label and visually inspected.
- Group edits apply to the current view. Base paint remains the fallback for areas without overrides; it does not overwrite assigned group colours.

## Explicit saves and editable artwork groups

- `tests/artwork-groups.cjs` covers direct rectangle clicks, ellipse drags and polygon drawing without a prerequisite artwork layer, including switching from template preparation.
- Drawing/editing leaves the shape library empty. Explicit saves capture independent single shapes or groups. Child editing, group movement and visibility, duplicate/delete/undo, ungroup/regroup, package export/import and restart preserve editable elements.
- Group assets retain rotation, separate colours, opacity, polygon points, text and relative coordinates. Model tests verify independent identities and copies.
- Existing smoke, paint-label and panel-preparation workflows are checked with isolated profiles. The grouped editor screenshot is saved under `test-output/13-artwork-groups.png` for visual review.

## Collection export, library layout and themes

`tests/library-sharing.cjs` checks selected multi-category packages (including editable grouped artwork), cancellation, package import, library search/sorting, 1050 × 720 layout, Help access, theme persistence and unchanged project artwork. Screenshots cover the light library, compact layout and dark export picker.

The reported blank 0.8 window was recovered by restarting the stalled process. A copied user library loaded successfully; its contents were not the reproduced cause. Startup readiness monitoring and renderer-exit recovery now provide an explicit error/restart path. The original cause of the stalled launch remains unconfirmed.

## SlotForge Livery rename

Preview 0.10 updates visible branding, Help, PDF reports, package descriptions, executable and launcher. The established storage path, JSON schema, browser storage key and .sfpaint package format are preserved for compatibility. Packaged workflow checks verify export/import and restart with the new name.

## Magnetic closure and Bézier drawing

`tests/curves.cjs` verifies click-drag handles, mixed straight/curved segments, magnetic closure with no duplicate point, screen-distance snapping under zoom/pan and grid snap, rotated node editing, symmetric and independent handles, smooth/corner conversion, Escape, Enter, manual tracing, undo, asset export/import, PDF generation and restart. Model tests cover control-point normalisation, legacy straight polygons, validation, mirroring and grouped snapshots. Existing smoke and artwork-group regressions pass. Screenshots: `18-curves-close-snap.png` and `19-edit-curve-handles.png`.

## View removal and clean preview

`tests/view-removal.cjs` covers text-only Help, empty-canvas and repeated-area deselection, Escape, removing active/inactive views, cancellation, complete undo/redo restoration, library/other-project isolation, last-view empty state, package round-trip, restart and adding a replacement angle. Existing paint-layer regressions verify selection and painting remain available.

## Angled-view fitting

`tests/fitting.cjs` covers six presets, numeric controls and live sliders with a single undo step; reset; transformed selection bounds, resize and Bézier editing; coherent group fitting/movement; separate PNG/text/vector elements; ungroup appearance; editable package export/import; PDF output and restart. Model tests cover transform inversion, fixed-corner resizing, group/child translation, baking without flattening, mirroring, validation and fitted-livery reuse. Existing curve, grouping, smoke and view-removal regressions also pass. Screenshot: `21-skew-presets.png`.

## Gradients and temporary panning

`tests/gradients-pan.cjs` checks middle-button and Ctrl+left panning across select, shape, pen and paint tools without changing artwork, selection, undo or unfinished outlines. Pixel checks cover multicolour gradients, orientation, strength, continuity across labelled panels, optional finish cues and stop limits. Live slider undo, solid/gradient switching, library/livery/package validation, workshop PDF generation and restart are covered. Model tests bound external stop counts, positions, angles, strength and colour values. Packaged 0.14 gradient and fitting checks passed, alongside paint-layer, smoke and panel-studio regressions. Screenshot: `22-gradients.png`.

## Editable line and stripe tool

`tests/lines.cjs` tests drag-to-draw and click-to-place, automatic layers, five presets, independently editable stripe widths/colours, proportional overall thickness, transparent gap pixels, flat/rounded caps, gradient inheritance, Shift angle constraints, reversed/vertical lines, Escape cancellation and temporary pan. It also verifies undo, fitting, explicit library saving and package import/export, livery transfer, PDF output and restart. The packaged 0.15 run passed with checks at 1050 × 720. Model tests cover endpoints, thin-line ratios, validation, grouping and mirroring. Existing gradient, artwork-group and smoke regressions passed. Screenshots: `23-line-stripes.png`, `24-line-controls.png`.

## Perspective pinch and open Bézier lines (0.16)

`tests/pinch-curved-lines.cjs` checks open pen-style lines with corner/curve anchors, independent stripe widths, non-closing paths, cancellation, inverse editing after pinch, directional taper presets, slider undo/reset, solid mesh coverage, coherent PNG/text/line groups, movement, ungroup appearance, package export/import, high-resolution PDF preparation and restart. Model tests verify perspective corners, inversion, fixed-corner resize, validation, group baking and mirrored curved stripes. Existing fitting, curve, gradient and straight-line compatibility regressions pass.

Visual verification caught vector PDF blend seams; pinched views now render to 3000 × 1800 PNGs before printing. Project/library data stays editable. MuPDF rendering of the final PDF confirmed clean curve, text and PNG output. Screenshots: `25-curved-line-pinch.png`, `26-pinch-pdf.png`. The old `tests/lines.cjs` now covers loading/editing legacy straight-line configurations; new drawing gestures are covered by `pinch-curved-lines.cjs`.

## Pinch performance (0.17)

`tests/pinch-performance.cjs` compares 0.16 with the current build using a private copy of the active design (or a synthetic fallback). It measures settled frame duration and SVG element count, checks one redraw per burst of slider input and no thumbnail rebuild during the gesture, and verifies a transparent PNG’s orientation, alpha and colours through the GPU preview. The source test measured 203 ms → 73 ms average over twelve frame updates, including frame waits, and 3,247 → 1,018 canvas nodes. Cached car geometry, a cached GPU texture/warp preview, inexpensive invisible hit targets and a small fallback mesh replace the expensive live blended mesh. Perspective editing/sharing/PDF, fitting, paint layers, curves, smoke and model regressions pass.


## Layer ordering, folders and line completion (0.18)

`tests/layer-order-folders.cjs` checks button and real mouse drag ordering, rendered overlap pixels, multi-selection, whole groups and children, undo/redo, disabled boundary buttons, fixed body rows, folder defaults/persistence, minimum-window layout, toolbar order, livery order, PDF and restart. Model tests exercise stable ordering and scoped child moves. Legacy editing tests explicitly open property folders; the new test checks their normal collapsed defaults. `pinch-curved-lines.cjs` additionally checks right-click and Esc completing two-anchor open curves, undo and explicit Cancel, with Esc discarding a single anchor.


## Appearance clipboard (0.19)

`tests/appearance.cjs` checks independent snapshots, gradient/paint/finish/opacity transfer, unchanged geometry, undo/redo, multiple targets, stripe settings without replacing curve anchors, paint-area/base interoperability, unchanged image/text content, typeface transfer, solid-fill gradient reset and saved-project restart. Paste starts disabled in a fresh session. The standard desktop smoke regression also passes.


## Editable library details (0.20)

`tests/library-details.cjs` checks all five item types, required trimmed names, Cancel/Escape, search/sort restoration, independent project data, renamed shape placement, template metadata retained after preparation, shared package round-trip and restart persistence. It verifies geometry and embedded image data remain unchanged. Screenshot: `30-library-details.png`.


## Transparent PNG (0.21)

`tests/png-export.cjs` checks native file saving and signature, cropped output dimensions, alpha transparency, opaque white paint, coloured shapes, PNG decals, hidden artwork, alternate-view selection, cancel without overwriting, invalid IPC data and project/selection/undo isolation. A copied active car design was visually checked on the transparency preview. Screenshots: `31-transparent-png.png`, `32-car-png-preview.png`.


## Reliability review regression tests (0.22)

Run `npm test` for the model and storage tests, `node scripts/test-integration.cjs` for all desktop integration suites, and `node tests/pinch-performance.cjs` for the perspective performance comparison. Each desktop suite uses a disposable profile in test-output.

The review regression suites exercise cancelled delayed imports, selection/Redo, large-library imports, saved photo drafts, rotation round trips, scaled line widths, edited polygon raster coverage, mask generation and recovery imports. Storage tests inject failed writes, preserve good backups, archive corrupt originals, recover missing/invalid primaries and check serial saves. Results are written to test-output/integration-results.json and review-*-fixed.json.


## Custom fonts (0.23)

`node tests/fonts.cjs` uses a local Windows font (override with TEST_FONT) in an isolated profile. It checks upload, duplicate handling, typeface changes, embedded SVG raster output versus a built-in fallback, appearance copying, library renaming/removal, font-only and project packages, PDF, invalid files and restart. No third-party font files are included in the app.


## Automatic area simplification (0.24)

`node tests/area-simplification.cjs` checks a 321-area compound path, unchanged source geometry, cancellation, body labelling, preservation of small labelled areas, package validation, legacy recovery, small drawings and the 250-target fallback. Set DETAIL_EPS to a detailed EPS path to exercise native conversion and preparation as well. The supplied front-view car produced 599 eligible areas: 73 remain available and 526 smaller targets are omitted while their linework stays visible.


## Restore filtered areas (0.25)

`node tests/restore-filtered.cjs` covers hover highlighting, restoration, selection, labels, Undo/Redo, Cancel, saving/reopening, restart, package validation, legacy recovery, capacity swapping and protection of prepared areas. Set DETAIL_EPS to test the supplied front-view EPS and restore its filtered mirror detail. The screenshot is written to test-output/restored-mirror.png.
