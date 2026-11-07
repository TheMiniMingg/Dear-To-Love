// T01 + T25 + T27 (+ preview, save/load/fork/reopen, app language): keyboard-only, offline, real app.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  launch,
  makeDataDir,
  tabTo,
  textOf,
  typeInto,
  waitForReply,
  waitForText,
} from './harness.mjs';

const dataDir = makeDataDir();
let session;
after(async () => session?.stop());

test('keyboard-only: quick start, play, save, load as branch, reopen', async () => {
  session = await launch(dataDir);
  const b = session.browser;

  await waitForText(b, 'main', 'No stories yet');
  await tabTo(b, 'New story');
  await b.keys(['Enter']);

  await waitForText(b, 'main', 'Quick Start');
  await tabTo(b, 'Start story');
  await b.keys(['Enter']);

  await waitForText(b, '[data-testid="narrative"]', 'The Lamp Room');
  // A new story opens with its premise and a hint, not a blank page.
  await waitForText(b, '[data-testid="story-intro"]', 'Write what you do');
  await tabTo(b, 'composer-input');
  await typeInto(b, '#composer-input', 'Read the letter');
  await b.keys(['Enter']);
  await waitForText(b, '.turn-player', 'Read the letter');
  // The first reply of a chapter sets the scene.
  await waitForText(b, '.turn-assistant', 'The lamp room at the top of the Wrenmouth lighthouse');
  await waitForReply(b);
  assert.ok(
    !(await textOf(b, '[data-testid="story-intro"]')).includes('Write what you do'),
    'the hint goes once the story has started',
  );

  await b.keys(['Control', 's']);
  await waitForText(b, '[role="status"]', 'Quick-saved');

  // Escape opens the pause menu and keeps the unsent draft (T27).
  await tabTo(b, 'composer-input');
  await typeInto(b, '#composer-input', 'half-typed');
  await b.keys(['Escape']);
  await waitForText(b, '[role="dialog"]', 'Paused');
  await b.keys(['Escape']);
  const draft = await b.execute(() => document.getElementById('composer-input')?.value);
  assert.equal(draft, 'half-typed');
  await tabTo(b, 'composer-input');
  for (let i = 0; i < 'half-typed'.length; i++) await b.keys(['Backspace']);
  assert.equal(await b.execute(() => document.getElementById('composer-input')?.value), '');
  await typeInto(b, '#composer-input', 'Climb down to the harbor');
  await b.keys(['Enter']);
  await waitForText(b, '[data-testid="narrative"]', 'Climb down to the harbor');
  await waitForReply(b);

  // Prompt Preview from the pause menu: local, read-only, has this route's turns.
  await tabTo(b, 'composer-input');
  await b.keys(['Escape']);
  await waitForText(b, '[role="dialog"]', 'Paused');
  await tabTo(b, 'Preview context');
  await b.keys(['Enter']);
  await waitForText(b, '[role="dialog"]', 'Nothing is sent until you play');
  await waitForText(b, '[aria-label="Prompt messages"]', 'Climb down to the harbor');
  await b.keys(['Escape']);
  await waitForText(b, '[role="dialog"]', 'Paused');
  await b.keys(['Escape']);

  // Load the older quick save as a new branch.
  await tabTo(b, 'Save / Load');
  await b.keys(['Enter']);
  await waitForText(b, '[role="dialog"]', 'Quick save');
  await tabTo(b, 'Continue as new branch');
  await b.keys(['Enter']);
  await waitForText(b, '[data-testid="route-label"]', 'From save');
  const branchText = await textOf(b, '[data-testid="narrative"]');
  assert.ok(!branchText.includes('Climb down to the harbor'), 'branch starts at the save');

  // On the new branch, texting a character shows a phone card, and the offline
  // storyteller texts back.
  const mode = await b.$('.composer-mode select');
  await mode.selectByVisibleText('Send a text');
  await typeInto(b, '.composer-mode input', 'Mara Quill');
  await typeInto(b, '#composer-input', 'Are you awake?');
  await b.keys(['Enter']);
  await waitForText(b, '[aria-label="Text messages with Mara Quill"]', 'Are you awake?');
  await waitForReply(b);
  assert.equal(
    await b.execute(() => document.querySelectorAll('.turn-assistant .msg-phone').length),
    1,
    'the reply is a text from Mara',
  );
  await mode.selectByVisibleText('Do or say');

  // Reopen the app: the story and its routes are still there (T02 at UI level).
  await session.stop();
  session = await launch(dataDir);
  const b2 = session.browser;
  await waitForText(b2, 'main', 'The Unsigned Letter');
  await waitForText(b2, 'main', '2 routes');

  // Settings → Language: the app in Japanese, still Japanese after a restart.
  await (await b2.$('button=Settings')).click();
  await (await b2.$('select[lang="mul"]')).selectByVisibleText('日本語');
  await waitForText(b2, 'h1', '設定');
  assert.equal(await b2.execute(() => document.documentElement.lang), 'ja');
  await session.stop();
  session = await launch(dataDir);
  const b3 = session.browser;
  await waitForText(b3, 'main', 'ルート 2 本');
  await waitForText(b3, 'body', '新しいストーリー');
});
