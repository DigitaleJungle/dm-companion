---
name: commit
description: Commit the current changes with a version bump, tests and a tag. Use whenever the user asks to commit, save their work to git, or check in changes.
---

# Commit

Every commit made through this skill carries its own version. The pre-commit hook (`.githooks/pre-commit`) refuses a commit whose version is lower than the last one, or that fails `npm run verify`. It allows an unchanged version, but this skill always bumps.

1. **Look at the change.** Run `git status` and `git diff` (including untracked files). If nothing changed, say so and stop.
2. **Pick the level.**
   - **patch**: a fix, or a change to how existing functionality behaves.
   - **minor**: new functionality.
   - **major**: an entire set of features, for example finishing a whole screen from the build order in `CLAUDE.md`.

   If the level is unclear, ask the user. Don't guess.
3. **Bump, with the changelog entries.** Run `node scripts/version.mjs bump <level> --added "…" --changed "…" --fixed "…"`, giving each short, user-facing entry its own flag (repeat a flag for more entries; leave out kinds that don't apply; at least one entry, or the hook rejects the commit). It prints the new version `X.Y.Z`, updates the version in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` and `README.md`, and writes the `## [X.Y.Z] - date` section of `CHANGELOG.md` with the entries under `### Added` / `### Changed` / `### Fixed`. There's no need to read or edit `CHANGELOG.md` afterwards. A bad option fails before anything is written.
4. **README.** Only if the change adds or alters functionality: update the README's Status section (what works, what's next) and any usage or setup text it affects. The version line is already done. Otherwise skip this step.
5. **Commit, tag and push in one command.** Run `git add -A`, then commit with a message like:
   ```
   <feat|fix|change|chore>: <one-line summary> (vX.Y.Z)

   <optional short body>

   Co-Authored-By: <attribution line from the system reminder>
   ```
   Tag and push only if the commit succeeded, testing the commit's exit code (`$LASTEXITCODE -eq 0` in PowerShell, `&&` in bash), never PowerShell's `$?` after a pipe, which can be false even when the commit worked. Then run `git tag -a vX.Y.Z -m vX.Y.Z` and `git push --follow-tags`. The tag must be annotated, because `--follow-tags` skips lightweight tags. End the command with `git status -sb` and `git tag --points-at HEAD`, to confirm the push and the tag in the same call.

   The hook runs the type check, Vitest, clippy and cargo test, which takes a few minutes the first time.
6. **If the hook fails,** read the output, fix the cause, run `git add -A` and commit again (then tag and push). The version is already bumped, so don't bump again. If a changelog entry needs fixing, edit `CHANGELOG.md` directly. Never use `--no-verify`. If you can't fix it, tell the user what fails.
7. Report the version, the level you chose and why, in one line.
