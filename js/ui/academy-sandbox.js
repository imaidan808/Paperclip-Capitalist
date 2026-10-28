// The Academy's pure parts (docs/V2_DESIGN.md sections 9 and 12): the scripted sandbox a lesson is played in, the step resolver, the anchor
// resolver, the card placer, the teach-back scorer, reward bookkeeping and the few pieces of saved state. No DOM in here, so `node --test`
// can drive a whole lesson through the real engine. js/ui/academy.js is the browser half.
//
// A lesson never touches the player's save: it runs in its own Game inside a SandboxSession (a Session that never writes, never joins a
// room and never reads the saved run). Rewards reach the real run only through applyRewards()/claimPending(), once per lesson.
import { Game } from '../engine.js';
import { Session, Clock } from '../session.js';
import { ASSETS, BUYERS, ZONES, PERKS, MIL_ZONE, EVENTS, ALGO_EVENTS, SKILLS } from '../config.js';
import { matchEvent } from '../meta/match.js';
import { hash } from '../rng.js';

const num = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ownList = (x) => (Array.isArray(x) ? x : []);

// ------------------------------------------------------------------ anchors
/** Anchors that are real elements carrying data-anchor (HUD, dock, drawer and Deal Room provide them). */
export const DOM_ANCHORS = ['hud-cash', 'hud-networth', 'hud-day', 'hud-clock', 'player-card', 'tracker', 'ticker', 'dock-stock', 'dock-market', 'dock-crew', 'dock-bank', 'dock-travel',
  'dock-codex', 'dock-quests', 'world', 'drawer', 'deal-room', 'deal-stage-read', 'deal-stage-pitch', 'deal-stage-close', 'deal-quick'];
export const WORLD_ANCHOR_TYPES = ['lead', 'lot', 'asset', 'plot', 'static'];

/** 'dock-market' -> { kind:'dom', name }; 'world:lead:L1' -> { kind:'world', type:'lead', id:'L1' }; anything else -> null. */
export function parseAnchor(a) {
  const s = String(a ?? '');
  if (s.startsWith('world:')) {
    const [, type, ...rest] = s.split(':'), id = rest.join(':');
    return WORLD_ANCHOR_TYPES.includes(type) && id ? { kind: 'world', type, id } : null;
  }
  return /^[a-z][a-z0-9-]*$/.test(s) ? { kind: 'dom', name: s } : null;
}

/** Any rect-like object (DOMRect, { x, y, w, h }, { x, y, width, height }, { left, top, right, bottom }) -> { x, y, w, h } in pixels, or null when it has no area. */
export function normRect(r) {
  if (!r || typeof r !== 'object') return null;
  const x = num(r.x ?? r.left, NaN), y = num(r.y ?? r.top, NaN);
  const w = num(r.w ?? r.width, NaN), h = num(r.h ?? r.height, NaN);
  const W = Number.isFinite(w) ? w : num(r.right, NaN) - x, H = Number.isFinite(h) ? h : num(r.bottom, NaN) - y;
  if (![x, y, W, H].every(Number.isFinite) || W <= 0 || H <= 0) return null;
  return { x, y, w: W, h: H };
}
export const pointInRect = (px, py, r) => !!r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
export const rectsOverlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
/** How much of the view a rect covers, 0..1. A "world" rect covers nearly all of it: the spotlight is dropped for those. */
export const coverOf = (r, view) => (r && view.w > 0 && view.h > 0 ? clamp((r.w * r.h) / (view.w * view.h), 0, 1) : 0);

/**
 * Is a thing the World hit (or a row of the keyboard list under it: { kind, id, asset? }) the thing a `world:` anchor names? A lead, lot or static place by its id; a
 * crate by its id or by its class ("world:asset:van"); a plot by its number (the hit id is "district:index"; "world:plot:1" is taken for either the first plot or index 1).
 */
