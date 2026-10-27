// A fake drawer context built on a REAL Game, for testing the HTML a drawer produces without a browser.
// fakeCtx({ days, perks, seed }) plays the heuristic bot for `days` virtual days first, so tests can look at fresh, mid-game and late-game states.
import { makeGame, run } from '../bot.mjs';
import { esc } from '../../js/ui/common.js';
import { fmtMoney, fmtPct } from '../../js/market.js';

export function fakeCtx({ days = 0, perks = ['trades', 'pro'], seed = 7, zone } = {}) {
  const game = makeGame(perks, 'ops', seed);
  if (days) run(game, { days });
  const S = {
    game, clock: { paused: false, speed: 1, now: () => game.s.hour }, canSetClock: () => true, roster: () => [], leaderboard: () => [], difficulty: { eeiFloor: 1000 }, roomInfo: null,
    alivePeers: () => [], setPaused() {}, setSpeed() {}, propose: () => ({ ok: false, msg: 'offline' }), students: () => [], flagsAll: () => [], incoming: [], outgoing: [],
  };
  const U = { zone: zone ?? Math.max(...game.s.zones), drawer: null, sel: new Set(), queue: [], prev: {}, features: null };
  const toasts = [], calls = [];
  const ctx = {
    S, U, g: () => game, esc, money: fmtMoney, pct: fmtPct, toasts, calls, progress: null,
    toast: (m, l) => toasts.push([m, l]), say: (r) => { if (r?.msg) toasts.push([r.msg, r.ok ? 'good' : 'bad']); return r; },
    render() { calls.push('render'); }, queue() {}, confirmBox(title, body, ok, fn) { calls.push(['confirm', title]); ctx._confirm = fn; },
    openDrawer(id) { U.drawer = id; calls.push(['open', id]); }, closeDrawer() { U.drawer = null; },
    deal: (spec) => { calls.push(['deal', spec]); return { ok: true }; }, on: () => () => {}, world: () => null,
    dlg: { open(html) { calls.push(['dlg', html]); }, close() {}, el: { open: false } }, sfx: new Proxy({}, { get: () => () => {} }), burst() {}, announce() {},
  };
  return ctx;
}
/** Cheap structural checks every drawer's HTML must pass. */
export function checkHTML(html, label = 'html') {
  const bad = [];
  if (/undefined|NaN|\[object Object\]|Infinity/.test(html)) bad.push(`${label}: contains undefined, NaN, Infinity or [object Object]`);
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  if (new Set(ids).size !== ids.length) bad.push(`${label}: duplicate ids`);
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    if (!text && !/aria-label=/.test(m[1])) bad.push(`${label}: a button has neither text nor aria-label: ${m[0].slice(0, 80)}`);
  }
  return bad;
}
