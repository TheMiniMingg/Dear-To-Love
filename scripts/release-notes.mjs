// Prints the release notes for a version: its CHANGELOG section plus how to
// install. Fails when the CHANGELOG has no section for it.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changelogSection } from './lib/versions.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const version = (process.argv[2] ?? '').replace(/^v/, '');
const signed = process.argv.includes('--signed');
const section = changelogSection(readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), version);
if (!section) {
  console.error(`CHANGELOG.md has no "## ${version}" section.`);
  process.exit(1);
}

const unsigned = signed
  ? ''
  : `
These builds are not signed yet. Windows SmartScreen may say it "protected your PC": choose
**More info → Run anyway**. On macOS, open the app once with right-click → **Open** (or System
Settings → Privacy & Security → **Open Anyway**).
`;

console.log(`${section}

## Install

| System | File |
|---|---|
| Windows 10/11 (64-bit) | \`Dear.to.Love_${version}_x64-setup.exe\` (or the \`.msi\`) |
| macOS (Apple silicon and Intel) | \`Dear.to.Love_${version}_universal.dmg\` |
| Linux (64-bit) | \`.deb\` (Debian, Ubuntu), \`.rpm\` (Fedora, openSUSE) or \`.AppImage\` |
${unsigned}
Your stories stay on your computer and are kept when you install a newer version. Check a
download with \`SHA256SUMS.txt\`. The app never updates itself; turn on update checks in
Settings to be told about new releases.
`);
