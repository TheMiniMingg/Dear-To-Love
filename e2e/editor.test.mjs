// M7 in the real app: change story details from now on (one route only),
// get another reply on a new route, and keep the original route intact.
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

let session;
after(async () => session?.stop());

test('story details, another reply and route safety', async () => {
  session = await launch(makeDataDir());
  const b = session.browser;
  const click = async (sel) => (await b.$(sel)).click();

  await waitForText(b, 'main', 'No stories yet');
  await click('button=Preset Story');
  await waitForText(b, 'main', 'Start story');
  await click('button=Start story');
  await waitForText(b, '[data-testid="narrative"]', 'The Lamp Room');
  await tabTo(b, 'composer-input');
  await typeInto(b, '#composer-input', 'Read the letter');
  await b.keys(['Enter']);
  await waitForReply(b);
  await waitForText(b, '[data-testid="narrative"]', 'Read the letter');

  // Story details: Mara gets a new role from now on, on Main only.
  await click('button=Menu');
  await waitForText(b, '[role="dialog"]', 'Paused');
  // The button waits for the reply to be saved; on a slow run that can lag.
  await b.waitUntil(async () => (await b.$('button=Story details')).isEnabled(), {
    timeout: 10000,
    timeoutMsg: 'Story details stayed disabled',
  });
  await click('button=Story details');
  await waitForText(b, '[role="dialog"]', 'Character');
  const picker = await b.$('//label[normalize-space()="Character"]/following-sibling::div/select');
  await picker.selectByVisibleText('Mara Quill');
  const role = await b.$('//label[normalize-space()="Role"]/following-sibling::input');
  await role.clearValue();
  await typeInto(b, '//label[normalize-space()="Role"]/following-sibling::input', 'Harbor master');
  await click('button*=Review changes');
  await waitForText(b, '[role="dialog"]', 'Main only');
  assert.match(await textOf(b, '[aria-label="Changes"]'), /Mara Quill · Role.*Harbor master/);
  await click('button=Apply from now');
  await waitForText(b, '[data-testid="narrative"]', 'Story details changed: Mara Quill · Role');

  // Another reply to the first action starts a new route; Main keeps its reply.
  const mainText = await textOf(b, '[data-testid="narrative"]');
  await b.execute(() =>
    [...document.querySelectorAll('button')]
      .find((x) => x.textContent === 'Another reply')
      ?.focus(),
  );
  await b.keys(['Enter']);
  await waitForText(b, '[role="dialog"]', 'on a new route');
  await click('button=Write another reply');
  await waitForText(b, '[data-testid="route-label"]', 'Alt');
  await waitForReply(b);
  const alt = await textOf(b, '[data-testid="narrative"]');
  assert.doesNotMatch(alt, /Story details changed/, 'the edit stays on Main');

  await click('button*=Routes');
  await waitForText(b, '[role="dialog"]', 'Another reply: “');
  // The same routes as a map and as a timeline.
  await click('//div[@role="dialog"]//label[.//span[normalize-space()="Map"]]');
  await waitForText(b, '[aria-label="Route map"]', 'Main');
  assert.match(await textOf(b, '[aria-label="Route map"]'), /Alt/);
  await click('//div[@role="dialog"]//label[.//span[normalize-space()="Timeline"]]');
  await waitForText(b, '[aria-label="Route timeline"]', 'Alt');
  await click('//div[@role="dialog"]//label[.//span[normalize-space()="List"]]');
  await waitForText(b, '[role="dialog"]', 'Switch');
  await click('//div[@role="dialog"]//button[normalize-space()="Switch"]');
  await waitForText(b, '[data-testid="route-label"]', 'Main');
  await waitForText(b, '[data-testid="narrative"]', 'Story details changed');
  assert.equal(await textOf(b, '[data-testid="narrative"]'), mainText);
});
