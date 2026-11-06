// Verifies package.json, tauri.conf.json and Cargo.toml agree on the app version,
// and (when GITHUB_REF_NAME is a vX.Y.Z tag) that the tag matches too.
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')).version;
const tauri = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version;
const cargoMatch = readFileSync('src-tauri/Cargo.toml', 'utf8').match(/^version\s*=\s*"([^"]+)"/m);
const cargo = cargoMatch ? cargoMatch[1] : undefined;

const problems = [];
if (pkg !== tauri) problems.push(`package.json ${pkg} != tauri.conf.json ${tauri}`);
if (cargo !== tauri) problems.push(`Cargo.toml ${cargo} != tauri.conf.json ${tauri}`);

const ref = process.env.GITHUB_REF_NAME ?? '';
if (/^v\d+\.\d+\.\d+/.test(ref) && ref.slice(1) !== tauri) {
  problems.push(`tag ${ref} != tauri.conf.json v${tauri}`);
}

if (problems.length > 0) {
  console.error('Version mismatch:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`Version OK: v${tauri}`);
