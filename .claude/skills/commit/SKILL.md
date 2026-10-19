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
3. **Bump.** Run `node scripts/version.mjs bump <level>`. It prints the new version `X.Y.Z` and updates `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock`. Skip this step only for the very first commit of the repo, which ships as the version already in the files.
4. **Commit.** Run `git add -A`, then commit with a message like:
   ```
   <feat|fix|change|chore>: <one-line summary> (vX.Y.Z)

   <optional short body>

   Co-Authored-By: <attribution line from the system reminder>
   ```
   The hook runs the type check, Vitest, clippy and cargo test, which takes a few minutes the first time.
5. **If the hook fails,** read the output, fix the cause, run `git add -A` and commit again. The version is already bumped, so don't bump again. Never use `--no-verify`. If you can't fix it, tell the user what fails.
6. **Tag and push.** Run `git tag vX.Y.Z`, then `git push --follow-tags`.
7. Report the version, the level you chose and why, in one line.
