# SlotForge Livery — desktop preview 0.32

## Reliability review (0.31)

- Losing window focus or pointer capture now ends artwork gestures cleanly. Completed movement is saved and remains undoable; an unfinished pen anchor is cancelled. Escape also finalises moved artwork before clearing selection.
- Wheel zoom stays anchored under the pointer even with Snap enabled. Drawing still snaps to the grid.
- Finishing a slow font import no longer reopens a dismissed library or replaces another dialog.
- Cancelling PNG export during rendering prevents the later Save dialog. Duplicate export clicks are ignored, and finishing an export cannot dismiss a newer dialog.

## Edit several areas together (0.30)

- Shift-click paintable areas on the canvas to add or remove them from the selection. In Layers, Shift-click or Ctrl-click individual areas or entire label groups. A plain click selects one area; clicking empty canvas or pressing Escape clears the selection.
- Colour, gradients, finish, paint effects and Paste Appearance apply to all selected areas. Each edit can be undone as one step, and each area remains independently editable.
- Shapes retain their existing multi-selection, shared paint controls and movement. Ctrl-drag and middle-drag still pan the canvas.

## Canvas responsiveness (0.29)

- The editor caches the combined paint mask for imported vector cars. Moving shapes and decals reuses that mask; changing panel geometry or visibility refreshes it. Preparation and exports retain vector masks.
- Wheel zoom scales the current canvas immediately and commits the detailed vector camera after a short pause. The point under the pointer stays anchored, and starting an edit commits the camera first.
- Mask previews are limited to two geometry snapshots and fall back to vectors if image decoding fails. They are temporary editor data and are never saved into projects or packages.

A local, offline 2D livery editor for user-created slotcar templates. This first test build implements the compact toolbox design explored in `concepts/`.

## Run the app

Double-click **Start Livery.cmd**, or open **dist/SlotForge Livery 0.32/SlotForge Livery.exe**. Keep the packaged folder together. No Node.js, API key or account is needed to run the packaged app.

The library starts empty. The car illustration used for the UI concept is not installed as a template.

## First project

1. Choose **Add your first car**. Enter a name, scale and view.
2. Import an SVG, EPS or vector PDF illustration, or a PNG/JPEG/WebP photograph. Multi-page documents offer a page selector.
3. Vector import opens the large **Prepare your car** workspace. Select areas and assign car-part labels with **Label…** to make them paintable automatically. **Make paintable** also works without a label. Choose **Save preparation**. Only paintable panels become editable regions; other labelled areas remain in the reference drawing. Cancel discards changes. **Generate all vector regions** remains optional. For photographs, enable the reference image and use **Trace with points**. Press Enter to finish a region; trace windows as protected regions. This is manual tracing, not automatic AI vectorisation.
4. Save the import preparation to go straight into the painting editor. The template is saved automatically. Photo tracing and the optional full-region workflow still use **Save template & start painting**.
5. Paint the base, draw shapes, place text or upload PNG decals. Use the right inspector to adjust position, size, rotation, effects and finishes. Use the node tool to move polygon points.
6. Add other views with the thumbnail strip. Views are independently edited. Copy selected artwork between views when useful.
7. Save your livery to the library. Shapes and text stay in the project until you select them and click **Add to Library**. Each save creates an independent snapshot; later edits do not change the library copy. Uploaded images are still retained automatically.
8. Add paint references and workshop notes from **Body paint**, then export a PDF.

## Library and sharing

### Paint label groups and individual areas

The Layers panel groups paintable areas by their car-part labels. Select **Bodywork**, **Wheels**, **Lights**, or another group, then choose its colour, finish and paint effect. These settings apply to that group's areas in the current view. Expand a group to select and paint a single area, or select the area on the car itself. The eye controls hide/show that group's or area's paint. Artwork layers remain separately selectable above the paint groups.

Base paint is the fallback for areas without their own colour. Group/area colours remain independent of later base changes. Undo/Redo, project packages, restart and PDF reports retain area colours and finishes. Saved liveries transfer paint by matching label within each view; areas within a matching label use their order, so check the result on a different car.

### Preparation workspace and batch labels

