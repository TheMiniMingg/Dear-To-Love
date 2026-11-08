// The in-app updater's latest.json. Run with `pnpm test:scripts`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { updaterManifest } from './lib/updater-manifest.mjs';

const release = {
  version: '0.2.0',
  tag: 'v0.2.0',
  repo: 'TheMiniMingg/Dear-To-Love',
  notes: 'Fixes.',
  date: '2026-11-08T00:00:00.000Z',
};

test('every system gets its own signed file, and a bare name falls back to one', () => {
  const m = updaterManifest(
    [
      { name: 'Dear.to.Love_0.2.0_x64_en-US.msi', signature: 'msi-sig\n' },
      { name: 'Dear.to.Love_0.2.0_x64-setup.exe', signature: 'exe-sig' },
      { name: 'Dear.to.Love.app.tar.gz', signature: 'mac-sig' },
      { name: 'Dear.to.Love_0.2.0_amd64.AppImage', signature: 'appimage-sig' },
      { name: 'Dear.to.Love_0.2.0_amd64.deb', signature: 'deb-sig' },
      { name: 'Dear.to.Love-0.2.0-1.x86_64.rpm', signature: 'rpm-sig' },
      { name: 'SHA256SUMS.txt', signature: 'ignored' },
    ],
    release,
  );
  assert.equal(m.version, '0.2.0');
  assert.equal(m.notes, 'Fixes.');
  assert.equal(m.pub_date, '2026-11-08T00:00:00.000Z');
  const sig = Object.fromEntries(Object.entries(m.platforms).map(([k, v]) => [k, v.signature]));
  assert.deepEqual(sig, {
    'darwin-aarch64': 'mac-sig',
    'darwin-aarch64-app': 'mac-sig',
    'darwin-x86_64': 'mac-sig',
    'darwin-x86_64-app': 'mac-sig',
    'linux-x86_64': 'appimage-sig',
    'linux-x86_64-appimage': 'appimage-sig',
    'linux-x86_64-deb': 'deb-sig',
    'linux-x86_64-rpm': 'rpm-sig',
    'windows-x86_64': 'exe-sig',
    'windows-x86_64-msi': 'msi-sig',
    'windows-x86_64-nsis': 'exe-sig',
  });
  assert.equal(
    m.platforms['windows-x86_64-nsis'].url,
    'https://github.com/TheMiniMingg/Dear-To-Love/releases/download/v0.2.0/Dear.to.Love_0.2.0_x64-setup.exe',
  );
});

test('a release without signed files has no platforms', () => {
  assert.deepEqual(updaterManifest([], release).platforms, {});
});