export function hitMatches(anchor, hit) {
  const a = typeof anchor === 'string' ? parseAnchor(anchor) : anchor;
  if (!a || a.kind !== 'world' || !hit || hit.kind !== a.type) return false;
  const id = String(hit.id);
  if (a.type === 'asset') return id === a.id || hit.asset?.cls === a.id;
  if (a.type === 'plot') { const n = +a.id; return id === a.id || id.endsWith(':' + a.id) || (Number.isInteger(n) && id.endsWith(':' + (n - 1))); } // "plot 1" is the first plot to a reader, index 1 to a program: either is the plot meant
  return id === a.id;
}

/**
 * Turns a step's anchor into a rect. `provider` is { dom(name) -> rect|null, world(type, id) -> rect|null } so this runs without a DOM.
 * A world anchor the world cannot place (no rectOf yet, or the thing has left) falls back to the whole world: the card still points somewhere true.
 * Returns { rect, via: 'dom'|'world'|'fallback', anchor } or null.
 */
export function resolveAnchor(anchor, provider = {}) {
  const a = parseAnchor(anchor);
  if (!a) return null;
  if (a.kind === 'dom') { const rect = normRect(provider.dom?.(a.name)); return rect ? { rect, via: 'dom', anchor: a } : null; }
  const w = normRect(provider.world?.(a.type, a.id));
  if (w) return { rect: w, via: 'world', anchor: a };
  const f = normRect(provider.dom?.('world'));
  return f ? { rect: f, via: 'fallback', anchor: a } : null;
}

const overlapArea = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
/**
 * How much a card at p covers of what must stay clear, in square pixels (0 = nothing). The target counts six times over, and each rect in `avoid` by its own weight (`wt`,
 * 1 when it has none: the open drawer and the dock carry a middling one, a button in a dialog the plain one).
 */
export function coverScore(p, rect, avoid = []) {
  let s = rect ? overlapArea(p, rect) * 6 : 0;
  for (const r of avoid) if (r) s += overlapArea(p, r) * (Number.isFinite(r.wt) ? r.wt : 1);
  return s;
}

/**
 * What the coach card must not hide, as the `avoid` list placeCard takes: the open drawer and the dock (weight 3 each) and, when the card stands in a dialog (the Deal Room), every
 * button, field and link of that dialog (weight 1), the ones a step names included (the Close stage is a row of buttons, and a hint that says "press Fair" must not stand on it).
 * Each argument is a rect { x, y, w, h } or null (nothing open); `controls` is a list of rects. A rect with no area is left out.
 */
export function keepClear({ drawer = null, dock = null, controls = [] } = {}) {
  const out = [], add = (r, wt) => { if (r && num(r.w, 0) > 0 && num(r.h, 0) > 0) out.push({ x: num(r.x, 0), y: num(r.y, 0), w: r.w, h: r.h, wt }); };
  add(drawer, 3); add(dock, 3);
  for (const r of ownList(controls)) add(r, 1);
  return out;
}

/**
 * Where the coach card goes: below the target, else above, else beside it, else floating above the dock; never over the target or over anything in `avoid`
 * (the open drawer, the dock, the controls of an open dialog: the Deal Room's buttons), always inside the view. rect may be null (centred above the dock). When no place
 * is clear of all of it (a phone, a dialog that is all controls) the card goes where it covers the least (`coverScore`: the target and the heavier rects first, ties to the
 * places named above), so the card is never put on a button when any place is free of one. Returns { x, y, side } for a card of size { w, h } in a view { w, h }.
 */
