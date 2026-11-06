// The app version lives in four files that must agree; tauri.conf.json is
// the source of truth. Release tags are `v` plus that version (T48).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** SemVer 2.0 without build metadata, e.g. 1.2.3 or 1.2.3-beta.1. */
export const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?$/;

const FILES = {
  pkg: 'package.json',
  tauri: 'src-tauri/tauri.conf.json',
  cargo: 'src-tauri/Cargo.toml',
  lock: 'src-tauri/Cargo.lock',
};

const JSON_VERSION = /^(\s*"version"\s*:\s*")([^"]+)(")/m;
const CARGO_VERSION = /^(version\s*=\s*")([^"]+)(")/m;
const LOCK_VERSION = /(\[\[package\]\]\nname = "dear-to-love"\nversion = ")([^"]+)(")/;

export function readVersions(root) {
  const read = (f) => readFileSync(path.join(root, FILES[f]), 'utf8');
  return {
    pkg: JSON.parse(read('pkg')).version,
    tauri: JSON.parse(read('tauri')).version,
    cargo: read('cargo').match(CARGO_VERSION)?.[2],
    lock: read('lock').match(LOCK_VERSION)?.[2],
  };
}

/**
 * Everything wrong with the versions, empty when they agree. `tag` is the
 * release tag being built, if any: it must be exactly `v` + the version.
 */
export function versionProblems(v, tag = null) {
  const problems = [];
  if (!SEMVER.test(v.tauri ?? '')) problems.push(`tauri.conf.json ${v.tauri} is not a SemVer`);
  if (v.pkg !== v.tauri) problems.push(`package.json ${v.pkg} != tauri.conf.json ${v.tauri}`);
  if (v.cargo !== v.tauri) problems.push(`Cargo.toml ${v.cargo} != tauri.conf.json ${v.tauri}`);
  if (v.lock !== v.tauri) problems.push(`Cargo.lock ${v.lock} != tauri.conf.json ${v.tauri}`);
  if (tag !== null && tag !== `v${v.tauri}`) {
    problems.push(`tag ${tag} != packaged version v${v.tauri}`);
  }
  return problems;
}

/** Sets the version in all four files. */
export function setVersion(root, version) {
  if (!SEMVER.test(version)) throw new Error(`${version} is not a SemVer`);
  const edit = (f, fn) => {
    const p = path.join(root, FILES[f]);
    writeFileSync(p, fn(readFileSync(p, 'utf8')));
  };
  const replace = (re, what) => (text) => {
    if (!re.test(text)) throw new Error(`no version found in ${what}`);
    return text.replace(re, `$1${version}$3`);
  };
  // Only the version string changes, so the files keep their formatting.
  edit('pkg', replace(JSON_VERSION, FILES.pkg));
  edit('tauri', replace(JSON_VERSION, FILES.tauri));
  edit('cargo', replace(CARGO_VERSION, FILES.cargo));
  edit('lock', replace(LOCK_VERSION, FILES.lock));
}

/** The CHANGELOG section for `version` (`## 1.2.3` or `## [1.2.3] - date`), or null. */
export function changelogSection(text, version) {
  const lines = text.split('\n');
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heading = new RegExp(`^## \\[?v?${escaped}\\]?(\\s|$)`);
  const start = lines.findIndex((l) => heading.test(l));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  const body = lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join('\n')
    .trim();
  return body || null;
}
