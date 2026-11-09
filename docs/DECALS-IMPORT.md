# Decals interoperability

`renderer/decals/model.js` and `art.js` adapt SlotForge Decals' model and rendering code, inspected in November 2026. They retain the upstream AGPL-3.0-or-later licence and use separate global namespaces. Curve-path formatting and curved-text geometry are included without adding Decals' editor dependencies.

Supported native formats:

- `slotforge-decals-sheet`, versions 1 and 2: one project.
- `slotforge-decals-sheets`, version 1: multiple projects.
- `slotforge-decals`, version 1: decal pack.

Each top-level decal is rendered to a self-contained SVG, including its nested group/slice, transforms and required embedded fonts. These are individual Livery `vector` layers, not conversions to Livery text/path primitives. This preserves visual appearance while allowing positioning, proportional sizing, fitting and reuse. Imports do not preserve physical printing scale: Livery uses concept-artboard coordinates, with one common scale for all decals in a selected batch.

PDF/EPS conversion has an explicit `purpose: 'decal'` path. The existing car-template conversion remains strict about raster content and shading. Unsupported SVG features fail with an explanation rather than being silently rasterised. SVG sanitisation excludes active content and external resources, checks symbol cycles and scopes IDs, CSS selectors and embedded font families.

Manual sheet selection stores the sanitized SVG and a validated `crop` rectangle separately. Crops share the same original string so the SQLite codec deduplicates sheet media. Rendering changes only the local viewBox and clips to the crop. A crop is rectangular and may include neighbouring artwork; native sheet import is preferred for semantic decal separation.

Selection scaling works on independent layer copies and updates the complete selection atomically. It retains IDs and editable elements, scales stripe widths/gaps, and preserves normalized geometry and group perspective poses. The corner handle anchors at the selection's top-left; numeric controls scale around its centre.

Run `npm run check`, `npm test`, and `node tests/decal-import.cjs`. The desktop test uses an isolated profile and covers native formats, embedded fonts, vector crop pixels, hostile SVGs, EPS/mixed PDF, selection scaling/undo, SQLite reopening and `.sfpaint` sharing. The full desktop regression command is `npm run test:integration`.