export function placeCard(rect, card, view, gap = 14, margin = 8, avoid = []) {
  const cw = Math.min(card.w, view.w - 2 * margin), ch = Math.min(card.h, view.h - 2 * margin);
  const cx = (x) => clamp(x, margin, Math.max(margin, view.w - cw - margin)), cy = (y) => clamp(y, margin, Math.max(margin, view.h - ch - margin));
  const free = (p) => (!rect || !rectsOverlap(p, rect)) && !avoid.some((r) => r && rectsOverlap(p, r));
  const floats = [[(view.w - cw) / 2, view.h - ch - 90], [margin, view.h - ch - 90], [(view.w - cw) / 2, 80]].map(([x, y]) => ({ x: cx(x), y: cy(y), w: cw, h: ch }));
  const floatSide = rect ? 'float' : 'center';
  // the last resort: every place worth naming, then a grid over the view, scored; the first of the lowest scores wins, and the grid is walked from the dock's end up
  const leastCovered = (tries) => {
    const cands = tries.map((t) => ({ ...t, side: rect && rectsOverlap({ x: t.x, y: t.y, w: cw, h: ch }, rect) ? floatSide : t.side })).concat(floats.map((p) => ({ x: p.x, y: p.y, side: floatSide }))); // a caret points at the target only from a place that is beside it
    const NX = 8, NY = 10, spanX = Math.max(0, view.w - cw - 2 * margin), spanY = Math.max(0, view.h - ch - 2 * margin);
    for (let j = NY; j >= 0; j--) for (let i = 0; i <= NX; i++) cands.push({ x: cx(margin + (spanX * i) / NX), y: cy(margin + (spanY * j) / NY), side: floatSide });
    let best = null;
    for (const c of cands) {
      const sc = coverScore({ x: c.x, y: c.y, w: cw, h: ch }, rect, avoid);
      if (!best || sc < best.sc - 1e-6) best = { c, sc };
      if (sc === 0) break; // nothing covered: no later place can beat it
    }
    return { x: best.c.x, y: best.c.y, side: best.c.side };
  };
  const float = () => { const p = floats.find(free); return p ? { x: p.x, y: p.y, side: floatSide } : null; };
  if (!rect) return float() || leastCovered([]);
  const mid = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  const tries = [
    ['below', mid.x - cw / 2, rect.y + rect.h + gap], ['above', mid.x - cw / 2, rect.y - ch - gap],
    ['right', rect.x + rect.w + gap, mid.y - ch / 2], ['left', rect.x - cw - gap, mid.y - ch / 2],
  ].map(([side, x, y]) => ({ side, x: cx(x), y: cy(y) }));
  for (const t of tries) if (free({ x: t.x, y: t.y, w: cw, h: ch })) return t;
  return float() || leastCovered(tries);
}

// ------------------------------------------------------------------ the step resolver
export const HINT_AFTER_MS = 20000;
/** Has a step been stuck long enough for its hint? (startedAt and now in ms.) */
export const hintDue = (startedAt, now, after = HINT_AFTER_MS) => num(now, 0) - num(startedAt, 0) >= after;

/** Does one event satisfy a step's `wait`? Events are game events ({ type, day, ...payload }), UI events ({ type:'ui', ui, id }) and clicks ({ type:'click', anchor }). */
export function waitMatches(wait, evt) {
  if (!wait || !evt) return false;
  if (wait.type === 'event') return evt.type === wait.event && matchEvent(wait.match, evt);
  if (wait.type === 'ui') return evt.type === 'ui' && evt.ui === wait.ui && (wait.id == null || evt.id === wait.id);
  if (wait.type === 'click') return evt.type === 'click' && evt.anchor === wait.anchor;
  return false;
}
export const winMatches = (win, evt) => !!win && !!evt && evt.type === win.event && matchEvent(win.match, evt);

export const startRun = (mission) => ({ i: 0, n: ownList(mission?.steps).length, won: false });
/**
 * Feeds one event to a lesson. One event advances at most one step; the win event counts only once every step is done, and the event that
 * finishes the last step may itself be the win. Returns { run, advanced, won } and never mutates `run`.
 */
