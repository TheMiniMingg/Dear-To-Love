// T20/T60 in the real app: an Ollama connection (native API) lists models,
// streams a reply and asks for the configured context size.
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

test('Ollama storyteller: test connection and play a turn', async () => {
  fake = await startFakeOpenAI([{ pieces: ['The kettle ', 'sings.'] }]);
  session = await launch(makeDataDir());
  const b = session.browser;

  await waitForText(b, 'main', 'No stories yet');
  await tabTo(b, 'Settings');
  await b.keys(['Enter']);
  await waitForText(b, 'main', 'Storyteller');
  await (await b.$('button=Add connection')).click();
  await waitForText(b, '[role="dialog"]', 'Address');
  await (
    await b.$('//label[normalize-space()="Service"]/following-sibling::select')
  ).selectByAttribute('value', 'ollama');
  await waitForText(b, '[role="dialog"]', 'ollama pull');
  await fill(b, 'Address', fake.root);
  await fill(b, 'Model', 'story-model');
  await (await b.$('button=Save connection')).click();
  await waitForText(b, 'main', 'Ollama ·');

  await (await b.$('button=Test connection')).click();
  await waitForText(b, 'main', 'is available');

  await (await b.$('button=Back')).click();
  await tabTo(b, 'Preset Story');
  await b.keys(['Enter']);
  await tabTo(b, 'Start story');
  await b.keys(['Enter']);
  await waitForText(b, '[data-testid="narrative"]', 'The Lamp Room');
  await tabTo(b, 'composer-input');
  await typeInto(b, '#composer-input', 'Make tea');
  await b.keys(['Enter']);
  await waitForReply(b);
  await waitForText(b, '[data-testid="narrative"]', 'The kettle sings.');

  const chats = fake.requests.filter((r) => r.url === '/api/chat');
  assert.equal(chats.length, 1);
  const body = JSON.parse(chats[0].body);
  assert.equal(body.options.num_ctx, 8192);
  assert.equal(JSON.stringify(body.messages).split('Make tea').length - 1, 1);
});
