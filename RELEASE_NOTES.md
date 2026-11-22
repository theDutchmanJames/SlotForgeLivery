**SlotForge Livery 1.5.0 — The new look**

**A calmer look, rebuilt screens and stock cars to paint straight away**

## What's new

- **New look:** Graphite colours, new type and calmer buttons throughout Livery, with Light/Dark in the top right.
- **Paint Studio and Garage:** a Workbench layout, and one Garage page for cars, liveries, the library, the Trash and backups.
- **Showroom:** nine stock cars to paint when you don't have a drawing of your own.
- **Entries:** one livery on many cars, each with its own number and name.
- **Colours and printing:** livery colours with real paints and a shopping list, and a Print pack saved as one PDF.
- **Safer and faster:** exports and backups survive a crash, and the inspector and Print pack are much quicker.

## Everything in this release

**Look**
- A full restyle: Graphite colours, Barlow and Roboto Mono, flat buttons, quieter selections, and redesigned dialogs, Settings, Help and the welcome screen.
- The Light/Dark switch is back in the top right corner.

**Screens rebuilt**
- **Paint Studio:** Workbench layout with Layers on the left, view tabs, Selection and Workshop tabs, a quick bar and a right-click menu.
- **Garage:** one page for cars, liveries, the library, the Trash and backups.
- **Car setup:** a guided, step-by-step preparation of a new car.
- **Colours:** livery colours with real paints, the paints you own and a shopping list.
- **Print pack:** pick and order the pages, then save them as one PDF.
- **Side by side:** edit two sides together, mirrored or the same.
- **Help on the spot:** help for the screen you are on (F1), tours and a keyboard sheet.
- **Start page:** a proper welcome when you open Livery.
- **Arrivals:** imported packages arrive in the Garage, where you can check them or send them back.
- **Rescue window:** if the library cannot be read, Livery finds your backups and brings one back.

**New**
- **Entries:** one livery, many cars, each with its own number and name.
- **Showroom:** nine stock cars ready to paint.
- **Update window:** replaces the daily update check, shows what's new and downloads the update for you.

**Speed**
- The inspector is about five times faster; the Print pack draws about eight times faster.
- Side by side, Panel Studio and exports are quicker.

**Fixes**
- Exports and backups no longer damage an earlier file if Livery stops while writing; an interrupted restore leaves nothing behind.
- Typing a name and then clicking other artwork no longer renames the wrong piece.
- Liveries saved by older versions get their Garage summary rebuilt, so the Garage can group them.
- Two library items with the same id can no longer be merged silently.
- Opening a file that is not a Livery package gives a plain message.
- Many smaller fixes from a full review.

## Downloads

Every system has both an **installer** and a **portable app**:

- **Windows:** `…-windows-x64-setup.exe` (installer) or `…-windows-x64-portable.exe`.
- **macOS**, when supplied: `.dmg` (installer) or `.zip` (portable), for Intel (`x64`) and Apple silicon (`arm64`).
- **Linux:** `.deb` (installer) or `.AppImage` (portable), for x64 and arm64.

Both open the same library on a computer, so you can switch between them. EPS/PDF conversion is bundled and works offline. No account is required. Windows applications are unsigned; macOS packages are not notarised.

## Updating

Your existing library stays in the same location and opens as before. Designs that use the new features, such as Entries, may not show fully in older versions.

## Verification and source

Release assets are published only after their native build and packaged checks pass. This release also adds random-save, crash, random-click and coverage tests.

Livery is licensed under **GNU AGPL version 3 or later**. Corresponding source archives, build instructions and checksums accompany the downloads.