export function feedRun(mission, run, evt) {
  if (run.won) return { run, advanced: false, won: false };
  const step = ownList(mission.steps)[run.i];
  let i = run.i, advanced = false;
  if (step && waitMatches(step.wait, evt)) { i++; advanced = true; }
  const won = i >= run.n && winMatches(mission.win, evt);
  return { run: { ...run, i, won }, advanced, won };
}
/** The synthetic event that would satisfy a step already true when it begins (an 'open this drawer' step whose drawer is open), else null. */
export function satisfiedNow(step, snap = {}) {
  const w = step?.wait;
  if (w?.type === 'ui' && w.ui === 'open-drawer' && snap.drawer && snap.drawer === w.id) return { type: 'ui', ui: 'open-drawer', id: w.id };
  return null;
}
/** What the coach shows for the run as it stands. After the last step it asks for the win. */
export function coachFor(mission, run) {
  const steps = ownList(mission.steps), n = steps.length;
  if (run.i < n) {
    const s = steps[run.i];
    return { index: run.i, total: n, id: s.id, say: String(s.say ?? ''), hint: String(s.hint || 'Try the highlighted control.'), anchor: s.anchor, wait: s.wait, finishing: false };
  }
  const last = steps[n - 1], fin = mission.finish; // a lesson whose last step is only "open this" and whose win is a separate act names that act (its first sentence is what the goal card shows)
  return { index: n, total: n, id: 'finish', say: String(fin?.say || 'Almost there. Finish the goal on the card at the top left and the lesson is yours.'), hint: String(fin?.hint || last?.hint || 'Look at the goal card.'), anchor: 'tracker', wait: null, finishing: true };
}
/** First sentence of a coach line, for the HUD goal card. */
export function shortSay(text, max = 96) {
  const s = String(text ?? '').trim(), cut = s.search(/[.!?](\s|$)/);
  const one = cut >= 0 ? s.slice(0, cut + 1) : s;
  return one.length > max ? one.slice(0, max - 1).trimEnd() + '…' : one;
}

// ------------------------------------------------------------------ teach-back
export const newTeach = () => ({ picks: [], solved: false, revealed: false });
/** Scores one pick: { choice, correct, right, why, rightWhy } or null for a pick that is not an option. */
export function scoreTeachBack(tb, choice) {
  const opts = ownList(tb?.options);
  if (!Number.isInteger(choice) || choice < 0 || choice >= opts.length) return null;
  const right = opts.findIndex((o) => o.correct);
  return { choice, correct: !!opts[choice].correct, right, why: String(opts[choice].why ?? ''), rightWhy: String(opts[right]?.why ?? '') };
}
/** Records a pick (wrong ones are allowed and kept). Returns { state, result }. */
export function pickTeach(tb, state, choice) {
  const result = scoreTeachBack(tb, choice);
  if (!result || state.solved || state.picks.includes(choice)) return { state, result: null };
  return { state: { ...state, picks: [...state.picks, choice], solved: result.correct }, result };
}
export const revealTeach = (state) => ({ ...state, revealed: true });
export const teachDone = (state) => state.solved || state.revealed;
export const teachFirstTry = (state) => state.solved && state.picks.length === 1;

// ------------------------------------------------------------------ rewards and saved state (store = anything with get/set: the session's kv)
export const KEYS = { done: 'academy', skipped: 'academySkipped', all: 'academyDone', rewards: 'academyRewards', teach: 'academyTeach' };

export function readAcademy(store) {
  const list = (k) => { const v = store.get(k); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; };
  return { done: list(KEYS.done), skipped: list(KEYS.skipped), finished: !!store.get(KEYS.all) };
}
/** Marks a lesson done (or skipped). 'academyDone' turns true once every lesson is done or skipped, so the Academy stops offering itself. */
export function markMission(store, missions, id, { skipped = false } = {}) {
  const st = readAcademy(store);
  if (skipped) { if (!st.done.includes(id) && !st.skipped.includes(id)) st.skipped.push(id); } else { if (!st.done.includes(id)) st.done.push(id); st.skipped = st.skipped.filter((x) => x !== id); }
  store.set(KEYS.done, st.done); store.set(KEYS.skipped, st.skipped);
  const all = ownList(missions).length > 0 && missions.every((m) => st.done.includes(m.id) || st.skipped.includes(m.id));
  if (all) store.set(KEYS.all, true);
  return { ...st, finished: all || st.finished };
}
/** Index of the first lesson neither done nor skipped, or -1 when the Academy is finished. */
export function nextIndex(missions, st) { return ownList(missions).findIndex((m) => !st.done.includes(m.id) && !st.skipped.includes(m.id)); }

/**
 * What finishing a lesson earns. A lesson already done pays nothing (replays are for learning); a skipped one unlocks its Codex pages but pays
 * no XP or skill point (those are for playing it). `show` is always the Codex ids the lesson teaches, for the reward card.
 */
