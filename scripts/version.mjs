// Keeps the app version identical in every file that carries it.
//   node scripts/version.mjs bump <patch|minor|major> [--added "…"] [--changed "…"] [--fixed "…"]
//       writes and prints the new version and adds its CHANGELOG section, with the given entries (each flag repeatable)
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

// Changelog groups in the order they appear, and the bump flag for each.
const KINDS = { "--added": "Added", "--changed": "Changed", "--fixed": "Fixed" };

/** `["--added", "Search", "--fixed", "Crash"]` → `{ Added: ["Search"], Changed: [], Fixed: ["Crash"] }`. */
export function parseEntries(args) {
  const entries = Object.fromEntries(Object.values(KINDS).map((k) => [k, []]));
  for (let i = 0; i < args.length; i += 2) {
    const kind = KINDS[args[i]];
    const entry = args[i + 1]?.trim();
    if (!kind) throw new Error(`unknown option "${args[i]}"; use --added, --changed or --fixed`);
    if (!entry) throw new Error(`${args[i]} needs the entry text`);
    entries[kind].push(entry);
  }
  return entries;
}

/** The new version's section, filled with `entries` when given, inserted above the newest one. */
export function addChangelogSection(text, version, date, entries = {}) {
  const groups = Object.entries(entries)
    .filter(([, items]) => items.length)
    .map(([kind, items]) => `### ${kind}\n\n${items.map((item) => `- ${item}`).join("\n")}\n`);
  const section = `## [${version}] - ${date}\n${groups.length ? `\n${groups.join("\n")}` : ""}`;
  const at = text.search(/^## \[/m);
  return at === -1 ? `${text.trimEnd()}\n\n${section}` : `${text.slice(0, at)}${section}\n${text.slice(at)}`;
}

/** YYYY-MM-DD in local time (the changelog convention, not UI text); UTC would date late-evening commits a day off. */
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

function bump(level, entries) {
  const files = readAll();
  const next = bumpVersion(files[0].version, level);
  for (const f of files) writeFileSync(f.path, f.write(readFileSync(f.path, "utf8"), next));
  writeFileSync(CHANGELOG, addChangelogSection(readFileSync(CHANGELOG, "utf8"), next, localDate(), entries));
  console.log(next);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, level, ...rest] = process.argv.slice(2);
  try {
    if (command === "check") check();
    // Entries are parsed before anything is written, so a bad option leaves every file as it was.
    else if (command === "bump") bump(level, parseEntries(rest));
    else fail('usage: node scripts/version.mjs bump <patch|minor|major> [--added "…"] [--changed "…"] [--fixed "…"] | check');
  } catch (e) {
    fail(e.message);
  }
}
