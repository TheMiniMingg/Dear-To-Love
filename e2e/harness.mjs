// Desktop E2E harness: launches the real app through tauri-driver
// (WebKitWebDriver on Linux, Edge WebDriver on Windows; macOS has no driver).
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { remote } from 'webdriverio';

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
export async function launch(dataDir) {
  const env = {
    ...process.env,
    XDG_DATA_HOME: dataDir,
    XDG_CONFIG_HOME: dataDir,
    APPDATA: dataDir,
    LOCALAPPDATA: dataDir,
  };
  const driver = spawn('tauri-driver', [], { env, stdio: ['ignore', 'ignore', 'inherit'] });
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

/** Wait until the reply being written has been committed. */
export async function waitForReply(browser, ms = 20000) {
  await browser.waitUntil(
    async () =>
      browser.execute(
        () =>
          !document.querySelector('[data-testid="reply-draft"]') &&
          !!document.querySelector('[data-testid="narrative"]'),
      ),
    { timeout: ms, timeoutMsg: 'the reply did not finish' },
  );
}
