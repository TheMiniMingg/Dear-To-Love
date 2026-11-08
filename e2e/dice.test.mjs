// Dice: an adventure asks for a roll at the moment of truth, the app rolls
// it, and the offline storyteller follows the result. Offline, real app.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, makeDataDir, textOf, typeInto, waitForReply, waitForText } from './harness.mjs';

const dataDir = makeDataDir();
let session;
after(async () => session?.stop());

test('an adventure asks for a roll and the app rolls it', async () => {
  session = await launch(dataDir);
  const b = session.browser;

  await waitForText(b, 'main', 'No stories yet');
  await (await b.$('button=Preset Story')).click();
  await waitForText(b, 'main', 'Start story');
  const type = await b.$("//label[normalize-space()='Type of story']/following::select[1]");
  await type.selectByVisibleText('Adventure');
  await (await b.$('button=Start story')).click();

  await waitForText(b, '[data-testid="story-intro"]', 'Write what you do');
  await typeInto(b, '#composer-input', 'Try to climb the wall');
  await b.keys(['Enter']);
  await waitForReply(b);
  await waitForText(b, '.turn-assistant', 'Roll for');
  const roll = await b.$('.turn-assistant .msg-roll.ask button');
  await roll.waitForEnabled();
  // WebDriver reads only displayed text, and the story fades in from
  // opacity 0, so wait for the button to show before reading it.
  await roll.waitForDisplayed();
  assert.equal(await roll.getText(), 'Roll 1d20');
  await roll.click();

  // The result is in the action, and the reply follows it without a new roll.
  await waitForText(b, '.turn-player .msg-roll.rolled', 'needs');
  await waitForReply(b);
  const outcome = await textOf(b, '.turn-player .msg-roll.rolled .roll-outcome');
  assert.match(outcome, /^(Success|Failed)$/);
  assert.equal(
    await b.execute(() => document.querySelectorAll('.msg-roll.ask button').length),
    0,
    'the roll was answered',
  );
});
