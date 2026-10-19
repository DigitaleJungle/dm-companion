# DM Companion

A desktop app for a Dungeon Master running in-person D&D sessions. It covers searching rules, monsters, spells and lore, running encounters, storing player characters, and reading the DM's LegendKeeper world. It drives a second, player-facing window on a TV or second monitor.

**Current version:** 0.1.0

## Status

Early development. The app shell and the Home screen layout are in place, with light and dark mode. Home shows empty states for now. Campaigns, notes and every other feature are marked "Coming soon" until they're built.

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
