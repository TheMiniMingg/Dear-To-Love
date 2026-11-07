// M9 in the real app: export a story with a picture as a storypack and as
// readable text, import the pack back as a second story, and open it.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { launch, makeDataDir, tabTo, typeInto, waitForReply, waitForText } from './harness.mjs';

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

test('export a storypack and text, import it as a new story', async () => {
  const data = makeDataDir();
  const out = mkdtempSync(path.join(tmpdir(), 'dtl-e2e-out-'));
  const cover = path.join(out, 'Cover.png');
  writeFileSync(cover, png(320, 200, [180, 120, 60]));

  session = await launch(data);
  const b = session.browser;
  const click = async (sel) => (await b.$(sel)).click();
  const invoke = (cmd, args) =>
    b.execute((c, a) => window.__TAURI_INTERNALS__.invoke(c, a), cmd, args);

  await waitForText(b, 'main', 'No stories yet');
  await click('button=Preset Story');
  await waitForText(b, 'main', 'Start story');
  await click('button=Start story');
  await waitForText(b, '[data-testid="narrative"]', 'The Lamp Room');
  await tabTo(b, 'composer-input');
  await typeInto(b, '#composer-input', 'Read the letter');
  await b.keys(['Enter']);
  await waitForReply(b);

  // A cover picture, so the pack carries an image. The native dialogs can't
  // be driven by WebDriver; call the commands they hand their paths to.
  const [story] = await invoke('list_stories', {});
  const [added] = await invoke('import_images', { paths: [cover] });
  await invoke('set_story_picture', { storyId: story.id, slot: 'cover', assetId: added.asset.id });

  // The Export panel is reachable from the pause menu.
  await click('button=Menu');
  await waitForText(b, '[role="dialog"]', 'Paused');
  await click('button=Export…');
  await waitForText(b, '[role="dialog"]', 'Readable text');
  await waitForText(b, '[role="dialog"]', 'never includes API keys');
  await b.keys(['Escape']);
  await waitForText(b, '[role="dialog"]', 'Paused');

  const packPath = path.join(out, 'Letter');
  const exported = await invoke('export_storypack', { storyId: story.id, path: packPath });
  assert.equal(exported.fileName, 'Letter.storypack');
  assert.equal(exported.images, 1);
  assert.ok(existsSync(`${packPath}.storypack`));
  assert.deepEqual(
    readdirSync(out).filter((n) => n.endsWith('.part')),
    [],
    'no partial files left',
  );

  const textPath = path.join(out, 'Letter.md');
  const text = await invoke('export_route_text', {
    routeId: story.mainRouteId,
    path: textPath,
    format: 'markdown',
    timestamps: false,
  });
  assert.ok(text.turns >= 2, `turns: ${text.turns}`);
  assert.equal(text.chapters, 1);
  const md = readFileSync(textPath, 'utf8');
  assert.match(md, /^# The Unsigned Letter\n/);
  assert.match(md, /## Chapter 1: The Lamp Room/);
  assert.match(md, /\*\*[^*]+\*\*: Read the letter/);
  assert.match(md, /\*\*Storyteller\*\*: /);

  // Import it back: a second, independent copy that shares the image.
  const imported = await invoke('import_storypack', { path: `${packPath}.storypack` });
  assert.equal(imported.title, 'The Unsigned Letter');
  assert.equal(imported.imagesReused, 1);
  assert.notEqual(imported.storyId, story.id);
  const originals = readdirSync(
    path.join(data, 'io.github.theminimingg.deartolove', 'assets', 'originals'),
  );
  assert.equal(originals.length, 1);
  assert.ok(
    !existsSync(path.join(data, 'io.github.theminimingg.deartolove', 'imports')) ||
      readdirSync(path.join(data, 'io.github.theminimingg.deartolove', 'imports')).length === 0,
  );

  await click('button=Back to library');
  await waitForText(b, 'main', 'Your stories');
  await waitForText(b, 'main', 'Import storypack');
  await b.waitUntil(async () => (await b.$$('.story-card')).length === 2, {
    timeout: 10000,
    timeoutMsg: 'the imported story is not in the library',
  });
  // Both copies show the cover through the image protocol.
  await b.waitUntil(
    async () =>
      b.execute(
        () =>
          [...document.querySelectorAll('.story-cover')].filter(
            (img) => img.complete && img.naturalWidth > 0,
          ).length === 2,
      ),
    { timeout: 10000, timeoutMsg: 'the covers did not load' },
  );

  // Open the imported copy (the newest, so first): same story, its own route.
  const [newest] = await b.$$('.story-card .story-open');
  await newest.click();
  await waitForText(b, '[data-testid="narrative"]', 'Read the letter');
  await waitForText(b, '[data-testid="narrative"]', 'The Lamp Room');
  const view = await invoke('get_route_view', { routeId: imported.mainRouteId });
  assert.equal(view.story.id, imported.storyId);
  assert.equal(view.routes.length, 1);
});
