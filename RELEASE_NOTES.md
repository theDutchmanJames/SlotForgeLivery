**SlotForge Livery 1.3.0 — Bring your decals into your design**

**From White Kits to your Design Concept**

## What's new and where to find it

- **Richer vector decal imports:** SVG, EPS and PDF artwork retains supported gradients, masks, clipping, symbols and embedded images. Open **Import & Export → Import decal artwork or Decals sheet**, **User Library → Shapes & Images → Import artwork**, or the artwork tool (**I**).
- **SlotForge Decals sheets and packs:** import `.sfsheet` and `.sfdecal` files, browse separate decals, search and select the ones you want. Groups, embedded custom fonts and relative sizes are preserved as vector artwork.
- **Library-first importing:** **Import to library** leaves your car unchanged. Click **Place** on an individual library item when needed. Placing a batch directly requires an explicit choice, and the button shows the decal count.
- **Separate decals from PDF/SVG sheets:** enable **Select separate decals**, zoom in and draw a box around each graphic. Optional **Remove white page background** removes a plain white page. Crops share source artwork in SQLite to avoid duplicating the sheet's media.
- **Scale groups and multi-selections:** select a group or several layers, then use **Scale selection** in the right-hand inspector: linked width/height, percentage, or the canvas corner handle. Relative positions, proportions, stripe widths and gaps scale together, including perspective-fitted groups. Livery's individual elements remain editable.

## Choosing the best import

Use the original **Decals `.sfsheet` or `.sfdecal`** when possible: it retains the individual decal boundaries. PDF files may have lost those groups, so rectangular crop selection provides manual control; overlapping boxes can include neighbouring artwork.

Imported decals keep their original colours and internal vector detail. Their internal text and paths are not converted into Livery text or point-editing tools. Edit those details in Decals and import the updated artwork. Livery uses concept-artboard sizing rather than physical decal printing dimensions.

## Updating

Your existing library stays in the same location. Older JSON libraries still convert automatically to SQLite, with their original JSON and backup files preserved. Export a library backup for a portable copy.

**Projects and packages containing the new vector decal layers require Livery 1.3.0 or later.** Earlier versions do not understand those layers. Existing shapes, car templates and `.sfpaint` packages continue to work.

## Downloads

Choose the application for your operating system from the attached downloads. Windows uses a portable `.exe`; Linux offers `.AppImage` and `.deb`; macOS, when supplied, offers separate Intel (`x64`) and Apple silicon (`arm64`) packages. See the README for installation instructions.

EPS/PDF conversion is bundled and works offline. No account is required. Windows applications are unsigned; macOS packages are not notarised.

## Verification and source

Release assets are published only after their native build and packaged checks pass. Tests cover separate library placement after restart, SVG rendering, EPS/PDF conversion, font preservation, group scaling, undo, SQLite persistence and package sharing.

Livery is licensed under **GNU AGPL version 3 or later**. Corresponding source archives, build instructions and checksums accompany the downloads.
