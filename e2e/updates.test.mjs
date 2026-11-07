// M9 in the real app: update checks stay off until opted in (T44), a newer
// stable release shows a footer notice (T42, T45), "Got it" hides it across
// a restart (T43), and the diagnostics report holds no paths (T50).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { launch, makeDataDir, textOf, waitForText } from './harness.mjs';

const REPO = 'https://github.com/TheMiniMingg/Dear-To-Love/releases/tag';

function release(tag, extra = {}) {
  return {
    tag_name: tag,
    html_url: `${REPO}/${tag}`,
    draft: false,
    prerelease: false,
    name: `Dear to Love ${tag}`,
    published_at: '2026-11-01T00:00:00Z',
    assets: [],
    ...extra,
  };
}

/** A stand-in for GitHub's release list. */
async function startReleases(list) {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(list));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, requests, close: () => server.close() };
}

let session;
let releases;
after(async () => {
  await session?.stop();
  releases?.close();
});

test('opt-in update notice, acknowledgement across a restart, and a clean report', async () => {
  releases = await startReleases([
    release('v0.1.0'),
    release('v0.10.0'),
    release('v0.9.0'),
    release('v0.11.0-beta.1', { prerelease: true }),
    release('v9.0.0', { draft: true }),
  ]);
  const env = { DTL_RELEASES_API: releases.url };
  const data = makeDataDir();
  session = await launch(data, env);
  let b = session.browser;
  const click = async (sel) => (await b.$(sel)).click();
  const notice = () => b.$('[aria-label="Update available"]');

  // Off by default: nothing is asked and nothing shows (T44).
  await waitForText(b, 'main', 'No stories yet');
  await waitForText(b, 'footer', 'v0.1.0');
  await click('button=Settings');
  await waitForText(b, 'main', 'Update checks are off.');
  assert.equal(releases.requests.length, 0, 'no request while checks are off');
  assert.equal(await (await notice()).isExisting(), false);

  // Opting in runs the first check: the highest stable release wins (T42, T45).
  await click('//label[contains(., "Check GitHub for a new release")]/input');
  await waitForText(b, 'main', 'v0.10.0 is available; you have v0.1.0');
  assert.deepEqual(releases.requests, ['/repos/TheMiniMingg/Dear-To-Love/releases?per_page=100']);
  await waitForText(b, 'footer', 'Dear to Love v0.10.0 is available.');
  assert.ok(await (await b.$('button=View release v0.10.0')).isExisting());

  // "Got it" hides the notice; Settings still says a release is out.
  await click('[aria-label="Hide the notice for v0.10.0"]');
  await b.waitUntil(async () => !(await (await notice()).isExisting()), {
    timeout: 5000,
    timeoutMsg: 'the notice did not hide',
  });
  await waitForText(b, 'main', 'v0.10.0 is available');

  // After a restart it stays hidden, and the recent result is reused (T43).
  await session.stop();
  session = await launch(data, env);
  b = session.browser;
  await waitForText(b, 'main', 'No stories yet');
  await waitForText(b, 'footer', 'v0.1.0');
  await new Promise((r) => setTimeout(r, 1000));
  assert.equal(await (await notice()).isExisting(), false, 'still acknowledged');
  assert.equal(releases.requests.length, 1, 'a fresh result is not fetched again');

  // The report says what was found and leaks no folder (T50).
  await click('button=Diagnostics');
  await waitForText(b, 'main', 'Updates');
  const copy = await b.$('button=Copy report…');
  await copy.waitForEnabled({ timeout: 20000 });
  await copy.click();
  await waitForText(b, '[role="dialog"]', 'Diagnostics report');
  const area = await b.$('textarea[aria-label="Report text"]');
  await area.waitForExist({ timeout: 20000 });
  const report = await area.getValue();
  assert.match(report, /^Dear to Love diagnostics report\n/);
  assert.match(report, /Version: v0\.1\.0 /);
  assert.match(report, /Update checks: on, v0\.10\.0 available/);
  assert.match(report, /\[WARN\] UPDATES Updates: v0\.10\.0 is available/);
  assert.ok(!report.includes(data), 'the data folder is not in the report');
  assert.ok(!report.includes('127.0.0.1'), 'the test server address is not in the report');
  assert.match(await textOf(b, '[role="dialog"]'), /no story text, titles, API keys or file paths/);
  await click('button=Close');
});
