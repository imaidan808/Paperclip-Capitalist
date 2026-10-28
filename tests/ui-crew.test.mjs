// The Crew drawer against the real engine: the HTML at four stages of a run with two Background pairs, and every action it offers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeCtx, checkHTML } from './helpers/ctx.mjs';
import crew from '../js/ui/drawers/crew.js';
import { PIPE, UPGRADES, CLIENTS, ZONES } from '../js/config.js';

const STALE = /Zone 2|Scrap Yard profile|Bootstrapper/i;
const visible = (html) => html.replace(/<[^>]+>/g, ' ');
const PAIRS = [['trades', 'pro'], ['immigrant', 'heir']];
const STAGES = [0, 10, 25, 60];
const tabs = ['crew', 'upgrades', 'clients'];
const tick = (ms = 15) => new Promise((r) => setTimeout(r, ms));
const el = (dataset = {}, value = '') => ({ dataset, value, closest: () => null });

/** Everything the page could press must be wired: each data-act, data-change and data-input in `html` has a handler (or is the shell's dock). */
function wired(html, acts, label) {
  for (const m of html.matchAll(/data-(act|change|input)="([^"]+)"/g)) {
    const [, kind, name] = m;
    assert.ok(typeof acts[name] === 'function' || (kind === 'act' && name === 'dock'), `${label}: no handler for ${kind} ${name}`);
  }
  const fids = [...html.matchAll(/data-fid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(fids).size, fids.length, `${label}: data-fid values must be unique (they restore focus after a redraw)`);
}
/** A dialog element the drawer can repaint into. */
function dlgStub(ctx) {
  const body = { innerHTML: '', querySelector: () => ({ focus() {} }) }, prev = { innerHTML: '' }, out = { textContent: '' };
  ctx.dlg.el = { open: true, querySelector: (s) => (s === '#chbody' ? body : s === '#chprev' ? prev : s === '#chamt' ? out : null) };
  return { body, prev, out };
}
const lastDlg = (ctx) => [...ctx.calls].reverse().find((c) => c[0] === 'dlg')?.[1];
function spies(ctx) {
  const sfx = [], bursts = [];
  ctx.sfx = new Proxy({}, { get: (o, k) => () => { sfx.push(k); } });
  ctx.burst = (o) => bursts.push(o);
  return { sfx, bursts };
}
/** A mid-game state with room to act: lots of cash, and a manager to work on. */
function rich(days = 25, perks = PAIRS[0]) {
  const ctx = fakeCtx({ days, perks }), g = ctx.g();
  g.s.cash = 5e6;
  return { ctx, g, s: g.s, acts: crew.acts(ctx), ...spies(ctx) };
}

