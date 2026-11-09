// The app version lives in four files that must agree; tauri.conf.json is
// the source of truth. Release tags are `v` plus that version (T48).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
const README = 'README.md';

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
  // The README's download links name this version's installers.
  const readme = path.join(root, README);
  if (existsSync(readme)) {
    writeFileSync(readme, setReadmeVersion(readFileSync(readme, 'utf8'), version));
  }
}

// A link to a release or one of its files: .../releases/download/v1.2.3/<file>
// or .../releases/tag/v1.2.3.
const RELEASE_LINK =
  /(https:\/\/github\.com\/TheMiniMingg\/Dear-To-Love\/releases\/(?:download|tag)\/)v([^/\s"'<>)]+)(\/[^\s"'<>)]+)?/g;

/** The README's links to a release or its files, with the version each names. */
export function readmeLinks(text) {
  return [...text.matchAll(RELEASE_LINK)].map((m) => ({
    url: m[0],
    tag: m[2],
    file: m[3]?.slice(1) ?? null,
  }));
}

/** Points every release link at `version`: the tag and the version in each file name. */
export function setReadmeVersion(text, version) {
  return text.replace(RELEASE_LINK, (_, base, old, file = '') => {
    return `${base}v${version}${file.split(old).join(version)}`;
  });
}

/** README links that name another version than `version`, empty when all agree. */
export function readmeProblems(text, version) {
  return readmeLinks(text)
    .filter((l) => l.tag !== version || (l.file !== null && !l.file.includes(version)))
    .map((l) => `${README} links to ${l.url}, not version ${version}`);
}

/** Problems with the README's release links in the repository at `root`. */
export function readmeVersionProblems(root, version) {
  const readme = path.join(root, README);
  return existsSync(readme) ? readmeProblems(readFileSync(readme, 'utf8'), version) : [];
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
