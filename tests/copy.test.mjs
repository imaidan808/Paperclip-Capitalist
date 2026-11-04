// Copy pass (work order of 2026-11-02): the game's words keep to what the engine does, and they keep one voice.
//   C1  the Codex's net worth formula names every term the engine counts, and its exit formula the audit cut the engine applies
//   C2  each Background's card headlines are short and carry no number the full claim does not
//   C3  the voice: no filler, no cheerleading, no stock phrases in what a player reads, and a lesson's scene states, it does not ask
//   C4  the Academy's result keeps its detail one tap away, never in front
// Run: node --test tests/copy.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const { Game } = await import('../js/engine.js');
const { PERKS } = await import('../js/data/perks.js');
const { CODEX } = await import('../js/meta/codex.js');
const { ACADEMY } = await import('../js/meta/academy.js');
const A = await import('../js/ui/academy.js');

const fresh = () => new Game({ perks: [], seed: 1, handle: 'T', pid: 'T-1' });

// ---------------------------------------------------------------------------------------------------------------------
test('C1: the net worth formula names every term the engine counts, and the exit formula the audit cut', () => {
  const formula = (id) => CODEX.find((e) => e.id === id).formula;
  const g = fresh(), base = g.netWorth();
  g.s.settle.push({ amt: 100 }); assert.equal(+(g.netWorth() - base).toFixed(6), 100, 'a sale waiting to settle is counted');
  g.s.settle.pop();
  g.s.escrow.push({ cash: 50, assets: [] }); assert.equal(+(g.netWorth() - base).toFixed(6), 50, 'goods and cash held for a swap are counted');
  g.s.escrow.pop();
  assert.ok(/this\.royaltyOwed\(\)/.test(Game.prototype.netWorth.toString()), 'royalties owed are taken off');
  const nw = formula('net-worth');
  for (const term of ['cash', 'stock at fair value', 'goods on trucks', 'held for a swap', 'sales waiting to settle', 'managers at cost', 'debt', 'royalties owed']) assert.ok(nw.includes(term), `the net worth formula says "${term}"`);
  // the exit: the premium is cut 15% for each failed audit and never below 30% of itself
  const x = fresh(); x.s.mil.m3 = true; x.s.dp = [1000, 1000];
  const clean = x.exitQuote('sale').premium;
  assert.ok(clean > 0, 'the quote has a premium to cut');
  x.s.auditFail = 2; assert.ok(Math.abs(x.exitQuote('sale').premium / clean - 0.7) < 1e-9, 'two failed audits leave 70%');
  x.s.auditFail = 9; assert.ok(Math.abs(x.exitQuote('sale').premium / clean - 0.3) < 1e-9, 'the cut stops at 30% of the premium');
  assert.equal(x.exitQuote('ipo').ok, false, 'an IPO is closed to a founder with a failed audit');
  assert.ok(formula('exit-valuation').includes('max(0.3, 1 - 0.15 x failed audits)'), 'the exit formula says the same');
  assert.ok(/less \$\{Math\.round\(Math\.min\(0\.7, 0\.15 \* game\.s\.auditFail\) \* 100\)\}% for failed audits/.test(read('js/ui/drawers/bank.js')), 'and so does the Bank card, when there is a cut to show');
});

