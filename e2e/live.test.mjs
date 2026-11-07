// T13-ish + T22 in the real app: connect an OpenAI-compatible server, stream
// a reply, survive a failed reply with Retry, then end the chapter with a
// recap the next chapter reads. Uses a local fake server and a "local"
// connection, so no key or credential store is needed.
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
    { pieces: ['Sam lit the lamp ', 'and looked outside.'] },
    { pieces: ['The harbor is quiet.'] },
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

  // End chapter: the storyteller writes a recap, the player edits it, the
  // chapter is saved, and the next chapter's replies read the recap.
  // The streamed draft shows the reply's text before it is committed, and
  // End chapter stays disabled until then.
  await waitForReply(b);
  const endButton = await b.$('button=End chapter');
  await endButton.waitForEnabled({ timeout: 10000 });
  await endButton.click();
  await waitForText(b, '[role="dialog"]', 'Written by Fake cloud');
  const recapBox = await b.$('#end-chapter-recap');
  assert.equal(await recapBox.getValue(), 'Sam lit the lamp and looked outside.');
  await recapBox.setValue('Sam lit the lamp. Outside, a boat moved with no lights.');
  await (await b.$('button=Save and start Chapter 2')).click();
  await waitForText(b, '[data-testid="narrative"]', 'Recap of Chapter 1');
  await waitForText(b, '[data-testid="narrative"]', 'a boat moved with no lights.');
  await waitForText(b, '[data-testid="narrative"]', 'Low Tide');
  assert.equal(
    await b.execute(() =>
      [...document.querySelectorAll('.chapter-heading h2')]
        .map((h) => h.getAttribute('aria-label'))
        .pop(),
    ),
    'Chapter 2: Low Tide',
  );
  await waitForText(b, 'header', 'Saved "End of Chapter 1: The Lamp Room"');
  await typeInto(b, '#composer-input', 'Walk to the harbor');
  await b.keys(['Enter']);
  await waitForText(b, '[data-testid="narrative"]', 'The harbor is quiet.');
  const all = fake.requests.filter((r) => r.url.endsWith('/chat/completions'));
  assert.equal(all.length, 5);
  assert.match(all[3].body, /CHAPTER 1: The Lamp Room/);
  const system = JSON.parse(all[4].body).messages[0].content;
  assert.ok(
    system.includes(
      'EARLIER CHAPTERS\nChapter 1, The Lamp Room: Sam lit the lamp. Outside, a boat moved with no lights.\n',
    ),
    system,
  );

  // Story memory shows what any next storyteller reads: the recap, and no
  // summary yet after three turns.
  await b.keys(['Escape']);
  await waitForText(b, '[role="dialog"]', 'Paused');
  await (await b.$('button=Story memory')).click();
  await waitForText(b, '[role="dialog"]', 'Chapter 1: The Lamp Room');
  await waitForText(b, '[role="dialog"]', 'a boat moved with no lights.');
  await waitForText(b, '[role="dialog"]', 'Now writing: Fake cloud');
  await waitForText(b, '[role="dialog"]', 'still reads all 3 turns word for word');

  // Usage & budget counts every call, the failed one too, at $0 for a local model.
  await b.keys(['Escape']);
  await waitForText(b, '[role="dialog"]', 'Paused');
  await (await b.$('button=Settings')).click();
  await waitForText(b, 'main', 'Storyteller');
  await (await b.$('button=Usage & budget')).click();
  await waitForText(b, 'main', 'Recent requests');
  await waitForText(b, '[aria-label="Totals"]', '5 to local models');
  const recent = await (await b.$('table[aria-label="Recent requests"]')).getText();
  assert.match(recent, /failed/);
  assert.equal(recent.split('$0 (local)').length - 1, 5);
});
