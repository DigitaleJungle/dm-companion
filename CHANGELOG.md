# Changelog

All notable changes to DM Companion. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions: **patch** = a fix or a change to existing functionality, **minor** = new functionality, **major** = an entire set of features.

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
