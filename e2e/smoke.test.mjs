// T01 + T25 + T27 (+ save/load/fork/reopen): keyboard-only, offline, real app.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, makeDataDir, tabTo, textOf, typeInto, waitForText } from './harness.mjs';

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
  await tabTo(b, 'composer-input');
  await typeInto(b, '#composer-input', 'Read the letter');
  await b.keys(['Enter']);
  await waitForText(b, '[data-testid="narrative"]', 'You decide: "Read the letter"');

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

  // Load the older quick save as a new branch.
  await tabTo(b, 'Save / Load');
  await b.keys(['Enter']);
  await waitForText(b, '[role="dialog"]', 'Quick save');
  await tabTo(b, 'Continue as new branch');
  await b.keys(['Enter']);
  await waitForText(b, '[data-testid="route-label"]', 'From save');
  const branchText = await textOf(b, '[data-testid="narrative"]');
  assert.ok(!branchText.includes('Climb down to the harbor'), 'branch starts at the save');

  // Reopen the app: the story and its routes are still there (T02 at UI level).
  await session.stop();
  session = await launch(dataDir);
  const b2 = session.browser;
  await waitForText(b2, 'main', 'The Unsigned Letter');
  await waitForText(b2, 'main', '2 routes');
});
