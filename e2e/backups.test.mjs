// M9 in the real app: back up everything, lose the story, restore the
// backup across a restart, and find the "before restore" copy kept.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { launch, makeDataDir, textOf, waitForText } from './harness.mjs';

function png(width, height, [r, g, b]) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let session;
after(async () => session?.stop());

test('back up everything, restore after a restart, keep the old data', async () => {
  const data = makeDataDir();
  const out = mkdtempSync(path.join(tmpdir(), 'dtl-e2e-backup-'));
  const cover = path.join(out, 'Cover.png');
  writeFileSync(cover, png(200, 120, [60, 140, 90]));
  const app = path.join(data, 'io.github.theminimingg.deartolove');

  session = await launch(data);
  let b = session.browser;
  const click = async (sel) => (await b.$(sel)).click();
  const invoke = (cmd, args) =>
    b.execute((c, a) => window.__TAURI_INTERNALS__.invoke(c, a), cmd, args);

  await waitForText(b, 'main', 'No stories yet');
  await click('button=Preset Story');
  await waitForText(b, 'main', 'Start story');
  await click('button=Start story');
  await waitForText(b, '[data-testid="narrative"]', 'The Lamp Room');
  const [story] = await invoke('list_stories', {});
  const [added] = await invoke('import_images', { paths: [cover] });
  await invoke('set_story_picture', { storyId: story.id, slot: 'cover', assetId: added.asset.id });

  // Settings -> Backups is reachable; the native save dialog isn't
  // drivable, so call the command it hands its path to.
  await click('button=Menu');
  await waitForText(b, '[role="dialog"]', 'Paused');
  await click('button=Settings');
  await waitForText(b, 'main', 'AI connections');
  await click('button=Backups');
  await waitForText(b, 'main', 'Back up everything');
  await waitForText(b, 'main', 'No backups yet.');
  const file = path.join(out, 'everything');
  const saved = await invoke('export_backup', { path: file });
  assert.equal(saved.fileName, 'everything.dtlbackup');
  assert.equal(saved.stories, 1);
  assert.equal(saved.images, 1);
  assert.ok(existsSync(`${file}.dtlbackup`));

  // Lose the story, then restore the file.
  await invoke('delete_story', { storyId: story.id });
  const plan = await invoke('prepare_restore', {
    source: { from: 'file', path: `${file}.dtlbackup` },
  });
  assert.equal(plan.stories, 1);
  assert.equal(plan.missingImages, 0);
  await invoke('confirm_restore', { token: plan.token });
  assert.ok(existsSync(path.join(app, 'restore.json')), 'waiting for the restart');

  // Restart (the app would restart itself; WebDriver needs a new session).
  await session.stop();
  session = await launch(data);
  b = session.browser;
  await waitForText(b, 'main', 'The Unsigned Letter');
  assert.match(await textOf(b, '[role="status"]'), /^Restored the backup from /);
  assert.ok(!existsSync(path.join(app, 'restore.json')));
  assert.ok(!existsSync(path.join(app, 'restore')));
  assert.equal(readdirSync(path.join(app, 'assets', 'originals')).length, 1);
  await b.waitUntil(
    async () =>
      b.execute(() => {
        const img = document.querySelector('.story-cover');
        return !!img && img.complete && img.naturalWidth > 0;
      }),
    { timeout: 10000, timeoutMsg: 'the restored cover did not load' },
  );

  // The data from before the restore is kept and can be chosen.
  await (await b.$('button=Settings')).click();
  await waitForText(b, 'main', 'AI connections');
  await (await b.$('button=Backups')).click();
  await waitForText(b, 'main', 'Before a restore');
  await (await b.$('[aria-label^="Restore Before a restore backup from"]')).click();
  await waitForText(b, '[role="dialog"]', 'Restore this backup?');
  await waitForText(b, '[role="dialog"]', '0 stories');
  await (await b.$('button=Keep my current data')).click();
  await b.waitUntil(async () => !(await (await b.$('[role="dialog"]')).isExisting()), {
    timeout: 5000,
    timeoutMsg: 'the dialog did not close',
  });
  // The dialog closes at once; the staged files go a moment later.
  await b.waitUntil(async () => !existsSync(path.join(app, 'restore')), {
    timeout: 5000,
    timeoutMsg: 'the cancelled restore is cleared',
  });
});
