// Portraits in the real app: a picture connection (to a local fake images
// API) makes a character's portrait from their description, kept for this
// story only, and the reader shows it.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { startFakeOpenAI } from './fake-openai.mjs';
import { launch, makeDataDir, png, waitForText } from './harness.mjs';

let session;
let fake;
after(async () => {
  await session?.stop();
  await fake?.close();
});

test('make a portrait from a description and show it', async () => {
  fake = await startFakeOpenAI([], { picture: png(256, 256, [150, 60, 90]) });
  session = await launch(makeDataDir());
  const b = session.browser;
  const click = async (sel) => (await b.$(sel)).click();
  const invoke = (cmd, args) =>
    b.execute((c, a) => window.__TAURI_INTERNALS__.invoke(c, a), cmd, args);

  await waitForText(b, 'main', 'No stories yet');
  const conn = await invoke('save_connection', {
    input: {
      label: 'Fake pictures',
      adapter: 'openai_images',
      baseUrl: fake.baseUrl,
      modelId: 'gpt-image-1',
      billing: 'local',
      settings: {
        temperature: 0.9,
        maxOutputTokens: 700,
        timeoutMs: 60000,
        maxContextTokens: 16000,
      },
    },
  });
  await invoke('set_picture_maker', { profileId: conn.id });
  // Picture connections never write stories.
  await assert.rejects(invoke('set_storyteller', { profileId: conn.id }));

  await click('button=New story');
  await waitForText(b, 'main', 'Quick Start');
  await click('button=Start story');
  await waitForText(b, '[data-testid="narrative"]', 'The Lamp Room');

  await click('button=Menu');
  await waitForText(b, '[role="dialog"]', 'Paused');
  await click('button=Pictures');
  await waitForText(b, '[role="dialog"]', 'Portrait of');
  // The first portrait row is the player's.
  const rows = await b.$$('[aria-label^="Choose Portrait of"]');
  await rows[0].click();
  await waitForText(b, '[role="dialog"]', 'Uses Fake pictures (gpt-image-1)');
  await click('button=Make portrait');
  await waitForText(b, '[role="dialog"]', 'It is selected below', 20000);
  await waitForText(b, '[aria-label="This story\'s pictures"]', 'Portrait of');
  await click('button=Use this picture');
  await waitForText(b, '[role="dialog"]', 'Chosen on Main.');

  const sent = fake.requests.filter((r) => r.url === '/v1/images/generations');
  assert.equal(sent.length, 1);
  const body = JSON.parse(sent[0].body);
  assert.equal(body.model, 'gpt-image-1');
  assert.match(body.prompt, /Head-and-shoulders portrait/);
  assert.match(body.prompt, /safe for work/);

  // The portrait loads through the app's image protocol.
  await b.waitUntil(
    async () =>
      b.execute(() =>
        [...document.querySelectorAll('[data-testid="scene-pictures"] img')].some(
          (img) => img.complete && img.naturalWidth === 256,
        ),
      ),
    { timeout: 10000, timeoutMsg: 'the portrait did not load' },
  );

  const images = await invoke('list_images');
  assert.equal(images.length, 1);
  assert.equal(images[0].shared, false, 'kept for this story only');
  assert.deepEqual(images[0].tags, ['Portrait']);
  const ledger = await invoke('list_api_requests', {
    scope: 'all_time',
    profileId: null,
    limit: 10,
  });
  assert.equal(ledger.length, 1, 'the picture request is recorded');
  assert.equal(ledger[0].purpose, 'character_suggestion');
});
