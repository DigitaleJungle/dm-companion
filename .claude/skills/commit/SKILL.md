---
name: commit
description: Commit the current changes with a version bump, tests and a tag. Use whenever the user asks to commit, save their work to git, or check in changes.
---

# Commit

Every commit carries its own version. The pre-commit hook (`.githooks/pre-commit`) refuses a commit unless the version went up and `npm run verify` passes.

1. **Look at the change.** Run `git status` and `git diff` (including untracked files). If nothing changed, say so and stop.
2. **Pick the level.**
   - **patch**: a fix, or a change to how existing functionality behaves.
   - **minor**: new functionality.
   - **major**: an entire set of features, for example finishing a whole screen from the build order in `CLAUDE.md`.

   If the level is unclear, ask the user. Don't guess.
3. **Bump.** Run `node scripts/version.mjs bump <level>`. It prints the new version `X.Y.Z` and updates the version in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` and `README.md`. It also adds an empty `## [X.Y.Z] - date` section to `CHANGELOG.md`.
4. **Changelog and README.**
   - Fill the new `CHANGELOG.md` section with short, user-facing entries under `### Added`, `### Changed` or `### Fixed`. The hook rejects an empty section.
   - If the change adds or alters functionality, update the README's Status section (what works, what's next) and any usage or setup text it affects. The version line is already done.
5. **Commit.** Run `git add -A`, then commit with a message like:
   ```
   <feat|fix|change|chore>: <one-line summary> (vX.Y.Z)

   <optional short body>

   Co-Authored-By: <attribution line from the system reminder>
   ```
   The hook runs the type check, Vitest, clippy and cargo test, which takes a few minutes the first time.
6. **If the hook fails,** read the output, fix the cause, run `git add -A` and commit again. The version is already bumped, so don't bump again. Never use `--no-verify`. If you can't fix it, tell the user what fails.
7. **Tag and push.** Run `git tag -a vX.Y.Z -m vX.Y.Z`, then `git push --follow-tags`. The tag must be annotated, because `--follow-tags` skips lightweight tags.
8. Report the version, the level you chose and why, in one line.
