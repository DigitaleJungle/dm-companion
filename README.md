# DM Companion

A desktop app for a Dungeon Master running in-person D&D sessions. It covers searching rules, monsters, spells and lore, running encounters, storing player characters, and reading the DM's LegendKeeper world. It drives a second, player-facing window on a TV or second monitor.

**Current version:** 0.3.1

## Status

Early development. What works so far:

- **Start screen:** create campaigns and pick one to open. Each campaign is saved locally in its own folder.
- **Campaign Home:** the app shell with an always-visible search bar, and Home cards you can rearrange, remove and add back. The cards themselves show empty states for now.
- **Settings:** Theme (System, Light or Dark, and animations on or off), Campaigns (add, rename, archive, restore, and permanently delete archived campaigns) and Rules data.
- **Rules data:** import 5etools-format data (and optionally images) from `.tar.gz` files you provide, check for newer versions, and remove the books you don't use. DM Companion doesn't include or download any rules content.
- **Library:** read the imported books chapter by chapter, with a table of contents, images and preview cards for references, and browse spells, creatures, items and more in the Catalog.

Next up: search over the imported data. Encounters, characters, notes, LegendKeeper and the player display are marked "Coming soon" until they're built.

Screens, in build order:

1. App shell + Home: layout done, no data yet
2. Search
3. Run encounter
4. Encounter builder
5. Characters
6. LegendKeeper reader
7. Player display (second window)

The product spec and wireframes are in [docs/wireframes/](docs/wireframes/SPEC.md).

## Development

Requires Node.js, npm and Rust ([Tauri prerequisites](https://tauri.app/start/prerequisites/)).

```sh
npm install          # also turns on the pre-commit hook
npm run tauri dev    # run the app
npm run verify       # type check, tests, clippy, cargo test
```

Every commit must bump the version (`node scripts/version.mjs bump <patch|minor|major>`), add an entry to [CHANGELOG.md](CHANGELOG.md) and pass `npm run verify`. The pre-commit hook enforces this.

## Releases

Windows installers are attached to [GitHub Releases](https://github.com/DigitaleJungle/dm-companion/releases). macOS builds aren't available yet. See [CHANGELOG.md](CHANGELOG.md) for what changed in each version.
