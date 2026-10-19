---
name: publish
description: Build the app locally and publish it as a GitHub release. Use when the user asks to publish, release or ship a version.
---

# Publish

Releases are built on this machine and are Windows-only for now. macOS needs a Mac or CI.

1. **Preconditions.** Stop and tell the user if any of these fails:
   - `git status --porcelain` is empty. If not, offer to run the `commit` skill first.
   - The branch is `main`.
   - `git describe --exact-match --tags HEAD` returns a `vX.Y.Z` tag, and it matches the version in `package.json`.
   - `gh release view vX.Y.Z` fails. If it succeeds, that version is already released, so a new commit with a bump is needed.
2. **Push** with `git push --follow-tags`, so the tag exists on GitHub.
3. **Build** with `npm run tauri build`. If it fails, report the error and stop.
4. **Notes.** Find the previous release with `gh release list --limit 1 --json tagName --jq ".[0].tagName"`. List the changes with `git log <previous>..HEAD --pretty="- %s"`, or the full log if there is no previous release. Group them under Added / Changed / Fixed when that helps.
5. **Release:**
   ```
   gh release create vX.Y.Z --title "DM Companion vX.Y.Z" --notes "<notes>" \
     src-tauri/target/release/bundle/msi/*.msi \
     src-tauri/target/release/bundle/nsis/*.exe
   ```
6. Report the release URL.
