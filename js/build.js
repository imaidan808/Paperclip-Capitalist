// Which build this page is: the commit it was made from and when it went up. GitHub Pages lets a browser keep files for ten minutes, so a page can run the build before the one that is live and
// nothing on the screen said so. The source tree says "dev"; scripts/stage.mjs writes the real stamp into the staged copy of this file (it is loaded with the modules it describes) and into
// assets/build.json (read with no cache: what is live now). The menu and the title screen show the first and say when the second is later. tests/build-stamp.test.mjs
export const BUILD = Object.freeze({ sha: 'dev', at: '' });
export const BUILD_URL = 'assets/build.json';

const SHA = /^[0-9a-f]{7,40}$/;
const WHEN = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
const timeOf = (s) => (typeof s === 'string' && WHEN.test(s) ? Date.parse(s) : NaN);
const isSha = (s) => typeof s === 'string' && SHA.test(s);

/** "Oct 30, 3:16 PM": when a build went up, in the reader's own time zone (`locale` and `timeZone` are for the tests); '' for a time that is not one. */
function whenOf(b, { locale, timeZone } = {}) {
  const t = timeOf(b && b.at);
  return Number.isNaN(t) ? '' : new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}) }).format(t);
}

/** "Version 57726ef, deployed Oct 30, 3:16 PM"; a development copy (no stamp) says so. */
export function buildLabel(b = BUILD, fmt) {
  if (!b || !isSha(b.sha)) return 'Version: a development copy, not a published build';
  const when = whenOf(b, fmt);
  return `Version ${b.sha.slice(0, 7)}${when ? `, deployed ${when}` : ''}`;
}

let memo = null; // { at, answer }: the last question and its answer
/**
 * The build that is live now, as { sha, at }, when it is later than `current`; null when it is the same or older, when it cannot be read, or when this is a development copy (it asks nobody).
 * It asks the site with no cache (the page's own copy of the stamp is the one thing a stale cache cannot tell), and at most once a minute unless `force`.
 * An older answer is not news: right after a deploy the host can still answer with the build before.
 */
export function newerBuild(current = BUILD, get = globalThis.fetch && globalThis.fetch.bind(globalThis), { force = false, now = Date.now } = {}) {
  if (!current || !isSha(current.sha) || typeof get !== 'function') return Promise.resolve(null);
  if (!force && memo && now() - memo.at < 60000) return memo.answer;
  const answer = (async () => {
    try {
      const r = await get(BUILD_URL, { cache: 'no-store' });
      if (!r || !r.ok) return null;
      const live = await r.json();
      if (!live || !isSha(live.sha) || live.sha.slice(0, 7) === current.sha.slice(0, 7)) return null;
      return timeOf(live.at) > timeOf(current.at) ? { sha: live.sha.slice(0, 7), at: live.at } : null; // an unreadable time compares false: not news
    } catch { return null; }
  })();
  memo = { at: now(), answer };
  return answer;
}

/** Write the label into `el`; when a later build is live, add that and how to get it (the browser's hard reload, which is the one thing that skips its ten minutes of old files). */
export async function stamp(el, { current = BUILD, get, force, now, locale, timeZone } = {}) {
  const fmt = { locale, timeZone };
  el.textContent = buildLabel(current, fmt);
  const live = await newerBuild(current, get, { force, now });
  if (live && el.isConnected !== false) {
    el.classList?.remove('mute', 'tiny'); el.classList?.add('small'); // a build that is behind is not fine print
    const when = whenOf(live, fmt);
    el.textContent = `${buildLabel(current, fmt)}. A newer version is live (${live.sha}${when ? `, deployed ${when}` : ''}): reload with Cmd+Shift+R (Ctrl+Shift+R on Windows) to get it.`;
  }
}
