// M6 + T28 in the real app: create a story in Guided mode with the keyboard
// only (no typing), close the app halfway, reopen and finish.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, makeDataDir, tabTo, textOf, waitForReply, waitForText } from './harness.mjs';

const dataDir = makeDataDir();
let session;
after(async () => session?.stop());

const selected = (b, label) =>
  b.execute((l) => {
    const sel = [...document.querySelectorAll('select')].find(
      (s) => s.labels?.[0]?.textContent?.trim() === l,
    );
    return sel?.selectedOptions[0]?.textContent ?? '';
  }, label);

test('guided creation survives a restart', async () => {
  session = await launch(dataDir);
  let b = session.browser;

  await waitForText(b, 'main', 'No stories yet');
  await tabTo(b, 'Create your own');
  await b.keys(['Enter']);
  await waitForText(b, 'main', 'Where does it take place?');

  // Left/Right on a picker cycles presets.
  await tabTo(b, /-select\|\|Harbor Town/);
  await b.keys(['ArrowRight']);
  assert.equal(await selected(b, 'Start from a world'), 'The Glass Orchard');

  await tabTo(b, 'Next');
  await b.keys(['Enter']);
  await waitForText(b, 'main', 'Who do you play?');
  await tabTo(b, 'Next');
  await b.keys(['Enter']);
  await waitForText(b, 'main', 'How does it begin?');
  await tabTo(b, /-select\|\|.*written for another world/);
  await b.keys(['ArrowRight']);
  assert.equal(await selected(b, 'Start from a scenario'), 'The Memory Harvest');
  await waitForText(b, 'main', 'Draft saved.');

  // Close the app halfway; the draft comes back on reopen.
  await session.stop();
  session = await launch(dataDir);
  b = session.browser;
  await waitForText(b, 'main', 'No stories yet');
  await tabTo(b, 'Create your own');
  await b.keys(['Enter']);
  await waitForText(b, 'main', 'Picked up your unfinished story');
  await waitForText(b, 'main', 'How does it begin?');
  assert.equal(await selected(b, 'Start from a scenario'), 'The Memory Harvest');

  await tabTo(b, '6. Review');
  await b.keys(['Enter']);
  await waitForText(b, 'main', 'Ready to begin?');
  assert.match(await textOf(b, '[aria-label="Story summary"]'), /The Memory Harvest/);
  await tabTo(b, 'Create story');
  await b.keys(['Enter']);
  await waitForText(b, '[data-testid="narrative"]', 'First Picking');
  await waitForReply(b);

  // The finished draft is gone: the wizard starts fresh next time.
  await tabTo(b, 'Menu');
  await b.keys(['Enter']);
  await tabTo(b, 'Back to library');
  await b.keys(['Enter']);
  await waitForText(b, 'main', 'The Memory Harvest');
  await tabTo(b, 'Create your own');
  await b.keys(['Enter']);
  await waitForText(b, 'main', 'Where does it take place?');
  assert.doesNotMatch(await textOf(b, 'main'), /Picked up your unfinished story/);
});
