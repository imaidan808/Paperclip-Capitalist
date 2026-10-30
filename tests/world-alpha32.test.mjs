// A canvas keeps `globalAlpha` as a double in Chrome and as a 32-bit float in Safari and Firefox (and in the browser of a player who recorded the world: buyers in a hurry stood there as ghosts).
// `ctx.globalAlpha *= a; ...; ctx.globalAlpha /= a` hands the alpha back exactly on a double. On a float the quotient comes out a hair over 1, the setter ignores a value over 1, and everything
// drawn after it stays faint: the pulse under a buyer in a hurry did exactly that, so its body was drawn at a third of its strength and flickered as the pulse breathed (the choice of the
// multiplier decides, frame by frame, whether the alpha comes back). These tests draw the world on a canvas that keeps its alpha the way Safari does, and want the same picture as on a double.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { Game } from '../js/engine.js';
import { ZONES } from '../js/data/index.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const noop = () => {};
const grad = { addColorStop: noop };
const PAINT = new Set(['fill', 'stroke', 'fillRect', 'strokeRect', 'drawImage', 'fillText', 'strokeText']);
/** A recording context that keeps the alpha as a browser does: a value out of range (or NaN) is ignored, `f32` keeps it as a 32-bit float, and `restore` puts the saved one back. */
function browserCtx(log, f32) {
  const t = { globalAlpha: 1, measureText: (s) => ({ width: String(s).length * 6 }), createLinearGradient: () => grad, createRadialGradient: () => grad, getTransform: () => ({}) };
  const saved = [];
  return new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      if (typeof k === 'symbol') return undefined;
      return (...a) => { if (k === 'save') saved.push(o.globalAlpha); else if (k === 'restore') { if (saved.length) o.globalAlpha = saved.pop(); } else if (PAINT.has(k)) log.alphas.push([k, o.globalAlpha, typeof a[0] === 'string' ? a[0] : '']); };
    },
    set(o, k, v) { if (k === 'globalAlpha') { if (v >= 0 && v <= 1) o.globalAlpha = f32 ? Math.fround(v) : v; } else o[k] = v; return true; },
  });
}
async function worldOn(f32) {
  const log = { alphas: [] };
  const el = () => ({ style: {}, dataset: {}, width: 0, height: 0, _h: {}, addEventListener(type, fn) { this._h[type] = fn; }, setAttribute: noop, getContext: () => browserCtx(log, f32), getBoundingClientRect: () => ({ width: 800, height: 520, left: 0, top: 0 }), replaceChildren: noop, append: noop });
  globalThis.document = { createElement: el, documentElement: { dataset: {} }, hidden: false };
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = noop;
  const { World } = await import('../js/world/world.js');
  const g = new Game({ perks: ['connected', 'grad'], handle: 'Test', pid: 'T-1', seed: 3 });
  g.s.auditFirst = true; g.s.cash = ZONES[16].gate + 50; g._unlock();
  for (let z = 1; z <= 16; z++) for (let i = 0; i < 3; i++) g._spawnLead(z, false, true); // buyers in a hurry, in every district
  const session = { game: g, clock: { now: () => g.s.hour, paused: true, speed: 1 } };
  const w = new World({ session, ui: { zone: 1, sel: new Set() }, activate: noop, hover: noop });
  w.host = { getBoundingClientRect: () => ({ width: 800, height: 520 }) };
  w.resize(); w.sync(); w.placePlayer();
  return { w, log, g };
}
/** The first paint whose alpha differs between the two canvases (null when they agree), with a few of the paints around it. */
function firstDifference(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i][0] !== b[i][0] || Math.abs(a[i][1] - b[i][1]) > 1e-6) return { at: i, double: a.slice(Math.max(0, i - 2), i + 3).map((x) => x.join(' ')), float32: b.slice(Math.max(0, i - 2), i + 3).map((x) => x.join(' ')) };
  return a.length === b.length ? null : { at: n, double: [`${a.length} paints`], float32: [`${b.length} paints`] };
}