export function rewardPlan(mission, { done = false, skipped = false } = {}) {
  const r = mission?.reward || {}, codex = ownList(r.codex).filter((x) => typeof x === 'string');
  if (done) return { grant: false, xp: 0, points: 0, codex: [], show: codex, reason: 'replay' };
  if (skipped) return { grant: true, xp: 0, points: 0, codex, show: codex, reason: 'skipped' };
  return { grant: true, xp: Math.max(0, Math.round(num(r.xp, 0))), points: r.points ? 1 : 0, codex, show: codex, reason: 'played' };
}
/** Pays a plan into a real Game: XP (through its own multiplier), the skill point, the Codex pages, and a record on meta.mission. makeProgress(game) -> a Progress. */
export function applyRewards(game, plan, info, makeProgress) {
  const s = game.s, xp0 = s.xp;
  if (plan.xp) game.xp(plan.xp);
  const granted = plan.points ? game.grantPoints(plan.points) : { points: 0, xp: 0 }; // the engine banks a point only if a skill can still take it, and pays the rest as XP
  const prog = makeProgress(game), fresh = [];
  for (const id of plan.codex) if (prog.unlockCodex(id, game.day)) fresh.push(id);
  const m = prog.m;
  m.mission ||= {};
  m.mission[info.id] = { day: game.day, tries: info.tries ?? 1, skipped: !!info.skipped };
  return { xp: s.xp - xp0, points: granted.points, newCodex: fresh, knownCodex: plan.codex.filter((id) => !fresh.includes(id)) };
}
/** Lessons played before a real run exists keep their rewards here until the run starts (main.js hands them over with claimPending). */
export function readPending(store) {
  const v = store.get(KEYS.rewards) || {};
  return { xp: Math.max(0, num(v.xp, 0)), points: Math.max(0, num(v.points, 0)), codex: ownList(v.codex).filter((x) => typeof x === 'string'), missions: ownList(v.missions).filter((x) => x && typeof x.id === 'string') };
}
export function addPending(store, plan, info) {
  const p = readPending(store);
  p.xp += plan.xp; p.points += plan.points;
  for (const id of plan.codex) if (!p.codex.includes(id)) p.codex.push(id);
  p.missions = p.missions.filter((m) => m.id !== info.id).concat([{ id: info.id, tries: info.tries ?? 1, skipped: !!info.skipped }]);
  store.set(KEYS.rewards, p);
  return p;
}
/** Hands everything pending to a real Game and empties the store. Returns what was paid, or null when nothing was waiting. */
export function claimPending(store, game, makeProgress) {
  const p = readPending(store);
  if (!p.xp && !p.points && !p.codex.length && !p.missions.length) return null;
  const out = applyRewards(game, { xp: p.xp, points: p.points, codex: p.codex }, { id: '_pending', tries: 1 }, makeProgress);
  const prog = makeProgress(game);
  delete prog.m.mission._pending;
  for (const m of p.missions) prog.m.mission[m.id] = { day: game.day, tries: m.tries, skipped: !!m.skipped };
  store.set(KEYS.rewards, null);
  return out;
}
/** The Codex a lesson's sandbox should show: what the real run has unlocked, plus what finished lessons are still holding. */
export function codexSeed(realCx = {}, pending = { codex: [] }) {
  const cx = { ...(realCx || {}) };
  for (const id of ownList(pending.codex)) cx[id] ??= 1;
  return cx;
}

