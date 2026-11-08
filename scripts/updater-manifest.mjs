// Writes `latest.json` for the in-app updater from the signed files in a
// folder, or nothing when the release was built without an update key.
// Usage: node scripts/updater-manifest.mjs <dir> <version> <tag> <owner/repo> [notes.md]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { updaterManifest } from './lib/updater-manifest.mjs';

const [dir, version, tag, repo, notesFile] = process.argv.slice(2);
if (!dir || !version || !tag || !repo) {
  console.error('usage: updater-manifest.mjs <dir> <version> <tag> <owner/repo> [notes.md]');
  process.exit(2);
}
const signed = readdirSync(dir)
  .filter((n) => n.endsWith('.sig') && existsSync(path.join(dir, n.slice(0, -4))))
  .map((n) => ({ name: n.slice(0, -4), signature: readFileSync(path.join(dir, n), 'utf8') }));
if (signed.length === 0) {
  console.log('No signed updater files: no latest.json (the app links to the release page).');
  process.exit(0);
}
const notes = notesFile ? readFileSync(notesFile, 'utf8') : '';
const manifest = updaterManifest(signed, { version, tag, repo, notes });
writeFileSync(path.join(dir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`latest.json: ${Object.keys(manifest.platforms).join(', ')}`);
