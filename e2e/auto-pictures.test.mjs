// Pictures as the story goes, in the real app: after a reply, a card offers
// a picture of what it brought in; Make it asks the picture connection, the
// picture is kept for every story and put in place on the route. Made
// pictures are tagged so Images can show them together.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { startFakeOpenAI } from './fake-openai.mjs';
import { launch, makeDataDir, png, typeInto, waitForReply, waitForText } from './harness.mjs';

let session;
let fake;
after(async () => {
  await session?.stop();
  await fake?.close();
});

const shots = process.env.DTL_SHOTS;

test('a reply is paired with a picture, asked for first', async () => {
  fake = await startFakeOpenAI([], { picture: png(300, 200, [60, 90, 150]) });
  session = await launch(makeDataDir());
  const b = session.browser;
  const click = async (sel) => (await b.$(sel)).click();
  const invoke = (cmd, args) =>
    b.execute((c, a) => window.__TAURI_INTERNALS__.invoke(c, a), cmd, args);
  const shot = async (name) => {
    if (shots) await b.saveScreenshot(`${shots}/${name}.png`);
  };

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
  // Ask first (the default), a picture any reply.
  await b.execute(() =>
    localStorage.setItem(
      'dtl.autoPictures',
      JSON.stringify({ mode: 'ask', people: true, places: true, gap: 1 }),
    ),
  );
  await b.refresh();
  await waitForText(b, 'main', 'No stories yet');

  await click('button=Preset Story');
  await waitForText(b, 'main', 'Start story');
  await click('button=Start story');
  await waitForText(b, '[data-testid="narrative"]', 'The Lamp Room');

  // The opening is not looked at; a new reply is.
  assert.equal(await (await b.$('.auto-picture')).isExisting(), false);
  await typeInto(b, '#composer-input', 'Look around the lamp room');
  await b.keys(['Enter']);
  await waitForReply(b);
  await waitForText(b, '.auto-picture', 'Pictures for this moment');
  const offer = await (await b.$('.auto-picture')).getText();
  assert.match(offer, /Make a (portrait|picture) of/);
  assert.equal(
    fake.requests.filter((r) => r.url === '/v1/images/generations').length,
    0,
    'nothing is made before the player says so',
  );
  await (await b.$('.auto-picture')).scrollIntoView({ block: 'center' });
  await shot('auto-picture-offer');

  await (await (await b.$('.auto-picture')).$('button=Make it')).click();
  await waitForText(b, '.auto-picture', 'New picture', 20000);
  const sent = fake.requests.filter((r) => r.url === '/v1/images/generations');
  assert.equal(sent.length, 1);
  assert.match(JSON.parse(sent[0].body).prompt, /safe for work/);

  // It is kept for every story, tagged, and put in place on the route.
  const images = await invoke('list_images');
  assert.equal(images.length, 1);
  assert.equal(images[0].shared, true);
  assert.ok(images[0].tags.includes('Made automatically'));
  await b.waitUntil(
    async () =>
      b.execute(
        (id) =>
          [...document.querySelectorAll('[data-testid="scene-pictures"] img')].some((img) =>
            img.src.endsWith(id),
          ),
        images[0].id,
      ),
    { timeout: 10000, timeoutMsg: 'the made picture is not on stage' },
  );
  await (await b.$('.auto-picture')).scrollIntoView({ block: 'center' });
  await shot('auto-picture-made');

  // Settings shows the choices.
  await click('button=Menu');
  await waitForText(b, '[role="dialog"]', 'Paused');
  await click('button=Pictures');
  await waitForText(b, '[role="dialog"]', 'Pictures as the story goes in this story');
});