Assigning any car-part label makes the selected areas paintable automatically. For templates saved in preview 0.5 with labels but no paintable regions, reopen **Prepare areas & labels** and save: the existing labels are recovered as paintable panels without relabelling. The preview remains cancellable.

- Click to toggle an area's selection, or drag a box around several areas. Shift-drag adds to the selection. Select shown, Invert shown and Clear selection work with the filtered area list.
- Select a group, click **Label…**, then choose Bodywork, Windows, Lights, Wheels, Tyres, Trim, Interior or Chassis. The label is retained and the active selection clears for the next batch. Every assigned label automatically makes its areas paintable. Use **Reference only** as an explicit override.
- **Make paintable** and **Reference only** apply to the active selection. Reference-only overrides persist through saves and sharing; assigning a label again makes the area paintable again. Save preparation commits all changes together; Cancel leaves the template intact. Undo/Redo are available within the workspace.
- Use the mouse wheel or zoom buttons, Fit car, Pan (or hold Space and drag), and optional area numbers to inspect small details. The sidebar filters by label, paintability or unlabelled areas, with search and hover identification.
- Labels on both paintable and reference-only areas persist through project saves, template saves and shared packages. Reopen **Prepare areas & labels** to change them. Livery 0.7 or newer is needed to preserve labels.

### Recover a body from line artwork

New vector imports use manual panel selection from the start. Simple filled shapes and enclosed holes in compound outlines can be selected. Reopen **Choose paintable panels** to add or remove panels. Unselected source artwork stays in the reference, not in the editable region list. Template packages retain that reference; use Livery 0.7 or newer to open these templates correctly. The following repair workflow remains available for older templates or after generating all regions.

If colouring a region paints the background or the dark outline instead of the car, open **Prepare template → Recover paintable areas**. Livery detects enclosed holes in compound vector outlines. Click the body panels in the preview, then choose **Use selected areas**. The surrounding white rectangle is hidden, the original linework is protected, and selected panels become paintable vector shapes. Unselected areas remain protected. Choose **Save template & start painting** when ready.

This works with already-imported templates as well as new EPS/PDF imports. The preview is non-destructive, the applied change supports Undo, and the recovered curves stay editable as region assignments in saved/shared templates. Hover over an area or its checkbox to highlight it. Use Body/Protect in preparation to change a panel's assignment later.

Recovery supports closed holes in filled compound outlines with absolute path coordinates (as emitted by the EPS/PDF converter). It does not infer a car's shape from open strokes, close gaps, or identify which parts are bodywork automatically. For those drawings, expand the artwork in a vector editor or use manual tracing.

- Car templates store regions, all prepared views and optional reference photos.
- Projects keep their own template snapshot. Editing a library template does not silently change existing projects.
- Saved liveries can be applied to another car. Their placement is adapted to the available body bounds; check every view afterwards. Logos and text preserve their proportions during this initial fit.
- Export a single item from **User Library**, an entire project, or a complete backup from **Import & Export**.
- `.sfpaint` packages are self-contained JSON files. Imports are validated and appended as independent copies; existing items are not overwritten. They may include your original photographs and PNG images.
- Library artwork is retained independently of project placements. Deleting a library item leaves existing projects intact.

## Storage

The desktop app writes `paintshop-library.json` inside Electron's app-specific user-data folder (normally `%APPDATA%/SlotForge Paintshop`). It keeps the previous successful file as `.backup`, writes through a temporary file, and waits for saving before closing. Use exported packages as your portable backup. This preview stores embedded images in JSON; very large photo collections will require a more scalable asset store in a later release.

## Current limits

