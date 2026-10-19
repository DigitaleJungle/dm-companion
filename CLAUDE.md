# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# DM Companion

A desktop app for a Dungeon Master running in-person D&D sessions. It covers searching rules, monsters, spells and lore, running encounters, storing player characters, and reading the DM's LegendKeeper world. It drives a second, player-facing window on a TV or second monitor.

## Product spec
- The source of truth is `docs/wireframes/SPEC.md`. The screens are `docs/wireframes/*.html`, and screenshots are in `docs/wireframes/images/`.
- Read the spec and the matching wireframe before building or changing a screen.
- The wireframes define layout, content and behaviour. They are not the visual design: never copy their hex colors or fonts. Use `tokens.css`.
- If code and spec disagree, or the spec is silent, ask. Don't invent features. If a decision changes behaviour, update `SPEC.md` in the same change.
- Still open (see the spec): how to access LegendKeeper (API, export or web view). Ask before building anything that depends on it.
- Rules data is 5etools-format data the user imports from local `.tar.gz` files (`src-tauri/src/rules/`). The app never bundles or downloads book content, and the public repo never names a source for it.

## Stack
- Tauri 2 (Rust backend) + SvelteKit (Svelte 5, static adapter, SPA) + TypeScript, built with Vite
- Targets: Windows and macOS
- UI language: English only
- Package manager: npm

## Commands
- Dev: `npm run tauri dev`
- Build: `npm run tauri build`
- Type check: `npm run check`
- Frontend tests: `npm test` (Vitest). One file: `npx vitest run src/path/to/file.test.ts`. By test name: add `-t "name"`.
- Backend tests: `cargo test` (run in `src-tauri/`). One test or module: `cargo test dice::` or `cargo test <test_name>`.
- Rust lint: `cargo clippy -- -D warnings` (run in `src-tauri/`)
- All checks (what the pre-commit hook runs): `npm run verify`
- Version: `node scripts/version.mjs bump <patch|minor|major>` (also adds the CHANGELOG section) / `check`

## Structure
- `docs/wireframes/` — spec and wireframes (read-only reference)
- `src/` — Svelte frontend
  - `lib/views/` — one folder per screen: `start`, `home`, `search`, `encounter`, `builder`, `characters`, `legendkeeper`, `player-display`
  - `lib/components/` — reusable UI components (app shell, sidebar, tabs, stat block, dice roller…)
  - `lib/api/` — typed wrappers around Tauri `invoke`; the only place the frontend talks to Rust
  - `lib/stores/` — shared state (current campaign, open tabs, active encounter)
  - `lib/styles/tokens.css` — design tokens (colors, spacing, type, radius)
  - `lib/strings.ts` — all user-facing text
- `src-tauri/src/` — Rust backend
  - `commands/` — Tauri commands, one file per feature: `search`, `encounters`, `characters`, `legendkeeper`, `dice`, `player_display`, `campaigns`
- Never edit generated or build output: `src-tauri/target/`, `src-tauri/gen/`, `build/`, `.svelte-kit/`

## Domain rules (never break these)
- **The player display is a separate Tauri window** on the second monitor. It only shows what the DM window sends it. It never reads storage or LegendKeeper itself.
- **Nothing secret reaches the player display.** That means:
  - LegendKeeper GM-secret blocks are stripped before anything is sent.
  - Monsters show a status word (Unhurt / Bloodied / Down) and their conditions, never exact HP or AC.
  - Monster names show only if the encounter allows it.
  - Every payload sent to the player display goes through one Rust function that filters it. Test that function.
- **LegendKeeper is read-only.** Never write to it. Credentials or tokens go in the OS keychain, never in plain files or logs.
- **The ruleset is not hard-coded.** Rules data, monster stats and encounter difficulty thresholds come from data files and the campaign's ruleset setting.
- **Dice:** all rolls go through one Rust dice parser (e.g. `2d20kh1+4`), with tests for its notation.
- **Data is local and per campaign:** characters, encounters, notes, pins and settings. Never lose data on a crash. Write atomically, and only after a valid parse.
- **Search must feel instant while typing.** Index in Rust, and never search on the UI thread.

## Code principles
- Make the smallest change that fully solves the task. Don't refactor unrelated code.
- Ask before adding any new dependency (npm or crate).
- Heavy work (file I/O, parsing, indexing, CPU-bound tasks) belongs in Rust commands, not JS.
- Tauri commands are async; never block the UI.
- Least privilege: only enable the Tauri plugins and capabilities a feature actually needs. Scope capabilities per window: the player display window gets the bare minimum.
- Svelte 5 runes only (`$state`, `$derived`, `$props`, `$effect`). No Svelte 4 syntax.
- Return errors from Rust as typed results; show them to the user, never swallow them.

## UX rules
- Use tokens from `tokens.css`. No hard-coded colors, spacing or font sizes.
- Every view handles empty, loading and error states. Examples: no campaign yet, LegendKeeper offline, no search results.
- Fully keyboard accessible, visible focus, WCAG AA contrast.
- Support light and dark mode. Colours switch on `<html data-theme="light|dark">` (see `tokens.css`); Settings → Theme picks Light, Dark or System, and System follows `prefers-color-scheme` (`src/lib/stores/theme.svelte.ts`). Don't use `prefers-color-scheme` media queries in components. The player display is always dark and uses large text readable from across a table.
- Use platform-correct modifier keys (Cmd on macOS, Ctrl on Windows) for any shortcut. There are no global shortcuts for search or screens (no Cmd/Ctrl K, no F-keys). The only shortcut in the spec:
  - next turn: Space, only when focus is not in a text field
- Format dates and numbers with `Intl` using the system locale. Never hard-code a format.
- Keep startup fast: lazy-load views that aren't needed on the first screen. The Start screen (campaign picker, `/`) is the first screen; a campaign's Landing/Home lives at `/campaign/<id>`.
- All UI text comes from `strings.ts`.

## Workflow
- Build one screen at a time, in this order: app shell + Home, Search, Run encounter, Encounter builder, Characters, LegendKeeper, player display.
- For changes touching more than two files, outline the plan before writing code.
- After every change, run the type check and the relevant tests, and fix failures before calling it done.
- Keep commits small, one feature or fix each.

## Commits and releases
- Commit only through the `commit` skill (`.claude/skills/commit/`). It bumps the version, commits, tags `vX.Y.Z` and pushes.
- Every commit bumps the version. **patch** = a fix or a change to existing functionality, **minor** = new functionality, **major** = an entire set of features. Ask if unclear.
- Every commit adds its entries to `CHANGELOG.md` and keeps `README.md` current: the version line, the status and features, and any usage text.
- The pre-commit hook (`.githooks/pre-commit`, turned on by `npm install`) rejects a commit that has no version bump, has no CHANGELOG entry for the new version, or fails `npm run verify`. Never use `--no-verify`.
- Publish only through the `publish` skill (`.claude/skills/publish/`). It builds locally and creates a GitHub release with the Windows installers. macOS isn't built yet.
- Repo: github.com/DigitaleJungle/dm-companion (public). `dnd_5e_charactersheet_formfillable.pdf` is git-ignored on purpose.
