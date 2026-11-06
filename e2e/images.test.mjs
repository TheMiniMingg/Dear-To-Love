// M8 images in the real app: add a picture (twice: one copy), show it as
// this route's background through the dtlimg: protocol, and see that the
// library keeps it while a story shows it.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launch, makeDataDir, png, textOf, waitForText } from './harness.mjs';

let session;
after(async () => session?.stop());

test('add an image, use it on a route, and keep it while used', async () => {
  const data = makeDataDir();
  const files = mkdtempSync(path.join(tmpdir(), 'dtl-e2e-img-'));
  const harbor = path.join(files, 'Harbor at dusk.png');
  writeFileSync(harbor, png(640, 360, [40, 90, 160]));
  const copy = path.join(files, 'copy.png');
  writeFileSync(copy, png(640, 360, [40, 90, 160]));

  session = await launch(data);
  const b = session.browser;
  const click = async (sel) => (await b.$(sel)).click();

  await waitForText(b, 'main', 'No stories yet');
  await click('button=New story');
  await waitForText(b, 'main', 'Quick Start');
  await click('button=Start story');
  await waitForText(b, '[data-testid="narrative"]', 'The Lamp Room');

  // The native file picker can't be driven by WebDriver, so add the files
  // through the same command the picker hands its paths to.
  const results = await b.execute(
    (paths) => window.__TAURI_INTERNALS__.invoke('import_images', { paths }),
    [harbor, copy],
  );
  assert.equal(results.length, 2);
  assert.equal(results[0].asset.label, 'Harbor at dusk');
  assert.equal(results[1].alreadyInLibrary, true, 'the same picture is kept once');
  const stored = (dir) =>
    readdirSync(path.join(data, 'io.github.theminimingg.deartolove', 'assets', dir));
  assert.equal(stored('originals').length, 1);

  // A picture added for this story only stays out of other stories.
  const own = path.join(files, 'Lamp room.png');
  writeFileSync(own, png(320, 200, [200, 160, 40]));
  const [story] = await b.execute(() => window.__TAURI_INTERNALS__.invoke('list_stories'));
  const [mine] = await b.execute(
    (paths, storyId) =>
      window.__TAURI_INTERNALS__.invoke('import_images', { paths, scope: { storyId } }),
    [own],
    story.id,
  );
  assert.equal(mine.asset.shared, false);
  assert.deepEqual(
    mine.asset.stories.map((s) => s.title),
    ['The Unsigned Letter'],
  );

  // This story picks its own storyteller; Settings keeps the app's.
  await click('button=Offline storyteller');
  await waitForText(b, '[role="dialog"]', 'Same as the app');
  await click('//div[@role="dialog"]//label[.//strong[normalize-space()="Offline storyteller"]]');
  await b.waitUntil(
    async () =>
      b.execute(
        () =>
          document
            .querySelector('[role="dialog"] input[type="radio"]:checked')
            ?.parentElement?.textContent?.startsWith('Offline storyteller') ?? false,
      ),
    { timeout: 10000, timeoutMsg: 'the story did not keep its own storyteller' },
  );
  const teller = await b.execute(
    (routeId) => window.__TAURI_INTERNALS__.invoke('get_route_view', { routeId }),
    story.lastRouteId,
  );
  assert.deepEqual(teller.storyteller.storyChoice, { kind: 'offline' });
  await b.keys(['Escape']);

  await click('button=Menu');
  await waitForText(b, '[role="dialog"]', 'Paused');
  await click('button=Pictures');
  await waitForText(b, '[role="dialog"]', 'Portrait of');
  await click('[aria-label="Choose Background"]');
  await waitForText(b, '[role="dialog"]', 'Harbor at dusk');
  await waitForText(b, '[aria-label="This story\'s pictures"]', 'Lamp room');
  assert.match(await textOf(b, '[aria-label="Pictures for all stories"]'), /Harbor at dusk/);
  await click('//div[@role="dialog"]//button[.//span[normalize-space()="Harbor at dusk"]]');
  await click('button=Use this picture');
  await waitForText(b, '[role="dialog"]', 'Chosen on Main.');

  // The picture really loads through the app's image protocol.
  await b.waitUntil(
    async () =>
      b.execute(() => {
        const img = document.querySelector('[data-testid="scene-pictures"] img');
        return !!img && img.complete && img.naturalWidth === 640;
      }),
    { timeout: 10000, timeoutMsg: 'the background did not load' },
  );
  await b.keys(['Escape']);
  await waitForText(b, '[role="dialog"]', 'Paused');
  await waitForText(b, '[data-testid="narrative"]', 'Picture changed: Background');

  // The library keeps the image while the story shows it.
  await click('button=Back to library');
  await waitForText(b, 'main', 'Your stories');
  await click('button=Images');
  await waitForText(b, 'main', 'Harbor at dusk');
  await waitForText(b, '[aria-label="For all stories"]', 'Harbor at dusk');
  await waitForText(b, '[aria-label="Only in “The Unsigned Letter”"]', 'Lamp room');
  await click('//button[.//span[normalize-space()="Harbor at dusk"]]');
  await waitForText(b, '[aria-label="Used in"]', 'Background on route Main');
  assert.match(await textOf(b, '[aria-label="Used in"]'), /The Unsigned Letter/);
  assert.equal(await (await b.$('button=Delete image')).isEnabled(), false);
});
