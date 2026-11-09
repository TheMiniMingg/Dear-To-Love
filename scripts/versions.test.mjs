// T48: the release tag must match the packaged version, and the version
// files must agree. Run with `pnpm test:scripts`.
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  SEMVER,
  changelogSection,
  readVersions,
  readmeLinks,
  readmeProblems,
  readmeVersionProblems,
  setReadmeVersion,
  setVersion,
  versionProblems,
} from './lib/versions.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

function copyOfRepoVersions() {
  const dir = mkdtempSync(path.join(tmpdir(), 'dtl-versions-'));
  mkdirSync(path.join(dir, 'src-tauri'));
  for (const f of [
    'README.md',
    'package.json',
    'src-tauri/tauri.conf.json',
    'src-tauri/Cargo.toml',
    'src-tauri/Cargo.lock',
  ]) {
    cpSync(path.join(root, f), path.join(dir, f));
  }
  return dir;
}

test('the repository versions agree', () => {
  assert.deepEqual(versionProblems(readVersions(root)), []);
});

test('a tag must be exactly v + the packaged version (T48)', () => {
  const v = { pkg: '1.2.3', tauri: '1.2.3', cargo: '1.2.3', lock: '1.2.3' };
  assert.deepEqual(versionProblems(v, 'v1.2.3'), []);
  for (const tag of ['1.2.3', 'v1.2.4', 'v1.2.3-beta.1', 'v1.2', 'release-1.2.3', '']) {
    assert.deepEqual(versionProblems(v, tag), [`tag ${tag} != packaged version v1.2.3`], tag);
  }
  assert.deepEqual(
    versionProblems(
      { ...v, tauri: '1.2.3-rc.1', pkg: '1.2.3-rc.1', cargo: '1.2.3-rc.1', lock: '1.2.3-rc.1' },
      'v1.2.3-rc.1',
    ),
    [],
  );
});

test('every file must carry the same SemVer', () => {
  const v = { pkg: '1.2.3', tauri: '1.2.3', cargo: '1.2.4', lock: '1.2.3' };
  assert.deepEqual(versionProblems(v), ['Cargo.toml 1.2.4 != tauri.conf.json 1.2.3']);
  assert.deepEqual(versionProblems({ ...v, cargo: '1.2.3', lock: undefined }), [
    'Cargo.lock undefined != tauri.conf.json 1.2.3',
  ]);
  for (const bad of ['1.2', '01.2.3', '1.2.3.4', 'v1.2.3', '1.2.3+build']) {
    assert.equal(SEMVER.test(bad), false, bad);
  }
  for (const good of ['0.1.0', '10.20.30', '1.0.0-alpha.1', '1.0.0-rc.10']) {
    assert.equal(SEMVER.test(good), true, good);
  }
});

test('set-version changes only the version strings', () => {
  const dir = copyOfRepoVersions();
  const before = readFileSync(path.join(dir, 'src-tauri/tauri.conf.json'), 'utf8');
  const was = readVersions(dir).tauri;
  setVersion(dir, '9.8.7');
  assert.deepEqual(readVersions(dir), {
    pkg: '9.8.7',
    tauri: '9.8.7',
    cargo: '9.8.7',
    lock: '9.8.7',
  });
  assert.equal(
    readFileSync(path.join(dir, 'src-tauri/tauri.conf.json'), 'utf8'),
    before.replace(`"version": "${was}"`, '"version": "9.8.7"'),
  );
  // Dependencies' versions in the lock file are untouched.
  const lock = readFileSync(path.join(dir, 'src-tauri/Cargo.lock'), 'utf8');
  assert.equal(lock.split('version = "9.8.7"').length - 1, 1);
  assert.throws(() => setVersion(dir, 'v1.0'), /not a SemVer/);
  // The README's download links follow.
  assert.deepEqual(readmeVersionProblems(dir, '9.8.7'), []);
  assert.ok(readFileSync(path.join(dir, 'README.md'), 'utf8').includes('/v9.8.7/'));
});

test('the README links to the installers of this version', () => {
  const version = readVersions(root).tauri;
  const links = readmeLinks(readFileSync(path.join(root, 'README.md'), 'utf8'));
  const files = links.map((l) => l.file).filter(Boolean);
  // Windows, Mac and each Linux package.
  for (const end of [
    '_x64-setup.exe',
    '_universal.dmg',
    '_amd64.AppImage',
    '_amd64.deb',
    '.x86_64.rpm',
  ]) {
    assert.ok(
      files.some((f) => f.endsWith(end)),
      `no download link ending ${end}`,
    );
  }
  assert.deepEqual(readmeVersionProblems(root, version), []);
});

test('README release links move to a new version and stale ones are caught', () => {
  const base = 'https://github.com/TheMiniMingg/Dear-To-Love/releases';
  const text = [
    `<a href="${base}/download/v0.1.0/Dear.to.Love_0.1.0_x64-setup.exe">`,
    `[rpm](${base}/download/v0.1.0/Dear.to.Love-0.1.0-1.x86_64.rpm)`,
    `[What's new](${base}/tag/v0.1.0) and [all releases](${base}).`,
  ].join('\n');
  assert.deepEqual(readmeProblems(text, '0.1.0'), []);
  assert.equal(readmeProblems(text, '0.2.0').length, 3);
  const moved = setReadmeVersion(text, '0.2.0');
  assert.deepEqual(readmeProblems(moved, '0.2.0'), []);
  assert.ok(moved.includes(`${base}/download/v0.2.0/Dear.to.Love_0.2.0_x64-setup.exe"`));
  assert.ok(moved.includes(`${base}/download/v0.2.0/Dear.to.Love-0.2.0-1.x86_64.rpm)`));
  assert.ok(moved.includes(`(${base}/tag/v0.2.0)`));
  assert.ok(moved.includes(`[all releases](${base}).`));
  // A file named for another version than its tag is caught too.
  assert.equal(
    readmeProblems(`${base}/download/v0.2.0/Dear.to.Love_0.1.0_amd64.deb`, '0.2.0').length,
    1,
  );
});

test('release notes come from the matching CHANGELOG section', () => {
  const text = [
    '# Changelog',
    '',
    '## Unreleased',
    '',
    '- Next thing.',
    '',
    '## [1.1.0] - 2026-12-01',
    '',
    '- Search.',
    '',
    '## 1.0.0',
    '',
    '- First release.',
    '',
  ].join('\n');
  assert.equal(changelogSection(text, '1.1.0'), '- Search.');
  assert.equal(changelogSection(text, '1.0.0'), '- First release.');
  assert.equal(changelogSection(text, '1.0'), null);
  assert.equal(changelogSection(text, '1.1.0-rc.1'), null);
  assert.equal(changelogSection('## 2.0.0\n\n## 1.0.0\n- x', '2.0.0'), null);
});
