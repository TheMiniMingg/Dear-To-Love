// T37 in the real app: bookmark a place, search the route, jump to a
// result, and find the bookmark again after a restart.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, makeDataDir, tabTo, typeInto, waitForReply, waitForText } from './harness.mjs';

let session;
after(async () => session?.stop());

/** The event the reader is showing (focused after a jump). */
const shown = (b) =>
  b.execute(() => {
    const el = document.activeElement;
    return el?.dataset?.eventId
      ? { kind: el.className, text: el.textContent ?? '' }
      : { kind: '', text: '' };
  });

test('search a route, jump to a result, and keep bookmarks across a restart', async () => {
  const data = makeDataDir();
  session = await launch(data);
  let b = session.browser;
  const click = async (sel) => (await b.$(sel)).click();

  await waitForText(b, 'main', 'No stories yet');
  await click('button=New story');
  await waitForText(b, 'main', 'Quick Start');
  await click('button=Start story');
  await waitForText(b, '[data-testid="narrative"]', 'The Lamp Room');
  await tabTo(b, 'composer-input');
  await typeInto(b, '#composer-input', 'Read the letter by the window');
  await b.keys(['Enter']);
  await waitForReply(b);

  // Bookmark the action (its buttons show on hover).
  const action = await b.$('.turn-player');
  await action.moveTo();
  await (await action.$('button=Bookmark')).click();
  await b.waitUntil(async () => (await action.$('button*=Bookmarked')).isExisting(), {
    timeout: 5000,
    timeoutMsg: 'the action was not bookmarked',
  });

  // Ctrl+F opens Story search on this route.
  await b.keys(['Control', 'f']);
  await waitForText(b, '[role="dialog"]', 'Bookmarks on Main');
  await waitForText(b, '[role="dialog"]', 'Read the letter by the window');
  await typeInto(b, '#search-input', 'WINDOW letter');
  await b.keys(['Enter']);
  await waitForText(b, '[role="dialog"]', 'on Main match');
  const hits = await b.$$('.search-hit');
  assert.ok(hits.length >= 1);
  assert.match(await hits[0].getText(), /Read the letter by the window/);
  const marks = [];
  for (const m of await hits[0].$$('mark')) marks.push(await m.getText());
  assert.deepEqual(marks, ['letter', 'window']);
  await hits[0].click();
  await b.waitUntil(async () => !(await (await b.$('[role="dialog"]')).isExisting()), {
    timeout: 5000,
    timeoutMsg: 'the search did not close',
  });
  await b.waitUntil(async () => (await shown(b)).text.includes('Read the letter'), {
    timeout: 5000,
    timeoutMsg: 'the result was not shown',
  });
  assert.match((await shown(b)).kind, /event-focus/);

  // Restart: the bookmark is still there and still leads to its place.
  await session.stop();
  session = await launch(data);
  b = session.browser;
  await waitForText(b, 'main', 'The Unsigned Letter');
  await click('.story-open');
  await waitForText(b, '[data-testid="narrative"]', 'Read the letter by the window');
  assert.ok(await (await b.$('.turn-player .bookmark-button[aria-pressed="true"]')).isExisting());
  await click('button=Search');
  await waitForText(b, '[role="dialog"]', 'Bookmarks on Main');
  await click('[aria-label="Go to bookmark Read the letter by the window"]');
  await b.waitUntil(async () => (await shown(b)).text.includes('Read the letter'), {
    timeout: 5000,
    timeoutMsg: 'the bookmark did not lead to its place',
  });

  // Searching after the restart still finds it, and nothing that isn't there.
  await click('button=Search');
  await waitForText(b, '[role="dialog"]', 'Bookmarks on Main');
  await typeInto(b, '#search-input', 'harbor-ferry-zeppelin');
  await b.keys(['Enter']);
  await waitForText(b, '[role="dialog"]', 'Nothing on Main matches');
});
