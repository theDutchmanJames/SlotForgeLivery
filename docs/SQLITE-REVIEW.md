# SQLite implementation review — 3 November 2026

Scope: normalized library objects, safe legacy migration, incremental saves, lazy library bodies, separate thumbnails and preservation of existing editor/package behaviour. This change has not been released. Existing header/footer branding changes were retained.

## Findings addressed

- Whole-library cloning, IPC transfer and JSON rewriting were replaced with loaded-object snapshots and changed-record transactions. Project/view/area/layer/group identities are separate; points and gradient stops remain attached to their objects.
- Identical media previously embedded in multiple objects now share checked blob records. Deletion accounts for both current references and the preceding saved revision. A missing-media preflight prevents a cached content identity from being mistaken for media that has already been reclaimed.
- First-load migration is staged, reconstructed and compared before exclusive publication. Invalid JSON, malformed identities, corrupt/newer SQLite and publication failures cannot silently initialize an empty collection or overwrite the originals.
- Saves arriving from a stale revision are rejected. Injected failures roll back all parts of a batch. A worker terminated after writes but before commit leaves the preceding state recoverable on reopen.
- Failed restore publication now closes/reopens connections correctly instead of leaving a closed database object behind.
- Export destinations are checked against live database/original/recovery files, including primary-file hard-link aliases.
- Long string storage uses an exact JSON string representation so lone UTF-16 surrogates cannot be replaced or deduplicated incorrectly during UTF-8 encoding.
- Group properties share a record when consistent; divergent legacy member properties remain independent and round-trip unchanged.
- Library browsing uses bounded pages and thumbnails without retaining all source objects. Delayed load responses check their original UI context before opening an editor or project.
- Package exports expand metadata placeholders and snapshot loaded containers before asynchronous work. Existing `.sfpaint` packages retain complete editable elements, fonts and image contents.
- Startup distinguishes legitimate migration time from a renderer that fails to initialize, and disables editing until loading completes.
- Developer requirements now specify Node 24, matching the native build jobs and the SQLite test runtime. Electron already bundles its own compatible Node runtime.

## Verification

The final clean run passed all 46 model/legacy-storage/SQLite tests and all 34 desktop integration suites. Four additional release-publication/Apple-recovery tests also passed. Existing tests now inspect hydrated saved content where the implementation deliberately uses metadata placeholders. The 1,200-item test was also run against the packaged Windows executable, including an edit made while another save was awaiting acknowledgement. JavaScript syntax and Git whitespace checks passed.

The Windows ASAR package passed legacy migration, the background worker, save/reopen, theme preferences and bundled EPS conversion. A disposable copy of the existing personal JSON library (542,418 bytes) reconstructed exactly after migration. The source file and copied JSON remained byte-for-byte unchanged. No personal library was migrated in place during QA.

The synthetic desktop fixture opened with all 1,200 assets and all 80 inactive projects represented only by metadata. A colour edit sent zero media blobs and less than 3 KiB of transaction data. A grouped-name edit retained both independently editable members after restart.

Backend diagnostic samples on this Windows computer:

| Library items | Original JSON | SQLite | Metadata reopen | Single-layer SQLite write | Legacy JSON rewrite |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 0.53 MiB | 0.17 MiB | 3.6 ms | 3.2 ms | 8.1 ms |
| 1,000 | 5.31 MiB | 1.07 MiB | 10.9 ms | 3.5 ms | 43.5 ms |
| 5,000 | 26.55 MiB | 5.01 MiB | 46.4 ms | 4.1 ms | 164.6 ms |

These are single-run synthetic backend measurements with repeated image content, not statistical performance guarantees or complete UI timings. Deduplication savings depend on actual repeated content. Reproduce with `npm run benchmark:library`; isolated outputs are under `test-output/`.

## Remaining release gates and deliberate limits

- Native macOS and Linux execution must pass the release matrix. Its packaged smoke test now covers SQLite migration and restart on every target.
- The source/package version and public release remain unchanged. The isolated Windows review build is under `dist/sqlite-review/`.
- The active project's views are still loaded together. Metadata search and identity enumeration still scale with catalogue size; this is not a fully SQL-paginated UI.
- Whole package import/export remains materialized and limited to 180 MiB. Large collections need selected exports; streaming full backups is not part of this change.
- Thumbnail rendering and complex active artwork can still have costs unrelated to database saving. First migration and complete validation are intentionally full-data operations.
- The preserved JSON is a stale migration snapshot after the first SQLite save. Downgrading requires exporting compatible packages first; merely launching an older executable will not show new SQLite work.

See [storage design and recovery](SQLITE-STORAGE.md) for the operational details.