test('a buyer in a hurry is drawn at full strength on a canvas that keeps its alpha as a 32-bit float', async () => {
  const run = async (f32) => {
    const { w, log } = await worldOn(f32);
    w.focusZone(1, false); w.draw();
    const e = [...w.ents.values()].find((x) => x.type === 'lead' && x.lead && x.lead.need && !x.leaving);
    assert.ok(e, 'a buyer with a lead in a hurry');
    const finals = [];
    for (const t of [1200, 1500, 1830, 2100, 2470, 2900, 3333, 3700]) { // the pulse breathes with the clock, and so does the rounding
      w.t = t; w.vt = t; w.env.t = t; log.alphas.length = 0; w.ctx.globalAlpha = 1; w.drawEnt(w.ctx, e);
      finals.push(w.ctx.globalAlpha); w.ctx.globalAlpha = 1;
    }
    return { paints: log.alphas.slice(), finals };
  };
  const dbl = await run(false), flt = await run(true);
  assert.deepEqual(flt.finals, dbl.finals, 'the alpha is whole again after the buyer');
  assert.ok(flt.finals.every((a) => a === 1), 'and it is 1');
  const d = firstDifference(dbl.paints, flt.paints);
  assert.equal(d, null, 'the last frame of the buyer is the same picture: ' + JSON.stringify(d));
});

test('every district is drawn with the same alphas on a 32-bit float canvas as on a double one', async () => {
  const run = async (f32) => {
    const { w, log } = await worldOn(f32);
    const out = [];
    for (let z = 1; z <= 16; z++) { w.focusZone(z, false); log.alphas.length = 0; w.t = 5000; w.vt = 5000; w.env.t = 5000; w.dirty = true; w.draw(); out.push(log.alphas.slice()); }
    return out;
  };
  const dbl = await run(false), flt = await run(true);
  const bad = [];
  for (let z = 0; z < 16; z++) { const d = firstDifference(dbl[z], flt[z]); if (d) bad.push(`district ${z + 1}: paint ${d.at} double [${d.double.join(' | ')}] float32 [${d.float32.join(' | ')}]`); }
  assert.deepEqual(bad, [], 'the picture does not depend on how the canvas keeps its alpha');
});

test('fade scales the alpha and hands back the one to put back, exactly, on a float canvas', async () => {
  const { fade } = await import('../js/world/toys.js');
  assert.equal(typeof fade, 'function');
  const g = browserCtx({ alphas: [] }, true);
  for (const q of [0.3, 0.4, 0.55, 0.6, 0.62, 0.8, 0.28 + 0.16 * 0.37, 0.28 + 0.16 * 0.91]) {
    g.globalAlpha = 1; const was = fade(g, q);
    assert.ok(Math.abs(g.globalAlpha - q) < 1e-6, `the alpha is ${q} times what it was`); assert.equal(was, 1, 'it hands back what it was');
    g.globalAlpha = was; assert.equal(g.globalAlpha, 1, `and putting it back gives exactly 1 after ${q}`);
  }
  g.globalAlpha = 0.5; const was = fade(g, 0.4); assert.ok(Math.abs(g.globalAlpha - 0.2) < 1e-6); g.globalAlpha = was; assert.equal(g.globalAlpha, 0.5, 'from a half too');
});

test('no module scales the canvas alpha with *= or /=: it is saved and put back by assignment', () => {
  const bad = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.js')) readFileSync(p, 'utf8').split('\n').forEach((line, i) => { if (/\bglobalAlpha\s*[*/]=/.test(line)) bad.push(`${relative(ROOT, p)}:${i + 1}`); });
    }
  };
  walk(join(ROOT, 'js'));
  assert.deepEqual(bad, [], 'use `const was = fade(g, a); ...; g.globalAlpha = was;` (toys.js): a float canvas does not give the alpha back from `/=`');
});
