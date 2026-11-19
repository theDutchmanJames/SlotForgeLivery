# Release notes

The notes of the next release are `RELEASE_NOTES.md` in the project folder; the release workflow
(`native-release.yml`) publishes that text as the GitHub release description.

## What's new: shown in the app

When Livery starts and finds a newer version, its update window shows the **What's new** section of
that release's notes. Livery reads only the lines under the heading `## What's new` (exactly that, any
heading level), up to the next heading, and shows them as plain text (bold, links and code marks are removed).

Keep it for users, short and concise:

- **At most six lines.** Longer lines are cut at about 280 characters.
- **One change per line**, best as `- **Name:** what it means for you.`
- **No "under the hood" changes** (tests, builds, code): put those under another heading, such as
  `## Details` or `## Verification`, which the app does not show. The longer, grouped list of changes
  can follow under its own heading too.

```markdown
## What's new

- **Calmer look:** new type, buttons and side lists throughout Livery.
- **Update window:** Livery tells you about a new version and downloads it for you.

## Everything in this release

…
```

The update window also needs the download for each copy attached to the release with its usual name
(`SlotForgeLivery-X.Y.Z-windows-x64-setup.exe`, `-windows-x64-portable.exe`, `-mac-arm64.dmg`,
`-mac-x64.dmg`, `-linux-x86_64.AppImage`, `-linux-amd64.deb`, …; see `../update-check.md`). A copy whose
file is not attached yet (macOS and Linux follow a little later) is told about the new version once it is there.
