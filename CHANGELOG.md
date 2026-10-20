# Changelog

All notable changes to DM Companion. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions: **patch** = a fix or a change to existing functionality, **minor** = new functionality, **major** = an entire set of features.

## [0.3.0] - 2026-10-20
### Added
- Library, opened from the Library button at the top right of the start screen. The Reading tab has your books, a collapsible table of contents and the chapter text, with tables, insets, embedded stat blocks and imported images. Clicking a section jumps straight to it.
- Catalog tab: browse spells, creatures, items, feats, classes, rules and more by category, with a filter and a full entry view (spell details, creature stat blocks with spellcasting, item rarity, feat prerequisites, class features).
- References in the text open a preview card next to them. References inside the card can be followed and returned from.
- Traps and hazards are now imported.
### Fixed
- Cross-reference and filter tags no longer show stray text (such as "x" or "class=Warlock") in the reader or the search index. Import your data again to update the search index.

## [0.2.2] - 2026-10-20
### Added
- The app remembers its window size (and whether it was maximized) from the last session. It opens at that size straight away, with no visible resize or blank window on startup.

## [0.2.1] - 2026-10-20
### Fixed
- Importing an images archive as rules data, or rules data as images, is now refused within a second with a message saying which import to use. It used to read the whole archive first, or accept the wrong file. Your existing data is never touched.

## [0.2.0] - 2026-10-19
### Added
- Settings → Rules data: import 5etools-format rules data from a .tar.gz file on your computer. It's processed into a local library (books, chapters, spells, creatures, items, classes and more, plus a search index), and a failed import keeps your previous data.
- Optional images, imported from a second .tar.gz and removable.
- A version check against a GitHub repository you choose. It tells you when a newer release is available; you import the new file to update.
- Books and sources table with a filter and checkboxes, to remove what you don't use in one step. Removed sources stay out of future imports until you allow them again.
### Changed
- The Settings dialog is wider, keeps the same size on every tab, and only its content scrolls.
- Settings uses sentence-case headings, with fewer descriptions; the rest are in (i) tooltips.

## [0.1.4] - 2026-10-19
### Added
- A start screen when the app opens: no sidebar, a prominent search bar, your campaigns (most recently opened first) and a field to create a new one, plus the Settings gear and the app version.
- Campaigns are saved locally, each in its own folder. Opening one shows its Home with the sidebar, and the campaign button in the sidebar returns to the start screen.
- Settings → Theme: an Appearance dropdown with System, Light and Dark. System follows the operating system live, and the choice is saved and applied on startup without a flash.
- Settings → Campaigns: add, rename and archive campaigns. Archived campaigns keep their data and can be restored, and only archived campaigns can be deleted permanently, after a confirmation.
- Up and Down arrow keys move between the Settings sections.
### Changed
- Home shows the campaign's name as its title.
- The search bar's placeholder text is smaller and quieter.

## [0.1.3] - 2026-10-19
### Added
- The Home cards can be rearranged. Each card has a ⋯ menu with Move left, Move right and Remove, and a drag handle that shows on hover. Removed cards come back through the "+ Add card" tile, and a removal can be undone.
- The card order is saved and kept between restarts.
### Changed
- The search bar is now at the top of every screen and stays visible while scrolling. Search is no longer a sidebar item.
- Removed the keyboard shortcuts for search (Ctrl K) and for switching screens (F1–F5).

## [0.1.2] - 2026-10-19
### Added
- A Settings panel, opened from the gear button at the bottom left of the sidebar. It has no settings yet.

## [0.1.1] - 2026-10-19
### Changed
- On narrow windows, the sidebar now hides behind a menu button and slides in as a drawer. Escape, clicking outside, or moving to another screen closes it.

## [0.1.0] - 2026-10-19
### Added
- App shell: sidebar with the campaign switcher, navigation with shortcut hints, and the player-screen box. It stacks above the content on narrow windows.
- Home screen layout: the header, a large search bar, and cards for prepared encounters, party, LegendKeeper, session notes, continue where you left off, and quick tools.
- A modern, clean design with light and dark mode that follow the system setting.
- F1 goes to Home.
### Changed
- Features that aren't built yet are shown disabled, with "Coming soon".
- The window opens at 1280×800.

## [0.0.1] - 2026-10-19
### Added
- README and this changelog.
### Changed
- Every commit must now add a changelog entry. The version bump also updates the README version and starts the changelog section.
- Release notes are taken from the changelog.
### Fixed
- Version tags are now pushed with each commit.

## [0.0.0] - 2026-10-19
### Added
- Tauri 2 + SvelteKit app scaffold with Vitest.
- Versioned commit workflow: a pre-commit hook that requires a version bump and passing checks, and the commit and publish skills.
