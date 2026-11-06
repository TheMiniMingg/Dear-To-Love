// Desktop E2E harness: launches the real app through tauri-driver
// (WebKitWebDriver on Linux, Edge WebDriver on Windows; macOS has no driver).
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { remote } from 'webdriverio';
import { crc32, deflateSync } from 'node:zlib';

const root = fileURLToPath(new URL('..', import.meta.url));
const exe = process.platform === 'win32' ? 'dear-to-love.exe' : 'dear-to-love';
export const APP = process.env.DTL_APP ?? path.join(root, 'src-tauri/target/debug', exe);

export function makeDataDir() {
  return mkdtempSync(path.join(tmpdir(), 'dtl-e2e-'));
}

async function waitForPort(port, ms = 20000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/status`);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`tauri-driver did not start on port ${port}`);
}

/** Start tauri-driver + the app with an isolated data folder. */
export async function launch(dataDir, extraEnv = {}) {
  const env = {
    ...process.env,
    ...extraEnv,
    XDG_DATA_HOME: dataDir,
    XDG_CONFIG_HOME: dataDir,
    APPDATA: dataDir,
    LOCALAPPDATA: dataDir,
  };
  // Own process group (POSIX) so stop() can end the app's WebKit helpers too,
  // and a piped stderr so a helper that outlives the app can't hold this test
  // file's stderr open (the test runner waits for it and never exits).
  const posix = process.platform !== 'win32';
  const driver = spawn('tauri-driver', [], {
    env,
    detached: posix,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  driver.stderr.pipe(process.stderr, { end: false });
  await waitForPort(4444);
  const browser = await remote({
    hostname: '127.0.0.1',
    port: 4444,
    logLevel: 'error',
    capabilities: { 'tauri:options': { application: APP } },
  });
  const stop = async () => {
    try {
      await browser.deleteSession();
    } catch {
      // already gone
    }
    driver.kill();
    await new Promise((r) => setTimeout(r, 300));
    if (posix) {
      try {
        process.kill(-driver.pid, 'SIGTERM');
      } catch {
        // the whole group has exited
      }
    }
    driver.stderr.unpipe(process.stderr);
    driver.stderr.destroy();
  };
  return { browser, stop };
}

/** Press Tab until the focused element matches `match` (keyboard-only navigation). */
export async function tabTo(browser, match, { max = 60, shift = false } = {}) {
  for (let i = 0; i < max; i++) {
    const desc = await browser.execute(() => {
      const el = document.activeElement;
      if (!el) return '';
      return [el.id, el.getAttribute('aria-label') ?? '', (el.textContent ?? '').trim()].join('|');
    });
    if (typeof match === 'string' ? desc.split('|').some((p) => p === match) : match.test(desc)) {
      return;
    }
    await browser.keys(shift ? ['Shift', 'Tab'] : ['Tab']);
  }
  throw new Error(`could not reach ${match} with Tab`);
}

export async function textOf(browser, selector) {
  return browser.execute((s) => document.querySelector(s)?.textContent ?? '', selector);
}

export async function waitForText(browser, selector, needle, ms = 10000) {
  await browser.waitUntil(async () => (await textOf(browser, selector)).includes(needle), {
    timeout: ms,
    timeoutMsg: `"${needle}" did not appear in ${selector}`,
  });
}

/**
 * Type into a field through WebDriver "send keys". Real key events, but
 * WebKitWebDriver's action API drops repeated characters, so plain
 * `browser.keys(text)` is not reliable for words like "letter".
 */
export async function typeInto(browser, selector, text) {
  await (await browser.$(selector)).addValue(text);
}

/**
 * Wait until the reply being written has been committed: no draft is
 * showing and the newest turn, if any, is a reply. (Right after sending,
 * the draft may not have appeared yet, so "no draft" alone is not enough.)
 */
export async function waitForReply(browser, ms = 20000) {
  await browser.waitUntil(
    async () =>
      browser.execute(() => {
        if (document.querySelector('[data-testid="reply-draft"]')) return false;
        const turns = document.querySelectorAll(
          '[data-testid="narrative"] .turn-player, [data-testid="narrative"] .turn-assistant',
        );
        const last = turns[turns.length - 1];
        return (
          !!document.querySelector('[data-testid="narrative"]') &&
          (!last || last.classList.contains('turn-assistant'))
        );
      }),
    { timeout: ms, timeoutMsg: 'the reply did not finish' },
  );
}

/** A small solid-colour RGB PNG. */
export function png(width, height, [r, g, b]) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
