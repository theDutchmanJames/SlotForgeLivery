# Livery library storage

This is an unreleased storage change. SQLite is included in Electron; users do not install a database server. The personal-data directory remains `SlotForge Paintshop` to preserve existing installations.

## Objects and media

`paintshop-library.sqlite` contains independently keyed library items, project templates, car views, source views, paintable areas and artwork layers. Consistent group names, visibility and transforms have shared group records within their owning design. Layer order is explicit in the stored arrays. Bézier points, gradient stops and stripe settings remain bounded values belonging to their shape or paint.

Projects retain independent editable copies. Sharing immutable media does not link their paint, geometry or layer edits. Images, fonts and large vector strings are stored once by a SHA-256 content identity. The string representation is preserved exactly, including noncanonical data URLs and Unicode. References protect media still used by projects, library objects or the preceding saved revision.

The renderer retains metadata for the library and loads complete items when they are used or edited. The active project, including its views, remains in memory for canvas editing. Library, project and package browsers display 32 cards per page. PNG thumbnails are cached independently in SQLite, regenerated after relevant edits, and produced with at most two concurrent jobs per displayed list. A first thumbnail may require reading its complete source item. Thumbnail generation does not retain that item in the library model.

## Saving

The renderer snapshots the containers of loaded objects before asynchronous work. It compares their independently encoded records with the last acknowledged version, and sends changed records, deletions and new media. It does not clone or send unloaded projects and artwork on ordinary saves. Clean inactive items return to metadata after a save outside an open dialog. The content-hash cache is bounded.

SQLite runs in a dedicated worker, with serialized commands and a revision precondition. A transaction commits the changed objects, item metadata, media references, thumbnail invalidation and the preceding revision together. Failure leaves the committed state unchanged. Changes made while a save is running remain available for the following save. Unchanged saves do not advance the revision or erase recovery history.

This is not a promise of constant-time work for every action: catalogue metadata is still held and searched in memory, and saves still enumerate its identities to detect removals/reordering. Loaded designs are traversed to find changed objects. One very complex active car can still need rendering work independent of storage.

## Migration and recovery

On first opening, if SQLite does not exist:

1. Validate the existing `paintshop-library.json`. If it is unavailable or invalid, try its validated `.backup` fallback.
2. Write a separate temporary database.
3. Reconstruct the complete library and compare every value with the source.
4. Publish the new file exclusively; never replace an independently created destination.

The JSON and its backup are left byte-for-byte unchanged. Publication requires a filesystem that supports hard links. An unsupported filesystem or failed verification stops migration and presents recovery instead of silently opening an empty collection. Abandoned staging files are never selected as the live library.

**The preserved JSON is a migration-time copy, not a current backup.** After migration, new work is saved only to SQLite. Opening an older Livery executable would show the stale JSON. To move back to an older version, export compatible `.sfpaint` packages from the newer app first.

When SQLite already exists, a corrupt, empty or unsupported database never triggers fallback to stale JSON. Saving is paused when startup cannot safely load the library. Restore a known-good exported package through Import & Export. Replacement is staged and compared before publication; an existing SQLite file is preserved as a uniquely named `.recovery-…` copy. The original JSON remains intact.

Atomic SQLite rollback handles an interrupted writer. The preceding successful save is also retained internally as changed-row recovery records; this is not an additional full database copy or a user-facing Undo history. Checksums identify damaged object and media bodies when read. Startup performs SQLite's structural quick check and verifies catalogue metadata; it does not decode every inactive project. Damage in an unopened item is reported when that item is read or a complete backup is requested.

Exports cannot target live database files, migration originals or named recovery files in the data directory. Hard-link aliases of the primary files are protected too.

## Sharing and limits

Existing `.sfpaint` packages remain version 1. Exports reconstruct complete editable items with their media and fonts; internal references and metadata placeholders never leave as package contents. Imports still create independent copies.

The former 180 MiB **whole-library save** limit no longer applies to SQLite. Individual imported file and object limits still apply. **The existing 180 MiB package import/export limit remains.** Complete package backups and imports still materialize their data; use selected packages for collections beyond that limit. Streaming large backups is a separate future improvement. SQLite file space freed by deletion may be reused internally rather than immediately shrinking the file on disk.

## Verification and release gate

- `npm test`: model, legacy recovery and SQLite tests, including exact migration, duplicate identities, Unicode, group reconstruction, corruption, restore, competing publication, stale revisions, injected write failure and a terminated writer.
- `npm run test:integration`: editor interactions, exports, fonts, package compatibility, recovery and a 1,200-item/80-inactive-project desktop scenario.
- `npm run benchmark:library`: disposable 100/1,000/5,000-item libraries; measures metadata opening, migration and small edits. It is a backend diagnostic, not a whole-UI timing guarantee.
- `node scripts/package-smoke.cjs`: migrates legacy data inside the packaged app, saves/reopens through its ASAR worker, checks themes and bundled EPS conversion. Set `LIVERY_PACKAGE_DIR` to test a separate local build.

The native release workflow runs the SQLite unit tests and packaged migration test on every Windows, macOS and Linux target before publishing. Windows testing does not establish macOS/Linux acceptance; those native jobs remain required before release.