// ------------------------------------------------------------------ the HTML
for (const perks of PAIRS) for (const days of STAGES) {
  test(`crew: renders cleanly on day ${days} with ${perks.join(' + ')}`, async () => {
    const ctx = fakeCtx({ days, perks }), acts = crew.acts(ctx), s = ctx.g().s;
    assert.equal(crew.visible(ctx), !!s.mil.m1);
    const b = crew.badge(ctx); assert.ok(b === null || (Number.isInteger(b) && b > 0), 'the badge is a count or nothing');
    for (const tab of tabs) {
      ctx.U.crew = { tab, hire: null };
      const html = crew.html(ctx);
      assert.equal(typeof html, 'string');
      assert.deepEqual(checkHTML(html, `crew ${tab}`), []);
      assert.ok(!STALE.test(html), 'no v1 terms');
      assert.ok(!/\bzones?\b/i.test(visible(html)), 'the game says district, never zone');
      wired(html, acts, `crew ${tab} day ${days}`);
      if (tab === 'crew') {
        for (const p of s.pipes) assert.ok(html.includes(`data-bar="pipe:${p.id}"`), `a live bar for ${p.id}`);
        assert.equal((html.match(/data-pipe="/g) || []).length, s.pipes.length, 'one card per manager');
        if (s.pipes.length) assert.match(html, /\d+ of \d+ recent pitches use this niche/, 'saturation in words');
        if (s.mil.m1) assert.match(html, /Hire a manager/);
      }
      if (tab === 'upgrades') for (const u of Object.values(UPGRADES)) assert.ok(html.includes(u.name));
      if (tab === 'clients') for (const c of Object.values(CLIENTS)) assert.ok(html.includes(c.name) && /LTV/.test(html) && /SLA/.test(html));
    }
    await tick(5);
  });
}

test('crew: every manager card shows lane, status, level, per cycle and per day, and the creativity chip', () => {
  const { ctx, s } = rich(60), html = crew.html(ctx);
  assert.ok(s.pipes.length > 5);
  for (const p of s.pipes.slice(0, 5)) {
    const card = html.slice(html.indexOf(`data-pipe="${p.id}"`)).split('</article>')[0];
    assert.ok(card.includes(PIPE[p.kind].name) && card.includes(`Lv ${p.level} of 8`));
    assert.match(card, /(Running|Idle|Paused|Waiting for cash|On compliance duty|Needs a lane)/);
    assert.match(card, /Per cycle/); assert.match(card, /Per day/);
    assert.match(card, /(Linear herd trap|Crowded|Balanced|Pioneer vector) \d\.\d\dx/);
    assert.match(card, / to /, 'a lane line');
  }
});

test('crew: things that cannot be done say why, in the page', () => {
  const { ctx, g, s } = rich(25);
  s.cash = 1; const html = crew.html(ctx);
  assert.match(html, /Upgrade:<\/b> Short by/);
  assert.match(html, /Release:<\/b> opens when this cycle ends/);
  // an audit that has not been answered locks hiring and upgrading
  s.mil.m2 = true; s.auditFirst = false; s.auditPending = null;
  assert.ok(g.autoLocked());
  const locked = crew.html(ctx);
  assert.match(locked, /Expansion is locked/); assert.match(locked, /answer your audit/);
  assert.match(locked, /aria-disabled="true"[^>]*>Hire a manager|Hire a manager<\/button>\s*<p class="cr-why/);
  // a level-8 manager says so instead of offering more
  s.pipes[0].level = 8; assert.match(crew.html(ctx), /Top level/);
});

test('crew: a manager in a crowded niche is pointed at a quieter lane', () => {
  const { ctx, g, s } = rich(25);
  const p = s.pipes[0], herd = g.radar(p.zone, 40).sort((a, b) => a.cm - b.cm)[0];
  Object.assign(p, { cls: herd.cls, buyer: herd.seg });
  const html = crew.html(ctx), card = html.slice(html.indexOf(`data-pipe="${p.id}"`)).split('</article>')[0];
  if (herd.band.id === 'herd' || herd.band.id === 'crowded') assert.match(card, /A quieter lane/);
  assert.match(card, new RegExp(herd.band.label));
});

// ------------------------------------------------------------------ hiring
test('crew: the hire dialog opens on the best lane and a manager can be hired', () => {
  const { ctx, g, s, acts, sfx } = rich(25);
  const before = s.pipes.length, cash = s.cash;
  // the economy is retuned from time to time: hire in the highest open district that still has a free plot, whatever the bot did
  const zone = [...s.zones].filter((z) => ZONES[z].auto && s.pipes.filter((p) => p.zone === z).length < ZONES[z].plots).sort((a, b) => b - a)[0];
  assert.ok(zone, 'some open district has a free plot');
  acts['crew-hire'](el({ d: String(zone) }));
  const html = lastDlg(ctx); assert.ok(html, 'a dialog opened');
  assert.deepEqual(checkHTML(html, 'hire dialog'), []); assert.ok(!STALE.test(html)); assert.ok(!/\bzones?\b/i.test(visible(html)));
  wired(html, acts, 'hire dialog');
  const best = g.radar(zone, 1)[0], H = ctx.U.crew.hire;
  assert.deepEqual([H.cls, H.buyer, H.zone], [best.cls, best.seg, zone], 'the best lane is pre-selected');
  assert.match(html, /Best pick/); assert.match(html, /Why this lane/); assert.match(html, /Net per day/);
  acts['crew-hgo']();
  assert.equal(s.pipes.length, before + 1);
  const p = s.pipes.at(-1); assert.deepEqual([p.zone, p.cls, p.buyer, p.kind], [zone, best.cls, best.seg, H.kind]);
  assert.ok(s.cash < cash, 'the hire cost was paid'); assert.ok(sfx.includes('level'));
  assert.ok(crew.html(ctx).includes('cr-focus'), 'the new manager is highlighted');
});

test('crew: the hire dialog anchors each manager card and the Hire button for the Academy\'s coach, and nothing else', () => {
  const ctx = fakeCtx({ days: 10 }), g = ctx.g(), s = g.s, acts = crew.acts(ctx);
  s.cash = 6000; g.advanceTo(s.hour + 2); assert.ok(s.mil.m1 && s.zones.includes(5), 'Metro Hub is open'); s.cash = 1e6;
  acts['crew-hire'](el({ d: '5' }));
  const html = lastDlg(ctx), found = [...html.matchAll(/data-anchor="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(found, [...Object.keys(PIPE).map((k) => 'hire-' + k), 'hire-go'], 'a card for each manager, in the order they are offered, then the button');
  for (const k of Object.keys(PIPE)) assert.match(html, new RegExp(`data-act="crew-hkind" data-k="${k}"[^>]*data-anchor="hire-${k}"`));
  assert.match(html, /data-act="crew-hgo"[^>]*data-anchor="hire-go"/);
  // a redraw of the dialog (a manager picked) keeps them: the coach finds the button again
  acts['crew-hkind'](el({ k: 'student' })); // no dialog element in this stub, so only the state moves
  assert.equal(ctx.U.crew.hire.kind, 'student');
});

test('crew: a first-ever hire bursts, a second one does not', () => {
  const ctx = fakeCtx({ days: 10 }), g = ctx.g(), s = g.s, acts = crew.acts(ctx), { bursts, sfx } = spies(ctx);
  s.cash = 6000; g.advanceTo(s.hour + 2);
  assert.ok(s.mil.m1 && s.zones.includes(5), 'Metro Hub is open');
  s.cash = 1e6;
  acts['crew-hire'](el({ d: '5' })); acts['crew-hgo']();
  assert.equal(s.pipes.length, 1); assert.equal(bursts.length, 1); assert.equal(bursts[0].power, 1.2); assert.ok(sfx.includes('level'));
  acts['crew-hire'](el({ d: '5' })); acts['crew-hgo']();
  assert.equal(s.pipes.length, 2); assert.equal(bursts.length, 1, 'no burst the second time');
});

test('crew: the dialog repaints for a manager, a lane, a channel, more lanes, and the capital slider', () => {
  const { ctx, g, acts } = rich(25), d = dlgStub(ctx);
  acts['crew-hire'](el({ d: '9' }));
  const H = ctx.U.crew.hire, cap = (k) => g.pipeCap({ kind: k, zone: 9, level: 1 });
  acts['crew-hkind'](el({ k: 'student' })); assert.equal(H.kind, 'student'); assert.equal(H.alloc, cap('student'), 'untouched capital follows the manager');
  assert.deepEqual(checkHTML(d.body.innerHTML, 'repaint'), []); assert.match(d.body.innerHTML, /aria-pressed="true" data-act="crew-hkind" data-k="student"/);
  const lanes = g.radar(9, 8), other = lanes[1];
  acts['crew-hlane'](el({ cls: other.cls, seg: other.seg })); assert.deepEqual([H.cls, H.buyer], [other.cls, other.seg]);
  acts['crew-hchan'](el({ c: 'intl' })); assert.equal(H.channel, 'intl');
  acts['crew-hamt'](el({}, '50')); assert.ok(Math.abs(H.alloc - cap('student') / 2) < 0.02); assert.match(d.prev.innerHTML, /Net per cycle/); assert.ok(d.out.textContent.startsWith('$'));
  acts['crew-hkind'](el({ k: 'logistics' })); assert.ok(H.alloc <= g.pipeCap({ kind: 'logistics', zone: 9, level: 1 }) + 1e-6);
  const total = g.radar(9, 60).length; acts['crew-hmore'](el());
  assert.equal(H.more, true); assert.ok((d.body.innerHTML.match(/data-act="crew-hlane"/g) || []).length >= Math.min(total, 6));
  acts['crew-hmax'](el()); assert.equal(H.alloc, g.pipeCap({ kind: 'logistics', zone: 9, level: 1 }));
});

test('crew: a hire you cannot afford says so and does nothing', () => {
  const { ctx, s, acts } = rich(25);
  s.cash = 5; acts['crew-hire'](el({ d: '9' }));
  assert.match(lastDlg(ctx), /You need \$[\d,.]+ more to hire this manager/);
  const n = s.pipes.length; acts['crew-hgo']();
  assert.equal(s.pipes.length, n); assert.equal(ctx.toasts.at(-1)[1], 'bad');
});

test('crew: a full district and a locked audit refuse a hire with a reason', () => {
  const { ctx, g, s, acts } = rich(25);
  const z = [...new Set(s.pipes.map((p) => p.zone))][0];
  while (s.pipes.filter((p) => p.zone === z).length < ZONES[z].plots) assert.ok(g.hirePipeline('broker', z, { cls: g.radar(z, 1)[0].cls, buyer: g.radar(z, 1)[0].seg }).ok);
  const dlgs = ctx.calls.filter((c) => c[0] === 'dlg').length;
  acts['crew-hire'](el({ d: String(z) }));
  assert.equal(ctx.calls.filter((c) => c[0] === 'dlg').length, dlgs, 'no dialog'); assert.match(ctx.toasts.at(-1)[0], /plots/);
  s.mil.m2 = true; s.auditFirst = false;
  acts['crew-hire'](el({ d: '9' })); assert.match(ctx.toasts.at(-1)[0], /audit/);
});

test('crew: the world can ask for a hire dialog (U.hireAt) and a highlighted card (U.focusPipe), once', async () => {
  const { ctx, s } = rich(25); crew.acts(ctx);
  const p = s.pipes[0]; ctx.U.hireAt = 9; ctx.U.focusPipe = p.id; ctx.U.crew = { tab: 'clients' };
  const html = crew.html(ctx);
  assert.equal(ctx.U.hireAt, null); assert.equal(ctx.U.focusPipe, null); assert.equal(ctx.U.crew.tab, 'crew', 'the managers tab comes forward');
  assert.ok(html.includes('data-pipe') && new RegExp(`cr-card cr-focus" data-pipe="${p.id}"`).test(html), 'the manager is highlighted');
  await tick();
  assert.ok(lastDlg(ctx)?.includes('Hire a manager in'), 'the hire dialog opened for that district'); assert.equal(ctx.U.crew.hire.zone, 9);
  const n = ctx.calls.filter((c) => c[0] === 'dlg').length; crew.html(ctx); await tick();
  assert.equal(ctx.calls.filter((c) => c[0] === 'dlg').length, n, 'read once, not on every redraw');
});

// ------------------------------------------------------------------ managers
test('crew: upgrade a manager, fund its new capacity, pause and resume it', () => {
  const { ctx, g, s, acts, sfx } = rich(25);
  const p = s.pipes[0], lv = p.level, cash = s.cash, cost = g.pipeUpCost(p), cap = g.pipeCap(p);
  acts['crew-up'](el({ id: p.id }));
  assert.equal(p.level, lv + 1); assert.ok(Math.abs(cash - s.cash - cost) < 1e-6); assert.ok(sfx.includes('level')); assert.match(ctx.toasts.at(-1)[0], /Capacity is now/);
  assert.ok(g.pipeCap(p) > cap);
  assert.match(crew.html(ctx), new RegExp(`data-act="crew-fill" data-id="${p.id}"`), 'the new room is offered');
  acts['crew-fill'](el({ id: p.id })); assert.equal(p.alloc, g.pipeCap(p));
  acts['crew-pause'](el({ id: p.id })); assert.equal(p.status, 'paused'); assert.match(crew.html(ctx), /Resume/);
  acts['crew-pause'](el({ id: p.id })); assert.notEqual(p.status, 'paused');
});

test('crew: an upgrade you cannot afford fails with the engine message and changes nothing', () => {
  const { ctx, s, acts, sfx } = rich(25);
  const p = s.pipes[0], lv = p.level; s.cash = 3;
  acts['crew-up'](el({ id: p.id })); assert.equal(p.level, lv); assert.equal(ctx.toasts.at(-1)[1], 'bad'); assert.ok(!sfx.includes('level'));
});

test('crew: releasing asks first, refuses a running cycle, and gives back 60%', () => {
  const { ctx, g, s, acts } = rich(25);
  const run = s.pipes.find((p) => p.inflight), n = s.pipes.length;
  assert.ok(run); const calls = ctx.calls.length;
  acts['crew-rel'](el({ id: run.id })); assert.equal(ctx.calls.length, calls, 'no confirmation for a running cycle'); assert.match(ctx.toasts.at(-1)[0], /cycle/);
  run.inflight = 0; const cash = s.cash, basis = run.basis;
  acts['crew-rel'](el({ id: run.id }));
  assert.equal(ctx.calls.at(-1)[0], 'confirm'); assert.equal(s.pipes.length, n, 'nothing happens until the player says yes');
  ctx._confirm();
  assert.equal(s.pipes.length, n - 1); assert.ok(Math.abs(s.cash - cash - basis * 0.6) < 1e-6);
  assert.ok(g.s.pipes.every((p) => p.id !== run.id));
});

test('crew: edit a lane and its capital', () => {
  const { ctx, g, s, acts } = rich(25), d = dlgStub(ctx);
  const p = s.pipes.find((x) => x.inflight) || s.pipes[0];
  acts['crew-edit'](el({ id: p.id })); const html = lastDlg(ctx);
  assert.deepEqual(checkHTML(html, 'edit dialog'), []); assert.match(html, /Edit lane/); assert.match(html, /Save changes/); assert.ok(!/data-act="crew-hkind"/.test(html), 'the manager type is fixed once hired');
  if (p.inflight) assert.match(html, /locked until the running cycle finishes/);
  // while a cycle runs the lane cannot change, the capital can
  const keep = [p.cls, p.buyer], other = g.radar(p.zone, 8).find((r) => r.cls !== p.cls || r.seg !== p.buyer);
  acts['crew-hlane'](el({ cls: other.cls, seg: other.seg })); if (p.inflight) assert.deepEqual([ctx.U.crew.hire.cls, ctx.U.crew.hire.buyer], keep);
  acts['crew-hamt'](el({}, '50')); acts['crew-hgo']();
  assert.ok(Math.abs(p.alloc - g.pipeCap(p) / 2) < 0.02); assert.deepEqual([p.cls, p.buyer], keep);
  // between cycles the lane moves
  p.inflight = 0; p.prog = 0;
  acts['crew-edit'](el({ id: p.id })); acts['crew-hlane'](el({ cls: other.cls, seg: other.seg })); acts['crew-hgo']();
  assert.deepEqual([p.cls, p.buyer], [other.cls, other.seg]); assert.ok(d.body.innerHTML.length > 0);
});

// ------------------------------------------------------------------ upgrades and clients
test('crew: business upgrades install once, and wait for their district', () => {
  const { ctx, s, acts, sfx } = rich(25);
  s.upg = {}; acts['crew-upg'](el({ id: 'freight' })); assert.ok(s.upg.freight); assert.ok(sfx.includes('level'));
  ctx.U.crew = { tab: 'upgrades' }; assert.match(crew.html(ctx), /Installed/);
  const before = s.cash; acts['crew-upg'](el({ id: 'freight' })); assert.equal(s.cash, before, 'no second charge');
  const fresh = fakeCtx({ days: 10 }), html = (fresh.U.crew = { tab: 'upgrades' }, crew.html(fresh));
  assert.match(html, /Unlocks when Metro Hub opens/);
});

test('crew: clients show CAC against lifetime value and the SLA, and can be signed', () => {
  const { ctx, g, s, acts, sfx } = rich(25);
  s.clients = []; ctx.U.crew = { tab: 'clients' };
  const html = crew.html(ctx), q = g.clientQuote('smb');
  assert.ok(html.includes(ctx.money(q.cac)) && html.includes(ctx.money(q.ltv)), 'both numbers are on the card');
  assert.match(html, /You pay to win them \(CAC\)/); assert.match(html, /They pay you over 30 days \(LTV\)/);
  assert.match(html, /Needs 2 managers running every day/, 'the SLA in words');
  acts['crew-client'](el({ t: 'smb' })); assert.equal(s.clients.length, 1); assert.ok(sfx.includes('blip'));
  assert.ok(crew.html(ctx).includes('data-bar="client:'), 'an account gets a live bar');
  // an SLA it cannot meet is explained, not hidden
  s.pipes = s.pipes.slice(0, 1);
  assert.match(crew.html(ctx), /Hire 1 more manager first: this client needs 2 running every day/);
  const n = s.clients.length; acts['crew-client'](el({ t: 'corp' })); assert.equal(s.clients.length, n); assert.equal(ctx.toasts.at(-1)[1], 'bad');
});

test('crew: tabs switch, and the choice survives a redraw', () => {
  const { ctx, acts } = rich(25);
  acts['crew-tab'](el({ t: 'clients' })); assert.equal(ctx.U.crew.tab, 'clients'); assert.equal(ctx.calls.at(-1), 'render');
  assert.match(crew.html(ctx), /aria-pressed="true" data-act="crew-tab" data-t="clients"/);
});

test('crew: nothing in the file says zone, and every v1 name is gone', async () => {
  const fs = await import('node:fs');
  for (const f of ['../js/ui/drawers/crew.js', '../css/ui-crew.css']) {
    const src = fs.readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!STALE.test(src), f);
    assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(src.replace(/&#\d+;/g, '')), `${f} uses tokens, no literal colours`);
  }
});
