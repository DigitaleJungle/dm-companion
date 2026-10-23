# DM Companion

A desktop app for a Dungeon Master running in-person D&D sessions. It covers searching rules, monsters, spells and lore, running encounters, storing player characters, and reading the DM's LegendKeeper world. It drives a second, player-facing window on a TV or second monitor.

**Current version:** 0.5.17

## Status

Early development. What works so far:

- **Start screen:** create campaigns and pick one to open. Each campaign is saved locally in its own folder.
- **Campaign Home:** the app shell with an always-visible search bar, a campaign switcher dropdown, and Home cards you can rearrange, remove and add back. The cards themselves show empty states for now.
- **Settings:** Theme (System, Light or Dark, and animations on or off), Campaigns (add, rename, archive, restore, and permanently delete archived campaigns) and Rules data.
- **Rules data:** import 5etools-format data (and optionally images) from `.tar.gz` files you provide, check for newer versions, and remove the books you don't use. DM Companion doesn't include or download any rules content.
- **Campaign settings:** rename, archive, restore, delete and choose sourcebooks per campaign (with a search filter); the campaign library shows only those books.
- **Characters:** an overview of every character as cards (avatar, name, class and subclass, level, campaign), with search, filters (campaign, class, level), sorting, copy to another campaign and delete; a character sheet that tracks hit points, temporary hit points, death saves, hit dice, spell slots, conditions, Heroic Inspiration, concentration, rests, inventory, coins and notes, saved as you go, and shows abilities, saves, skills, proficiencies, weapon attacks and the Unarmed Strike (proficiency and weapon mastery marked), features with their rules text, uses to tick off and which rest gives them back (fill in a feature's usage once in its preview card), and spells you can cast from the sheet (using a slot, tracking concentration); **Level up** one level at a time with every decision of that level (hit points, subclass, ability score improvement or feat with its own choices, invocations and other options, new spells, weapon mastery, expertise); and a seven-step Create character wizard (species, class and level, background with picture cards, starting equipment, ability scores by array, manual entry or 4d6 rolls, and skills). Characters can also exist without a campaign.
- **Library:** read the imported books chapter by chapter, with a table of contents, images and preview cards for references, and browse spells, creatures, items and more in the Catalog: sortable tables with per-category filters and a book filter.

Next up: multiclassing, then search over the imported data. Encounters, the character sheet, notes, LegendKeeper and the player display are marked "Coming soon" until they're built.

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
npm run app          # run the app in dev (own data folder, title says "(dev)")
npm run verify       # type check, tests, clippy, cargo test
```

Commits must pass `npm run verify` and may not lower the version. To release a change, bump the version (`node scripts/version.mjs bump <patch|minor|major>`) and add an entry to [CHANGELOG.md](CHANGELOG.md); small commits can keep the current version. The pre-commit hook enforces this.

## Releases

Windows installers are attached to [GitHub Releases](https://github.com/DigitaleJungle/dm-companion/releases). macOS builds aren't available yet. See [CHANGELOG.md](CHANGELOG.md) for what changed in each version.