- SVG import supports ordinary paths, groups, transforms, rectangles, ellipses, lines, polygons and simple text. Local path references and user-space clipping paths are supported. Expand symbols, masks, bounding-box clipping and effects, and convert SVG text to outlines in your vector editor first. Scripts, external resources, embedded HTML, CSS stylesheets and SVG raster images are not imported.
- The largest filled vector object is only an initial body suggestion. Check it and the other regions before painting.
- Photos use guided manual tracing. No automatic car recognition or generated multi-view geometry is claimed.
- A car has one image per view category in this preview, including one angled view.
- Matte, satin, gloss, metallic and pearl are stored and included in reports, not rendered as realistic materials.
- PDF export is a visual workshop reference. It is not an actual-scale decal sheet, wrap, stencil or colour proof.
- SVGs up to 5 MB, EPS/PDF files up to 25 MB and images up to 10 MB are supported. EPS and PDF imports must contain flat vector artwork; bitmap images and shading are rejected with guidance to use photo tracing. Password-protected PDFs must be unlocked first. Documents may have up to 500 pages; import one page per view. Conversion times out after 30 seconds. Package import is capped at 180 MB.
- Shared packages support the same preview schema (version 1). There is no hosted catalogue or online sharing service.

## Development and verification

Run `npm install`, `node scripts/setup-converter.cjs`, then `npm start`. Converter setup requires 7-Zip installed at its usual Windows location (or the SEVEN_ZIP environment variable). Run `npm run check` and `npm test` for syntax and model checks.

`node scripts/pack.cjs --runtime <path-to-Electron-dist>` prepares a Windows folder build using an existing Electron runtime. Otherwise it uses the installed Electron dependency. The packaged runtime retains its Electron licence and third-party notices.

`tests/smoke.cjs` runs a Playwright Electron integration test against an isolated test library. It covers import, protected areas, editing, reuse, packages, photo tracing, PDF generation and restart persistence. Its fixture SVG is test-only and is not shipped in the app.

`node tests/vector-import.cjs` checks EPS (including binary-preview EPS), PDF page selection, outlined text, clipping, package round-trips, invalid documents and the restricted EPS interpreter. The packaged app includes its converters; users do not need Illustrator, Ghostscript or another app installed separately. See `THIRD-PARTY-NOTICES.txt` for converter licenses and distribution considerations.

## Editable artwork groups (preview 0.11)

- Choose Rectangle or Ellipse in the left toolbar, then drag on the canvas to create a new layer. A single click places a useful default size. Draw shape creates a polygon when you press Enter. No empty shape layer is needed first.
- Shift-click (or Ctrl-click) shapes on the canvas or their Layers rows to select several. Click **Add to Library** and name the grouped artwork. You can also use **Group selection** to organise the current project.
- Placed groups have an expandable folder in Layers. Select the folder to move or colour all its elements; expand it and select a child to edit its own size, rotation, colour, text or points. Alt-click a shape on the canvas to select that child directly. **Ungroup** keeps all elements in place.
- Grouped library items keep separate vector elements, their relative positions, colours and rotations. They remain editable through project saves, library placement and .sfpaint sharing. Use Livery 0.8 or newer to import grouped assets.

## Sharing a collection and choosing a theme (preview 0.11)

Open **Import & Export → Export a package**. Select items from My Cars, Liveries, Shapes & Images and Projects, give the collection a name and export it. Selections carry across tabs and searches. A project includes its car template; groups and embedded images stay editable. The recipient uses **Import a package**. Whole-library backups remain available separately.

The User Library scales with the app window and can also be resized from its bottom-right corner. Search and sort within each category; previews and actions stay accessible as the grid adapts.

The header has a labelled **HELP** button, preceded by **Light / Dark** controls. Your theme is saved on this computer. It changes the interface, leaving artwork colours and PDF output unchanged. Light mode follows SlotForge Timing's warm neutral palette.

If the interface fails to start or its renderer exits, a recovery message offers Restart or Close and records the reason in startup-errors.log beside the saved library.

## SlotForge Livery name

From preview 0.10 the app is called **SlotForge Livery**. Existing projects, libraries and themes continue to use the established local data folder (`%APPDATA%/SlotForge Paintshop`). Existing `.sfpaint` packages remain compatible, and the old launcher forwards to **Start Livery.cmd**.

## Drawing curves (preview 0.11)

Choose **Draw shape (P)**. Click to place a sharp corner; hold and drag to pull out smooth Bézier handles. Mix corners and curves in the same shape. Move within 12 screen pixels of the first point to see the green close indicator, then click to close without adding a duplicate endpoint. This works at every zoom level and independently of the grid Snap setting. Enter also closes the shape; Backspace removes the last point and Escape cancels the draft.

