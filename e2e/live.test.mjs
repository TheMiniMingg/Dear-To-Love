// T13-ish + T22 in the real app: connect an OpenAI-compatible server, stream
// a reply, survive a failed reply with Retry. Uses a local fake server and a
// "local" connection, so no key or credential store is needed.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { startFakeOpenAI } from './fake-openai.mjs';
import { launch, makeDataDir, tabTo, typeInto, waitForReply, waitForText } from './harness.mjs';

let session;
let fake;
after(async () => {
  await session?.stop();
  await fake?.close();
});

async function fill(b, label, text) {
  const el = await b.$(`//label[normalize-space()="${label}"]/following-sibling::input`);
  await el.setValue(text);
}

test('live storyteller: stream a reply, retry a failure', async () => {
  fake = await startFakeOpenAI([
    { pieces: ['The lamp ', 'flares ', 'gold.'], delayMs: 120 },
    { status: 500 },
    { pieces: ['Second ', 'time ', 'lucky.'] },
  ]);
  session = await launch(makeDataDir());
  const b = session.browser;

  await waitForText(b, 'main', 'No stories yet');
  await tabTo(b, 'Settings');
  await b.keys(['Enter']);
  await waitForText(b, 'main', 'Storyteller');
  await tabTo(b, 'Add connection');
  await b.keys(['Enter']);
  await waitForText(b, '[role="dialog"]', 'Address');
  await fill(b, 'Name', 'Fake cloud');
  await fill(b, 'Address', fake.baseUrl);
  await fill(b, 'Model', 'story-model');
  await (await b.$('//label[contains(., "Local model")]/input')).click();
  await (await b.$('button=Save connection')).click();
  await waitForText(b, 'main', 'Fake cloud');
  const checked = await b.execute(
    () => document.querySelector('input[name="storyteller"]:checked')?.parentElement?.textContent,
  );
  assert.match(checked ?? '', /Fake cloud/);

  // Free connection test lists models.
  await (await b.$('button=Test connection')).click();
  await waitForText(b, 'main', 'is available');

  await (await b.$('button=Back')).click();
  await tabTo(b, 'New story');
  await b.keys(['Enter']);
  await tabTo(b, 'Start story');
  await b.keys(['Enter']);
  await waitForText(b, '[data-testid="narrative"]', 'The Lamp Room');
  await waitForText(b, 'header', 'Fake cloud');

  await tabTo(b, 'composer-input');
  await typeInto(b, '#composer-input', 'Light the lamp');
  await b.keys(['Enter']);
  await waitForText(b, '[data-testid="reply-draft"]', 'The lamp');
  await waitForReply(b);
  await waitForText(b, '[data-testid="narrative"]', 'The lamp flares gold.');

  await typeInto(b, '#composer-input', 'Look outside');
  await b.keys(['Enter']);
  await waitForText(b, 'main', 'Retry');
  await (await b.$('button=Retry')).click();
  await waitForText(b, '[data-testid="narrative"]', 'Second time lucky.');

  const chats = fake.requests.filter((r) => r.url.endsWith('/chat/completions'));
  assert.equal(chats.length, 3);
  const last = JSON.parse(chats[2].body);
  assert.equal(last.stream, true);
  assert.equal(JSON.stringify(last.messages).split('Look outside').length - 1, 1);

  // Usage & budget counts every call, the failed one too, at $0 for a local model.
  await b.keys(['Escape']);
  await (await b.$('button=Settings')).click();
  await (await b.$('button=Usage & budget')).click();
  await waitForText(b, 'main', 'Recent requests');
  await waitForText(b, '[aria-label="Totals"]', '3 to local models');
  const recent = await (await b.$('table[aria-label="Recent requests"]')).getText();
  assert.match(recent, /failed/);
  assert.equal(recent.split('$0 (local)').length - 1, 3);
});
