// Verifies package.json, tauri.conf.json, Cargo.toml and Cargo.lock agree on
// the app version and, when a release tag is built, that the tag is exactly
// `v` + that version (T48). `--tag vX.Y.Z` checks a tag locally. The README's
// download links must name the same version.
import { fileURLToPath } from 'node:url';
import { readVersions, readmeVersionProblems, versionProblems } from './lib/versions.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const i = process.argv.indexOf('--tag');
const tag =
  i > 0
    ? (process.argv[i + 1] ?? '')
    : process.env.GITHUB_REF_TYPE === 'tag'
      ? (process.env.GITHUB_REF_NAME ?? '')
      : null;

const versions = readVersions(root);
const problems = [
  ...versionProblems(versions, tag),
  ...readmeVersionProblems(root, versions.tauri),
];
if (problems.length > 0) {
  console.error('Version mismatch:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`Version OK: v${versions.tauri}${tag ? ` (tag ${tag})` : ''}`);
