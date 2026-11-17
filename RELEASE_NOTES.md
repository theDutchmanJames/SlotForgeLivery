**SlotForge Livery 1.4.0 — From design to workbench**

**Faster editing, real-world sizes and everything you need at the paint bench**

## What's new and where to find it

**Editing**
- **Align and distribute** several selected layers from the right-hand inspector.
- **Eyedropper:** pick a colour straight from the canvas.
- **Outlines** on text and shapes, and a **hard drop shadow**.
- **Lock layers** in the Layers list so they cannot be moved by accident.
- **Team colours** per project, plus your recently used colours.

**Design tools**
- **Rulers and draggable guides**, saved per view. With Snap on, artwork snaps to guides, the car centre line and panel edges.
- **Text:** spread letters to fill the box width, or bend text along an arc.
- **Preset shapes:** number board, roundel, chequered band, shield and star.
- **Mirror a whole side** onto the other side, fitted to that view.
- **Side-by-side pane** showing another view of the car live while you work.

**Slotcar workshop**
- **Real-world scale:** set a view's real width in mm for mm readouts and mm rulers.
- **Print at true size:** one masking template per colour plus the full design, with a 50 mm check bar.
- **Paint catalogue:** Tamiya (TS, X/XF) and Humbrol built in; add Revell, Zero Paints and others under **My paints**.
- **Workshop PDF:** paint products and a painting order (lightest first), with a picture per step.
- **Send decals to SlotForge Decals** as a `.sfdecal` pack at real size.
- **Photo tracing aids:** photo opacity and a centre guide for symmetry.

**Interface**
- Resizable split between the properties and the Layers list.
- Compact list view in the library, with usage counts for cars.
- **Settings → Studio:** scale for new cars, undo steps, finish preview, Snap/Grid on start and tips.
- Recent projects and **Try a sample car** on the welcome screen.
- Step-by-step tips on the canvas; Help is split into tabs.
- Notifications clear when you change screen.

**Safety and maintenance**
- **Automatic backups** to a folder you choose, daily or weekly, keeping 5–50. Each backup is a normal library package.
- **Update check:** once a day Livery checks GitHub for a newer release and shows an **Update** button in the header. It sends nothing about you or your designs; switch it off in **Settings → Updates**.
- **Lighter undo:** undo steps share images and fonts instead of copying them, so a design with a large photo uses far less memory.

**Speed**
- Edits redraw about ten times faster on detailed cars with several views and photo decals.
- Autosave after an edit, switching projects and opening the library are all quicker.

**Fixes**
- Fixed the "Unreferenced library record" save failure after preparing a car template.

## Downloads

Every system now has both an **installer** and a **portable app**:

- **Windows:** `…-windows-x64-setup.exe` (installer) or `…-windows-x64-portable.exe`.
- **macOS**, when supplied: `.dmg` (installer) or `.zip` (portable), for Intel (`x64`) and Apple silicon (`arm64`).
- **Linux:** `.deb` (installer) or `.AppImage` (portable), for x64 and arm64.

Both open the same library on a computer, so you can switch between them. EPS/PDF conversion is bundled and works offline. No account is required. Windows applications are unsigned; macOS packages are not notarised.

## Updating

Your existing library stays in the same location and opens as before. Projects that use the new features (guides, outlines, real-world scale and so on) need Livery 1.4.0 or later to show them correctly.

## Verification and source

Release assets are published only after their native build and packaged checks pass, including the new installer and portable-app tests.

Livery is licensed under **GNU AGPL version 3 or later**. Corresponding source archives, build instructions and checksums accompany the downloads.