Choose **Edit points & curves (A)** after drawing. Drag an anchor to move it with its handles, or drag a handle to change the curve. Smooth handles move together; Alt-drag a handle to adjust one side independently. Alt-drag an anchor or use **Smooth point** to create handles, and use **Corner point** to remove them. Click-drag curves also work when tracing a new template region.

Curve handles remain editable through resizing, rotation, mirroring, grouped library items, saves and shared packages. Recipients need Livery 0.11 or newer to retain curve handles in editable artwork. Workshop PDFs render the actual curves.

## Removing a view and clearing selections (preview 0.12)

Each imported view has a small × button on its thumbnail. Confirm **Remove view** to remove its drawing, prepared areas and artwork from the current project. Other views, library templates and other projects are kept. **Undo** restores the removed view. If you remove the last view, the project remains available for a new import.

Click empty canvas space, click an already selected paintable area again, or press Escape to clear the selection and inspect your design without selection outlines. Both HELP controls now use text only.

## Fitting graphics to angled views (preview 0.13)

Select a shape, PNG decal, text layer or artwork group, then expand **Fit to angled view** in the inspector. Six illustrated presets provide starting points: Gentle left/right, Side left/right, and Bonnet left/right. Existing rotation is kept.

Fine-tune **Horizontal skew** and **Vertical skew** (−60° to +60°), plus width/height compression (25–150%; 100% keeps the original proportions). Sliders preview live; numeric inputs allow precise values. **Reset skew & compression** clears the current fitting adjustments; Undo restores the previous state.

These are 2D skew/compression guides for approximating an angled panel, not automatic perspective mapping or 3D wrapping. A selected group is fitted as a whole; expand it to edit its individual elements. Ungrouping and saving fitted groups preserve their appearance as editable vector/image elements. Fits persist in projects, library assets, shared packages, saved liveries and workshop PDFs. Recipients need Livery 0.13 or newer to retain the fitting transforms.

## Gradients, finish cues and quick panning (preview 0.14)

Hold the middle mouse button or Ctrl + left mouse button and drag to pan, without switching tools. This also works in Prepare your car. Shift-click remains available for selecting multiple shapes.

Select base paint, a labelled area/group, or editable artwork, then choose **Fill → Gradient**. Add 2–8 colours, set each stop’s percentage position, and adjust angle and strength. Strength blends the stops with the base colour (0% is solid base colour; 100% uses the stop colours). A labelled group shares a continuous gradient across its panels; each shape keeps its own local gradient, which follows rotation and skew. PNG decals retain their original pixels. Solid/Gradient switching keeps the stored stops for reuse.

**Finish preview** above the canvas toggles subtle matte grain, satin/gloss sheen, metallic flecks and pearl tint. These are visual cues, not physical material simulation. The PDF includes actual gradients, all stop colour codes, angle, strength, effect and finish instructions; on-screen sheen/grain is excluded from the PDF. Gradients survive saving, library assets, livery reuse and shared packages. Recipients need Livery 0.14 or newer to retain gradient settings.

## Line and racing-stripe tool (preview 0.15)

Choose **Line / stripes (L)**. Click for corner anchors and click-drag to pull Bézier handles. Press Enter or Esc, right-click the canvas, or click **Finish line** to create an open line with at least two anchors. It does not snap closed when you return to its first point. The **Cancel** button discards a draft; Esc also discards a single unfinished anchor. Backspace removes the latest draft anchor. **Edit points & curves (A)** adjusts anchors and handles afterwards, including Alt-drag independent handles and Smooth/Corner controls. A line layer is created automatically when you finish.

Choose Single, Double, Triple, Thick centre (two thin outer stripes) or Thick + thin. Adjust overall thickness, the gap, individual stripe widths and colours, and flat/rounded ends. Add or remove stripes to create 1–5 parallel bands. Each stripe uses the main fill/gradient until you give it a separate colour; **Fill** restores that inheritance. Dimensions are canvas units, not millimetres. Multiple stripes follow the same editable curve with separate widths and colours. Adjusting thickness does not stretch the centre path. Existing straight-line layers still open and can be converted to editable paths with **Edit points & curves**.