// ------------------------------------------------------------------ the sandbox
const LONG = 24 * 365;
const DEFECT_LABELS = ['worn finish', 'loose fittings', 'faded markings', 'missing parts', 'failing seal', 'hairline cracks'];
export const emptyMeta = () => ({ q: {}, a: {}, d: { day: 0, list: [] }, cx: {}, mission: {} });
/** The hidden truth of a scripted lot, in the engine's shape ({ q, fake, defects }) from the schema's ({ quality, fake }). */
export function lotTruthFrom(truth = {}) {
  const q = Math.round(clamp(num(truth.quality ?? truth.q, 1), 0.3, 1.3) * 100) / 100, fake = !!truth.fake;
  const n = Math.max(0, Math.round((1 - q) * 8 + (fake ? 1 : 0)));
  return { q, fake, defects: DEFECT_LABELS.filter((_, i) => i < n).map((label, i) => ({ id: 'd' + i, label })) };
}
/** A lesson is scripted: no random buyers or lots, no algorithmic shocks. Everything the lesson needs is in its setup. */
export function sandboxify(game) {
  game._spawnLead = () => {}; game._spawnLot = () => {}; game._algoEvent = () => {};
  game.xp = () => {}; // practice pays nothing here: a lesson's experience, level and skill point are paid once, by its reward card, into the real run (the bar and the result card used to show XP, levels and a point that were never kept)
  game.env.algo = false;
  game.sandbox ||= { warnings: [] };
  return game;
}
/** A copy of a sandbox Game with the same scripted rules (for a bot or a test that wants to try an action first). */
export function cloneSandbox(game) {
  const c = new Game({ state: JSON.parse(JSON.stringify(game.s)), worldSeed: game.env.worldSeed });
  c.env.cohort = game.env.cohort; c.env.difficulty = { ...game.env.difficulty };
  c.sandbox = { warnings: [] };
  return sandboxify(c);
}
const homeOf = (setup, zone) => (ZONES[zone] ? zone : Math.max(1, ...ownList(setup.zones).filter((z) => ZONES[z])));

/**
 * Builds the Game a lesson is played in, from a mission's `setup`: assets, leads, lots (with their hidden truth), cash, skills, perks, open districts and
 * scripted events. `zone` is the mission's district (where the assets, leads and lots live). Unknown classes, buyers or events are skipped and listed in
 * game.sandbox.warnings, never thrown on, so a typo in a lesson cannot break the screen.
 */
export function buildSandboxGame(setup = {}, { zone, id = 'lesson', handle = 'You', meta, worldSeed } = {}) {
  const home = homeOf(setup, zone), warn = [];
  const listed = ownList(setup.zones).filter((z) => ZONES[z]);
  const zones = [...new Set(listed.length ? [...listed, home] : Array.from({ length: home }, (_, i) => i + 1))].sort((a, b) => a - b);
  const perks = ownList(setup.perks).filter((p) => PERKS[p]).slice(0, 2);
  const g = new Game({ perks, specialty: null, handle, pid: 'ACADEMY', seed: hash('academy:' + id), startHour: 0, worldSeed: worldSeed || 'academy-' + id });
  sandboxify(g);
  g.sandbox = { id, zone: home, warnings: warn };
  const s = g.s;
  s.specialty = null;
  s.skills = { ops: 1, growth: 1, fintech: 1 };
  for (const k of Object.keys(SKILLS)) if (setup.skills && Number.isFinite(setup.skills[k])) s.skills[k] = clamp(Math.round(setup.skills[k]), 1, 8);
  s.cash = Math.max(0, num(setup.cash, 0));
  s.events = []; s.news = []; g.evq = [];
  // districts
  s.zones = []; s.leads = {}; s.lots = {}; s.pool = {};
  for (const z of zones) g._openZone(z);
  for (const [k, z] of Object.entries(MIL_ZONE)) s.mil[k] = s.zones.includes(z);
  s.nid = 100; // ids the engine makes later never collide with the ones the lesson names
  // assets
  s.assets = [];
  for (const a of ownList(setup.assets)) {
    if (!ASSETS[a?.cls]) { warn.push('asset class ' + a?.cls); continue; }
    const asset = g._mk(s, a.cls, { cond: a.cond === 'broken' ? 'broken' : 'ok', quality: num(a.quality, 1), zone: ZONES[a.zone] ? a.zone : home });
    if (a.truth) { asset.truth = lotTruthFrom(a.truth); asset.known = !!a.known; }
    asset.basis = Math.round(num(a.basis, g.val(asset)) * 100) / 100;
    s.assets.push(asset);
  }
  s.peak = Math.max(s.peak, g.netWorth());
  s.startCapital = Math.max(0.05, s.peak);
  // buyers
  let n = 0;
  for (const l of ownList(setup.leads)) {
    if (!BUYERS[l?.seg]) { warn.push('buyer ' + l?.seg); continue; }
    const z = ZONES[l.zone] && s.leads[l.zone] ? l.zone : home;
    const born = 0, exp = num(l.expiresIn, LONG);
    s.leads[z].push({ id: String(l.id ?? 'LL' + ++n), zone: z, seg: l.seg, budget: Math.max(0.01, num(l.budget, BUYERS[l.seg].budget[0])), need: l.need || null, born, exp: born + exp, ...(l.scam ? { scam: true } : {}) });
  }
  // lots
  for (const l of ownList(setup.lots)) {
    if (!ASSETS[l?.cls]) { warn.push('lot class ' + l?.cls); continue; }
    const z = ZONES[l.zone] && s.lots[l.zone] ? l.zone : home, truth = lotTruthFrom(l.truth || {});
    s.lots[z].push({ id: String(l.id ?? 'LT' + ++n), zone: z, cls: l.cls, cond: l.cond === 'broken' ? 'broken' : 'ok', price: Math.max(0.01, num(l.price, ASSETS[l.cls].base)), exp: num(l.expiresIn, LONG), mode: l.mode === 'auction' || l.auction === true ? 'auction' : 'fixed', truth, ...(g.P.fakeDetect && truth.fake ? { warn: true } : {}) });
  }
  // scripted events (a shock at an hour of the lesson)
  for (const ev of ownList(setup.events)) {
    const at = Math.max(0, Math.round(num(ev?.atHour, 6)));
    if (!(EVENTS[ev?.kind] || ALGO_EVENTS[ev?.kind]) || !g.injectEvent(ev.kind, at, { id: `lesson-${ev.kind}-${at}`, cls: ev.cls })) warn.push('event ' + ev?.kind);
  }
  s.meta = meta ? JSON.parse(JSON.stringify(meta)) : emptyMeta();
  g._m = null;
  g.ckpt.clear(); g._checkpoint();
  return g;
}

