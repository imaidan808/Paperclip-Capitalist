// Where Chrome is, on whatever machine this runs on: one answer for the drivers in scripts/ and the browser tests.
//   CHROME      the path of a Chrome or Chromium to drive, or null when there is none (the browser tests then skip)
//   BROWSER     true when browser tests may run: a Chrome exists and PC_NO_BROWSER is not set
//   chromeArgs  the flags every headless launch needs on this machine (a root user, as in a container, must pass --no-sandbox)
// Looked for, in order: CHROME_BIN or CHROME_PATH (the person's own choice), the Mac app the author uses, the Chromium that Playwright installs (PLAYWRIGHT_BROWSERS_PATH, /opt/pw-browsers, ~/.cache/ms-playwright)
// and the names a Linux distribution gives it. The newest Playwright build wins when there are several.
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const MAC = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const LINUX = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];

function playwrightBuilds() {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', join(homedir(), '.cache', 'ms-playwright')].filter(Boolean), out = [];
  for (const root of roots) {
    let names = [];
    try { names = readdirSync(root); } catch { continue; }
    for (const n of names.filter((x) => /^chromium-\d+$/.test(x)).sort((a, b) => parseInt(b.slice(9), 10) - parseInt(a.slice(9), 10))) {
      for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) out.push(join(root, n, sub));
    }
  }
  return out;
}

export function findChrome(env = process.env) {
  for (const k of ['CHROME_BIN', 'CHROME_PATH']) if (env[k] && existsSync(env[k])) return env[k];
  for (const p of [MAC, ...playwrightBuilds(), ...LINUX]) if (existsSync(p)) return p;
  return null;
}

export const CHROME = findChrome();
export const BROWSER = !process.env.PC_NO_BROWSER && !!CHROME;
/** Flags for a headless launch: the sandbox cannot start for root (a container), a container's small /dev/shm is not used, and the GPU never is. */
export const chromeArgs = () => ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', ...(process.platform === 'linux' ? ['--disable-dev-shm-usage'] : []), ...(typeof process.getuid === 'function' && process.getuid() === 0 ? ['--no-sandbox'] : [])];