// ---------------------------------------------------------------------------------------------------------------------
test('C2: a Background\'s card headlines are short, and carry no figure its full claim does not', () => {
  const nums = (t) => (t.match(/\d+(?:\.\d+)?/g) || []);
  for (const [id, p] of Object.entries(PERKS)) {
    for (const [short, full, what] of [[p.gain, p.strength, 'gain'], [p.loss, p.cost, 'loss']]) {
      assert.ok(typeof short === 'string' && short.length >= 10 && short.length <= 40, `${id}.${what}: a headline of 10..40 characters (${short?.length})`);
      assert.ok(short.length < full.length, `${id}.${what}: the headline is shorter than the claim`);
      for (const n of nums(short)) assert.ok(nums(full).includes(n), `${id}.${what}: the headline says ${n}, the claim does not`);
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// What a player reads is in these sources. The non-player voices (a buyer's lines in js/play, sound recipes in js/audio, the world's art) are not held to this.
function* files(dir) {
  for (const f of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${f}`, st = statSync(join(ROOT, rel));
    if (st.isDirectory()) yield* files(rel); else if (f.endsWith('.js')) yield rel;
  }
}
const SOURCES = [...files('js/ui'), ...files('js/meta'), ...files('js/data'), 'js/main.js', 'js/engine.js', 'js/deal.js', 'js/config.js', 'js/session.js'];
const LIT = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
/** The string literals of a source, a comment never read as text (a line comment, a block comment). */
function literals(src) {
  const out = []; let block = false;
  src.split('\n').forEach((ln, i) => {
    let s = ln;
    if (block) { if (!s.includes('*/')) return; s = s.split('*/').slice(1).join('*/'); block = false; }
    while (s.includes('/*')) { const [a, b] = [s.slice(0, s.indexOf('/*')), s.slice(s.indexOf('/*') + 2)]; if (b.includes('*/')) s = a + b.slice(b.indexOf('*/') + 2); else { s = a; block = true; break; } }
    if (s.trimStart().startsWith('//')) return;
    for (const m of s.matchAll(LIT)) { const t = m[1] ?? m[2] ?? m[3] ?? ''; if (t.trim().split(/\s+/).length >= 4) out.push([i + 1, t]); }
  });
  return out;
}
// Filler that says nothing, cheerleading, and the stock phrases of a machine's prose. "Really" is left alone: "what it is really worth" is a fact about a hidden value.
const BANNED = /\b(simply|basically|essentially|literally|incredibly|extremely|truly|obviously|of course|it is important to|it'?s important to|keep in mind|bear in mind|please note|note that|not just|isn'?t just|more than just|good luck|you'?ve got this|exciting|amazing|fantastic|wonderful|delve|welcome)\b|\blet[’']s\b/i;

test('C3: what a player reads has no filler, no cheerleading and no stock phrase', () => {
  const hits = [];
  for (const f of SOURCES) for (const [line, t] of literals(read(f))) { const m = BANNED.exec(t); if (m) hits.push(`${f}:${line} "${m[0]}": ${t.slice(0, 80)}`); }
  assert.deepEqual(hits, [], 'cut these, or say the thing plainly:\n' + hits.join('\n'));
});

test('C3: a lesson\'s scene states, it does not ask; no lesson text is exclaimed', () => {
  for (const m of ACADEMY) {
    assert.ok(!m.intro.includes('?'), `${m.id}: the scene is a statement`);
    for (const s of m.steps) assert.ok(!/!/.test(s.say + s.hint), `${m.id}/${s.id}: no exclamation marks`);
    assert.ok(!/!/.test(m.why.gist), `${m.id}: the gist is not exclaimed`);
  }
});

// ---------------------------------------------------------------------------------------------------------------------
test('C4: the result sheet opens on the headline and the idea; the explanation, the math and the Codex page open on request', () => {
  for (const m of ACADEMY) {
    const html = A.whyHTML(m, { index: 0, total: 10 });
    const open = html.replace(/<details[\s\S]*?<\/details>/g, '');
    assert.ok(open.includes(m.why.gist.replace(/&/g, '&amp;').replace(/'/g, '&#39;')) || open.includes('ac-gist'), `${m.id}: the idea is in the open part`);
    assert.ok(!open.includes(m.why.formula.slice(0, 20)), `${m.id}: the formula is not in the open part`);
    assert.ok(!open.includes(m.why.example.result.slice(0, 30)), `${m.id}: the worked example is not in the open part`);
    assert.ok(open.split(/\s+/).length < 80, `${m.id}: the open part of the result is short (${open.split(/\s+/).length} words)`);
  }
  const cx = read('js/ui/drawers/codex.js');
  assert.ok(/<details class="cx-more"><summary>Explanation<\/summary>/.test(cx) && /<summary>The math<\/summary>/.test(cx) && /<summary>Common mistakes<\/summary>/.test(cx), 'a Codex page folds its explanation, its math and its mistakes');
  assert.ok(/foldHTML\(m, 'why', 'Why this result'/.test(read('js/ui/deal.js')) && /<details class="\$\{cls\}" data-fold="\$\{key\}"/.test(read('js/ui/deal.js')), 'the Deal Room folds its reasons, in a fold that keeps its state (tests/copy2-deal.test.mjs D1)');
});