/** A Session that plays a lesson: it never saves, never restores, never joins a room. The real run's save is untouched. */
export class SandboxSession extends Session {
  save() { /* a lesson is not saved */ }
  restore() { return false; }
  reset() { /* nothing to delete */ }
  _announce() { /* no room */ }
  _sendClock() { /* no room */ }
  _sendSnap() { /* no room */ }
}
export function makeSandboxSession(setup = {}, opts = {}) {
  const sess = new SandboxSession();
  sess.mode = 'solo';
  sess.handle = opts.handle || 'You';
  sess.worldSeed = opts.worldSeed || 'academy-' + (opts.id || 'lesson');
  sess.ghosts = clamp(Math.round(num(setup.cohort?.ghosts, 0)), 0, 400); // no herd unless the lesson brings one
  sess.algo = false;
  // A lesson is minutes long, a virtual hour is 7 seconds at 1x and a manager's cycle is a day and a half: so when the player presses the clock the
  // sandbox runs at 16x (4x for a clock that is already running), and the speed picker in the top bar still works.
  sess.clock = new Clock({ hour: 0, speed: clamp(num(setup.speed, setup.clock === 'running' ? 4 : 16), 0.25, 64), paused: setup.clock !== 'running' });
  sess.game = buildSandboxGame(setup, { ...opts, worldSeed: sess.worldSeed });
  sess._wire();
  sess.synth = [];
  return sess;
}

/** The dock ids a lesson needs: its `features`, plus any drawer or dock icon one of its steps points at (so a step can never be unreachable). */
export function featuresFor(mission) {
  const set = new Set(ownList(mission?.setup?.features));
  for (const s of ownList(mission?.steps)) {
    if (s.wait?.type === 'ui' && s.wait.ui === 'open-drawer' && s.wait.id) set.add(s.wait.id);
    for (const a of [s.anchor, s.wait?.anchor]) if (typeof a === 'string' && a.startsWith('dock-')) set.add(a.slice(5));
  }
  return [...set];
}
