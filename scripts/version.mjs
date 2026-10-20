// Keeps the app version identical in every file that carries it.
//   node scripts/version.mjs bump <patch|minor|major>   writes and prints the new version, adds an empty CHANGELOG section
//   node scripts/version.mjs check                     used by the pre-commit hook
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function bumpVersion(version, level) {
  const m = SEMVER.exec(version);
  if (!m) throw new Error(`Not a plain x.y.z version: "${version}"`);
  const [major, minor, patch] = m.slice(1).map(Number);
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  if (level === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Level must be patch, minor or major, got "${level}"`);
}

export function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

const CHANGELOG = "CHANGELOG.md";

export function addChangelogSection(text, version, date) {
  const heading = `## [${version}] - ${date}\n`;
  const at = text.search(/^## \[/m);
  return at === -1 ? `${text.trimEnd()}\n\n${heading}` : `${text.slice(0, at)}${heading}\n${text.slice(at)}`;
}

export function changelogHasEntries(text, version) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
  if (start === -1) return false;
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) return false;
    if (/^\s*- \S/.test(line)) return true;
  }
  return false;
}

// Each file: how to read its version and how to write a new one. Cargo.lock only exists after the first cargo run.
const FILES = [
  {
    path: "package.json",
    read: (s) => JSON.parse(s).version,
    write: (s, v) => s.replace(/("version"\s*:\s*")[^"]+(")/, `$1${v}$2`),
  },
  {
    path: "src-tauri/tauri.conf.json",
    read: (s) => JSON.parse(s).version,
    write: (s, v) => s.replace(/("version"\s*:\s*")[^"]+(")/, `$1${v}$2`),
  },
  {
    path: "src-tauri/Cargo.toml",
    read: (s) => /^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m.exec(s)?.[1],
    write: (s, v) => s.replace(/^(\[package\][\s\S]*?^version\s*=\s*")[^"]+(")/m, `$1${v}$2`),
  },
  {
    path: "README.md",
    read: (s) => /^\*\*Current version:\*\* (\d+\.\d+\.\d+)/m.exec(s)?.[1],
    write: (s, v) => s.replace(/^(\*\*Current version:\*\* )\d+\.\d+\.\d+/m, `$1${v}`),
  },
  {
    path: "src-tauri/Cargo.lock",
    optional: true,
    read: (s) => /^name = "dm-companion"\r?\nversion = "([^"]+)"/m.exec(s)?.[1],
    write: (s, v) => s.replace(/^(name = "dm-companion"\r?\nversion = ")[^"]+(")/m, `$1${v}$2`),
  },
];

function presentFiles() {
  return FILES.filter((f) => existsSync(f.path) || !f.optional);
}

function readAll() {
  return presentFiles().map((f) => ({ ...f, version: f.read(readFileSync(f.path, "utf8")) }));
}

function headVersion() {
  try {
    return JSON.parse(execFileSync("git", ["show", "HEAD:package.json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).version;
  } catch {
    return null; // no commits yet
  }
}

function fail(message) {
  console.error(`version: ${message}`);
  process.exit(1);
}

function check() {
  const files = readAll();
  const versions = new Set(files.map((f) => f.version));
  if (versions.size !== 1 || files.some((f) => !f.version)) {
    fail(`files disagree:\n${files.map((f) => `  ${f.path}: ${f.version}`).join("\n")}`);
  }
  const current = files[0].version;
  const previous = headVersion();
  // Keeping the version is fine (small commits); going backwards is not.
  if (previous && compareVersions(current, previous) < 0) {
    fail(`version ${current} is lower than the last commit's ${previous}. Run: node scripts/version.mjs bump <patch|minor|major>`);
  }
  if (!changelogHasEntries(readFileSync(CHANGELOG, "utf8"), current)) {
    fail(`add at least one entry under "## [${current}]" in ${CHANGELOG}`);
  }
  console.log(`version: ${current} ok`);
}

function bump(level) {
  const files = readAll();
  const next = bumpVersion(files[0].version, level);
  for (const f of files) writeFileSync(f.path, f.write(readFileSync(f.path, "utf8"), next));
  const today = new Date().toISOString().slice(0, 10); // ISO date is the changelog convention, not UI text
  writeFileSync(CHANGELOG, addChangelogSection(readFileSync(CHANGELOG, "utf8"), next, today));
  console.log(next);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, level] = process.argv.slice(2);
  try {
    if (command === "check") check();
    else if (command === "bump") bump(level);
    else fail("usage: node scripts/version.mjs bump <patch|minor|major> | check");
  } catch (e) {
    fail(e.message);
  }
}