Lines clip to paintable bodywork and support the existing move, resize, rotation, fitting, duplication, grouping, gradient and finish controls. **Add to Library** preserves the editable stripe configuration. Saved liveries, project/library packages and PDF exports retain the result. Recipients need version 0.15 or newer for line artwork.

## Pinch / perspective taper and open Bézier lines (preview 0.16)

**Fit to angled view → Pinch the far end** narrows the left, right, top or bottom end of artwork. Four presets start at 35%; sliders and numeric inputs allow up to 80%. Negative horizontal values pinch left, positive pinch right; negative vertical values pinch top, positive pinch bottom. Pinch combines with skew and compression. Reset pinch preserves skew/compression; Reset all fitting clears the adjustable fit settings. Original artwork and Bézier controls remain editable.

Pinch applies to shapes, line stripes, text, PNG decals and whole groups, including the content inside their boundaries. This is a 2D perspective transformation. Rendering uses a fine triangular approximation; library/project data keeps the original elements and transform. Ungrouping bakes a group fit into each element’s editable baseline, just like existing group skewing. Shared packages retain the editable data. PDF views with pinch use a high-resolution rendered image to preserve seam-free printing; other views remain vector output. Recipients need 0.16 or newer for pinch and open curved-line data.

## Faster pinch preview (0.17)

The editor caches the original artwork as a texture and renders its perspective with the graphics processor. Static car artwork stays in the DOM during edits. Fit sliders redraw at most once per animation frame, and thumbnails refresh on release. Source textures have a 16-entry / 48 MiB budget; unsupported graphics or cache overflow uses a small preview mesh. Original project/library geometry and high-resolution PDF output are unchanged.


## Layer ordering and settings folders (0.18)

Select artwork and use **Bring to front**, **Send to back**, **Bring forward** or **Send backward** below Layers. Drag the grip or name of a layer above or below another row; the coral marker shows its destination. The top of the list is the front of the artwork stack. Car details and base paint remain fixed. Shift-selected elements retain their relative order. Groups move together; expand a group to reorder its children inside it. Ordering supports undo and survives saving, sharing and PDF export.

Right-side settings are organised into collapsible folders for colour/gradient, finish, fitting, position, line stripes, text, curve points and reuse. The app remembers which folders you leave open. Layers stays in its own lower section. **Edit Points (A)** is the last tool in the left toolbar.


## Copy and paste appearance (0.19)

Select a layer and click **Copy Appearance** above its settings folders. Select another layer (or several) and click **Paste Appearance**. The snapshot includes colour, solid/gradient mode, gradient stops/angle/strength, finish, paint effect and artwork opacity. Between lines it also copies stripe widths, colours, gaps and caps; between text layers it copies typeface. Text content, image content, geometry, fitting, layer order and group membership stay with the target. A line's thickness changes when its stripe settings are pasted.

Paint labels, individual paintable areas and Base paint support the same buttons. Copying a label with mixed appearances is disabled until you select an individual area. Copying multiple artwork layers is disabled; you can paste onto a multi-selection or a whole group. Image decals transfer only compatible opacity settings. The appearance clipboard lasts for the current app session and can be reused across projects. Each paste can be undone.


## Editing library details (0.20)

Every car, livery, shape, image and editable group has an **Edit Details** button in User Library. Edit its name, optional creator and description; cars also offer scale, and liveries offer paint references and workshop notes. Save details to update the library copy. Cancel, Escape or the close button discards the edits and returns to your library search. Search also matches creator and description.

Existing projects retain their independent copies. New placements use the edited item name. Details are saved locally and included when sharing .sfpaint packages.


## Transparent PNG export (0.21)

Click **Export PNG** beside Export PDF. Choose an imported car view and a longest-edge resolution of 1,000, 2,000, 3,000 or 4,000 pixels. The current view is selected initially. The checkerboard preview shows transparent areas; optionally include the paint finish preview. **Save PNG** opens the native save dialog.

