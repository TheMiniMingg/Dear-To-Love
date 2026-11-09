// Sets the app version everywhere it is recorded, including the README's
// download links: `pnpm set-version 1.2.3`.
import { fileURLToPath } from 'node:url';
import { readVersions, setVersion } from './lib/versions.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const version = (process.argv[2] ?? '').replace(/^v/, '');
try {
  const before = readVersions(root).tauri;
  setVersion(root, version);
  console.log(`Version ${before} -> ${version}. Next: a CHANGELOG section "## ${version}".`);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  console.error('Usage: pnpm set-version <major.minor.patch>');
  process.exit(1);
}