The result is cropped to visible artwork with a small transparent margin. Car details, paint, shapes and decals are included; hidden layers, canvas, selection outlines and photo tracing guides are excluded. White paint remains opaque white. Background shapes already embedded in imported artwork are retained. Exporting does not alter the project or active view.


## Reliability review fixes (0.22)

- Cancelled car imports cannot replace views or modify another project.
- Automatic backup rotation preserves validated data even if a file replacement fails. Recovery imports archive the previous files, save the restored library and resume normal saving.
- Whole-library packages support more than 500 items per category within the existing 180 MB limit. Editable groups and livery artwork use that same package size limit instead of mismatched item-count caps.
- Selecting artwork or its editing handles preserves Redo until an actual drag begins.
- Edited polygon bounds include extended points and handles, including when pinched.
- Applying liveries scales curved stripe widths and gaps by the smaller of the horizontal/vertical fitting ratios, matching proportion-preserving artwork.
- Unfinished photograph templates reopen in preparation mode; switching views updates that mode for the destination.
- Reused geometry, cached paint masks and overlap filtering reduce rendering work for complex imports.
- Rotation normalisation preserves appearance across package round trips.
- Shutdown waits for the current storage queue before closing.


## Custom fonts (0.23)

Use **User Library → Fonts → Import font**, or **Import font** under a text layer's Typeface menu. TTF, OTF, WOFF and WOFF2 files up to 10 MB are supported. Fonts are loaded locally within Livery; they are not installed in Windows. Importing one font while a text layer is selected applies it immediately. Duplicate uploads reuse the existing library font.

Imported fonts have a preview and editable library details. Each text layer keeps an embedded font copy, so removing a library entry leaves existing designs intact. Fonts survive Undo, grouped artwork, Copy/Paste Appearance, liveries, project packages and restart. Selecting a built-in typeface clears the custom font on that layer. Font packages can also be exported separately or selected in Export a Package.

PNG export embeds the correct font in the design; PDF views containing custom fonts are rendered at high resolution to keep their appearance consistent. A recipient needs Livery 0.23 or later to use custom fonts in editable packages.


## Automatic area simplification (0.24)

If preparation finds more than 250 enclosed areas, Livery automatically filters smaller selection targets. The original drawing, detailed linework and exact curves remain intact. A notice explains how many areas are available and how many smaller areas were omitted from selection. This applies both to Prepare areas & labels and Recover paintable areas after generating vector regions.

Drawings within the limit are unchanged. Overloaded drawings favour areas whose bounding boxes cover at least 0.1% of the imported view, retaining at most 250 selection targets. Previously prepared/labelled areas are prioritised even when small. If the drawing contains only similarly small areas, the largest 250 are offered. Use Add filtered areas to restore an excluded detail, or Trace with points for geometry that was not detected. Cancelling does not change the template.


## Restore filtered areas (0.25)

In a simplified preparation workspace, choose **Add filtered areas**. Hover over an omitted area to highlight its exact outline, then click to restore it. Added areas become selected and paintable; use **Label** to place them in Bodywork, Lights or another group. Add several details, then click **Done adding areas** to return to normal selection. Zoom and pan remain available.

Restored areas retain their original curves and survive saving, reopening and package sharing. The preparation workspace supports Undo/Redo for these additions, and Cancel discards them. The same add mode is available in the older Recover paintable areas chooser. At 250 available areas, restoration returns an unused, unselected area to the filtered set when possible; it never replaces an existing prepared area or one you have selected.

## Smoother canvas editing (0.27)

Panning keeps existing artwork in place in the renderer. Moving individual artwork reuses its geometry and perspective preview; only its position changes. Preview caches are bounded, changes to appearance refresh them, and pointer movement is drawn once per animation frame. Saved artwork and full-quality exports retain their editable geometry.

## Faster canvas panning (0.28)

The canvas moves as one composited surface during hand, middle-button and Ctrl-drag panning. This avoids rasterizing nested paint masks on every mouse movement. On release the vector camera commits to the new position; design data, zoom and undo history stay unchanged. Content outside the initial view remains available during the drag.
