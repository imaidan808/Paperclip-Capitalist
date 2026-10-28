// The engine (docs/AUDIO.md section 3 and 8.2): one AudioContext for the page, the buses and the master chain, the voice manager, rank-aware cooldowns, token buckets, ducking, the collector,
// the settings sync, the ambient bed and the repair dial tone. Nothing here touches the DOM, and the context comes from an injected factory, so a recording fake context tests all of it in
// Node. With Web Audio missing, or any failure, `state` is 'unsupported' and every method returns without throwing. With sound idle there is no timer and no frame callback.
import { voice, master, dB, hz, MAKEUP_FALLBACK, FAMILY_MS, keptPartials, moneySize } from './palette.js';
import { RECIPES, IDS, layersFor, tierOf, firstVariant, variantsOf, cooldownOf, variantRank, trimFor, isMoment, PREEMPT } from './recipes.js';
import { createAmbient, oneShotLayers } from './ambient.js';
import { TRIMS } from './trims.js';
import { createResolverState, resolveBurst, gateClock, holdRelease, stateGate, catchingUp, recentPress } from './resolve.js';

const PRI = { tiny: 1, medium: 2, loud: 3 };
export const LIMITS = { VOICES: 12, OSCILLATORS: 160, LEAD: 0.012, IDLE_MS: 60000, DUCK_REL: 600 };
const BUCKET_SPEC = { tiny: [8, 4], medium: [3, 3], loud: [1 / 1.2, 1], player: [6, 6] };
/** The pretend rewards of an Academy lesson are silent (4.1): its levels, XP and quests are a rehearsal saved nowhere. The money, the Deal Room and the acad.* sounds stay. */
export const SANDBOX_SILENT = new Set(['level.up', 'quest.complete', 'daily.done', 'achievement', 'reward.also', 'milestone', 'zone.open', 'skill.up', 'codex.unlock']);
const REFUSAL = new Set(['ui.refuse', 'world.locked']);
const SOFT_END = 0.012; // a stolen voice is faded in 12 ms, never cut

function makeBucket([rate, burst]) {
  let tokens = burst, last = null;
  const refill = (t) => (last == null ? tokens : Math.min(burst, tokens + (t - last) / 1000 * rate));
  return { can: (t) => refill(t) >= 1, take(t) { tokens = refill(t); last = t; if (tokens >= 1) { tokens -= 1; return true; } return false; }, tokens: () => tokens };
}
const oscCount = (layers) => layers.reduce((n, L) => n + (L.k === 'tone' ? (L.uni ? L.uni[0] : 1) + (L.vib ? 1 : 0) : L.k === 'bank' ? keptPartials(L).length : 1 + (L.am ? 2 : 0)), 0);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const DEFAULT_SETTINGS = { master: 70, mute: false, ui: true, game: true, ambient: false, ambientLevel: 70, dial: false, clockSounds: true, quiet: false };

/**
 * cfg: { get: () => settings.audio, now: () => ms, factory: () => AudioContext (null: Web Audio is missing), timers: { set, clear }, random, measure (false: do not measure the makeup) }
 */
export function createAudio(cfg = {}) {
  const get = cfg.get || (() => DEFAULT_SETTINGS);
  const nowMs = cfg.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const random = cfg.random || Math.random;
  const timers = cfg.timers || { set: (f, ms) => setTimeout(f, ms), clear: (h) => clearTimeout(h) };
  const G = typeof globalThis !== 'undefined' ? globalThis : {};
  const factory = cfg.factory !== undefined ? cfg.factory : (G.AudioContext || G.webkitAudioContext ? () => new (G.AudioContext || G.webkitAudioContext)({ latencyHint: 'interactive' }) : null);
  let supported = typeof factory === 'function';
  let meterNode = null;
  let ctx = null, chain = null, nodes = null, unlocked = false, hidden = false, idleSuspended = false, makeupSet = false, seedN = 0;
  const listeners = new Set(), rs = createResolverState();
  const env = { speed: 1, paused: false, busy: false, hold: false, lagMs: 0, justVisible: false, rewound: false, sandbox: false, lastPress: -Infinity, netWorth: 0, classroom: false };
  const stats = { dropped: {}, played: {}, sentences: 0, bursts: 0, maxSentences: 0 };
  const voices = [], cd = new Map(), famLast = {}, poolLast = new Map(), rotateLast = new Map(), ducks = {}, buckets = {};
  for (const [k, v] of Object.entries(BUCKET_SPEC)) buckets[k] = makeBucket(v);
  let queue = [], armed = null, idleT = null, momentUntil = 0, momentQueued = false, lastMedium = -Infinity, lastGame = -Infinity, lastMoment = -Infinity;
  let refuse = { n: 0, last: -Infinity }, jitState = { t: -Infinity, c: 0 }, recentHeads = [], broken = new Set(), lastBurst = null;

  const drop = (reason) => { stats.dropped[reason] = (stats.dropped[reason] || 0) + 1; return null; };
  const notify = (what) => { for (const fn of [...listeners]) { try { fn(what); } catch { /* a listener must not break the sound */ } } };
  const logOnce = (key, e) => { if (broken.has(key)) return; broken.add(key); try { console.warn('[audio]', key, e && e.message ? e.message : e); } catch { /* no console */ } };
  const settings = () => { const a = get() || DEFAULT_SETTINGS; return { master: clamp(Number.isFinite(+a.master) ? +a.master : 70, 0, 100), mute: a.mute === true, ui: a.ui !== false, game: a.game !== false, ambient: a.ambient === true, ambientLevel: clamp(Number.isFinite(+a.ambientLevel) ? +a.ambientLevel : 70, 0, 100), dial: a.dial === true, clockSounds: a.clockSounds !== false, quiet: a.quiet === true }; };
  /** What the settings amount to: the Classroom rule forces ambient, the dial tone and the clock sounds off (7.1). */
  const eff = () => { const s = settings(); return { ...s, ambient: s.ambient && !s.quiet, dial: s.dial && !s.quiet, clockSounds: s.clockSounds && !s.quiet }; };
  const playable = () => supported && !!ctx && unlocked && !hidden && ctx.state !== 'closed';
  const ctxNow = () => ctx.currentTime;

  // ---- the context, created on the first gesture
  function measureMakeup() { // the compressor node's own gain depends on its settings and on the browser: measure it once with a 100 ms offline render (3.7)
    if (cfg.measure === false) return;
    try {
      const OC = cfg.OfflineAudioContext || G.OfflineAudioContext || G.webkitOfflineAudioContext;
      if (!OC) return;
      const oc = new OC(1, 4800, 48000), o = oc.createOscillator(), g = oc.createGain(), c = oc.createDynamicsCompressor();
      o.frequency.value = 440; g.gain.value = 0.0316; for (const [k, v] of Object.entries({ threshold: -16, knee: 18, ratio: 3, attack: 0.005, release: 0.25 })) c[k].value = v;
      o.connect(g); g.connect(c); c.connect(oc.destination); o.start();
      const p = oc.startRendering();
      if (p && p.then) p.then((buf) => { try { const x = buf.getChannelData(0); let pk = 0; for (let i = 2400; i < x.length; i++) pk = Math.max(pk, Math.abs(x[i])); const m = pk / 0.0316; if (m > 1 && m < 4 && chain) { chain.makeup.gain.value = 1 / m; makeupSet = true; } } catch { /* keep the fallback */ } }).catch(() => {});
    } catch { /* keep the fallback */ }
  }
  function create() {
    ctx = factory();
    if (!ctx) throw new Error('no context');
    chain = master(ctx, { master: 1, makeup: 1 / (TRIMS.makeup || MAKEUP_FALLBACK) });
    const mk = () => { const g = ctx.createGain(); g.gain.value = 1; return g; };
    nodes = { ui: { tiny: mk(), medium: mk() }, game: { tiny: mk(), medium: mk() }, ambLevel: mk(), ambBase: mk(), ambDuck: mk() };
    for (const bus of ['ui', 'game']) for (const tier of ['tiny', 'medium']) nodes[bus][tier].connect(chain.buses[bus]);
    nodes.ambLevel.connect(nodes.ambBase); nodes.ambBase.connect(nodes.ambDuck); nodes.ambDuck.connect(chain.buses.amb);
    applyGains(true);
    measureMakeup();
  }
  function applyGains(instant) {
    if (!ctx || !chain) return;
    const s = eff(), t = ctxNow();
    const mg = s.mute ? 0 : (s.master / 100) ** 2, al = (s.ambientLevel / 100) ** 2;
    if (instant) { chain.master.gain.value = mg; nodes.ambLevel.gain.value = al; } else { chain.master.gain.setTargetAtTime(mg, t, 0.02); nodes.ambLevel.gain.setTargetAtTime(al, t, 0.03); }
  }
  function wake() { // after 60 s idle the context is suspended; the next play resumes it
    if (ctx && idleSuspended) { idleSuspended = false; try { const p = ctx.resume(); p && p.catch && p.catch(() => {}); } catch { /* resumes at the next gesture */ } }
    armIdle();
  }
  function armIdle() {
    if (idleT != null) timers.clear(idleT);
    idleT = timers.set(() => {
      idleT = null; purge();
      if (!voices.length && !amb.playing() && ctx && ctx.state === 'running') { try { const p = ctx.suspend(); p && p.catch && p.catch(() => {}); idleSuspended = true; notify('state'); } catch { /* ignore */ } }
    }, LIMITS.IDLE_MS);
  }

  // ---- ambient (6): the controller holds the latest state whatever the context is doing
  const amb = createAmbient({
    ctx: () => ctx, out: () => nodes.ambLevel, now: nowMs, random,
    setTimeout: (f, ms) => timers.set(f, ms), clearTimeout: (h) => timers.clear(h),
    enabled: () => eff().ambient && !eff().mute, running: () => playable(), dialogOpen: () => env.hold, lastMedium: () => lastMedium, lastMoment: () => lastMoment,
    duck: (db) => { if (!nodes) return; const t = ctxNow(); nodes.ambBase.gain.cancelScheduledValues(t); nodes.ambBase.gain.setTargetAtTime(dB(db), t, db < 0 ? 0.1 : 0.17); },
    shot: (id, layers, pan) => { if (!nodes || !playable()) return; voice(ctx, nodes.ambLevel, layers, ctxNow() + LIMITS.LEAD, { seed: ++seedN, trim: TRIMS.oneShots?.[id] ?? 0, pan, jitterCents: 7 }); },
  });

  // ---- gates shared by play and request
  function gate(e, id, opts) {
    const s = eff();
    if (s.mute) return 'mute';
    if (e.bus === 'ui' ? !s.ui : !s.game) return 'bus';
    if (s.quiet && e.bus === 'game' && tierOf(id, opts.variant ?? firstVariant(id)) === 'tiny') return 'quiet';
    if ((e.class === 'clock' || opts.clock) && !s.clockSounds) return 'bus';
    if (!playable()) return 'locked';
    return null;
  }
  function purge() {
    const t = nowMs();
    for (let i = voices.length - 1; i >= 0; i--) if (voices[i].endMs <= t) voices.splice(i, 1);
  }
  const liveOsc = () => voices.reduce((n, v) => n + v.osc, 0);
  function stopGroup(g, fadeSec) {
    if (!g || g.stopped) return;
    g.stopped = true;
    for (const v of g.voices) { try { v.stop(ctxNow(), fadeSec); } catch { /* gone */ } }
    g.endMs = Math.min(g.endMs, nowMs() + fadeSec * 1000 + 30);
  }
  function duck(bus, tier, depthDb, holdMs, atkMs = 40, relMs = LIMITS.DUCK_REL) { // the deepest active duck on a node wins; ducks are not summed
    const node = bus === 'amb' ? nodes.ambDuck : nodes[bus]?.[tier];
    if (!node) return;
    const key = bus + (tier || ''), t = nowMs(), d = ducks[key], ct = ctxNow();
    if (d && t < d.until && d.depth <= depthDb) { if (t + holdMs > d.until) { d.until = t + holdMs; node.gain.setTargetAtTime(1, ct + holdMs / 1000, relMs / 3000); } return; }
    node.gain.cancelScheduledValues(ct);
    node.gain.setTargetAtTime(dB(depthDb), ct, atkMs / 3000);
    node.gain.setTargetAtTime(1, ct + holdMs / 1000, relMs / 3000);
    ducks[key] = { depth: depthDb, until: t + holdMs };
  }
  function pickPool(e, key) {
    if (!e.pool) return 0;
    const last = poolLast.get(key);
    let k = Math.floor(random() * e.pool);
    if (e.pool > 1 && k === last) k = (k + 1 + Math.floor(random() * (e.pool - 1))) % e.pool; // never the same one twice in a row
    poolLast.set(key, k);
    return k;
  }
  function variantFor(e, id, opts) {
    if (opts.variant && e.variants[opts.variant]) return opts.variant;
    if (opts.size) { const v = opts.size === 'xl' && id === 'cash.out' ? 'l' : opts.size; if (e.variants[v]) return v; }
    if (e.rotate) { const names = Object.keys(e.variants), last = rotateLast.get(id); const nxt = names[(names.indexOf(last) + 1) % names.length]; rotateLast.set(id, nxt); return nxt; }
    return firstVariant(id);
  }
  function sharedJitter(t) { // voices that start within the same 120 ms share one jitter value, so unisons stay beat-free (2.5)
    if (t - jitState.t > 120) jitState = { t, c: (random() * 2 - 1) * 7 };
    return jitState.c;
  }

  // ---- play
  /** The core: a mix of members admitted together or not at all, counted once. members: [[id, opts], ...]; the first is the cause. */
  function mix(members, base = {}) {
    const t = nowMs();
    if (t >= momentUntil) momentQueued = false;
    const ms = members.filter(([id]) => RECIPES[id]);
    if (!ms.length) return drop('unknown');
    const [mainId, mainOpts0] = ms[0], mainE = RECIPES[mainId];
    const mainOpts = { ...base, ...mainOpts0 };
    const reason = gate(mainE, mainId, mainOpts);
    if (reason) return drop(reason);
    const plan = ms.map(([id, o]) => { const e = RECIPES[id], opts = { ...base, ...o }, variant = variantFor(e, id, opts); return { id, e, opts, variant, tier: tierOf(id, variant) }; });
    const heavy = plan.reduce((a, b) => (PRI[b.tier] > PRI[a.tier] ? b : a));
    const main = plan[0];
    // per-sound cooldown, with the rank rule (3.4.3): a higher rank inside the cooldown of a lower variant plays and stops it; equal or lower is dropped
    const key = main.e.perVariant ? main.id + '#' + main.variant : main.id;
    const last = cd.get(key), rank = variantRank(main.id, main.variant);
    let replace = null;
    if (!main.opts.noCooldown && last && t < last.until) { if (rank > last.rank && last.group && !last.group.stopped) replace = last.group; else return drop('cooldown'); }
    // the player flag: a press or a world activation in the last 1500 ms draws from a bucket of its own
    const player = main.opts.player ?? (main.e.player && (main.e.class === 'press' || main.e.class === 'world' || recentPress(env, t)));
    const bkt = player ? buckets.player : buckets[heavy.tier];
    // causal groups (3.4.6)
    if (main.opts.cause === 'result' && t - lastMedium < 1500) return drop('cooldown');
    if ((main.opts.cause === 'toast' || main.opts.cause === 'dialog') && t - lastGame < 400) return drop('cooldown');
    // refusal family escalation: a repeat within 2 s plays at -4 dB, a third is silent until 2 s of quiet
    let refuseDb = 0;
    if (REFUSAL.has(main.id)) { const r = t - refuse.last > 2000 ? 0 : refuse.n; if (r >= 2) return drop('cooldown'); refuseDb = r === 1 ? -4 : 0; }
    if (!bkt.can(t)) return drop('bucket');
    // the moment queue (3.4.7): the big moments are serial
    let extraDelay = 0;
    const moment = isMoment(heavy.id, heavy.variant, heavy.tier);
    if (moment && t < momentUntil) {
      if (PREEMPT.has(heavy.id)) { for (const v of voices) if (v.moment) stopGroup(v, 0.12); }
      else if (momentUntil - t <= 500 && !momentQueued) { extraDelay = (momentUntil - t) / 1000; momentQueued = true; }
      else return drop('budget'); // the slot is taken: a reward degrades to its tick (the resolver's job), anything else is dropped
    }
    // the voice cap: the 13th request steals the oldest voice of the lowest tier that is not higher than the request; a tiny request that finds only medium and loud voices is dropped
    purge();
    if (voices.length >= LIMITS.VOICES) {
      let victim = null;
      for (const v of voices) if (PRI[v.tier] <= PRI[heavy.tier] && (!victim || PRI[v.tier] < PRI[victim.tier] || (PRI[v.tier] === PRI[victim.tier] && v.startMs < victim.startMs))) victim = v;
      if (!victim) return drop('cap');
      stopGroup(victim, SOFT_END); voices.splice(voices.indexOf(victim), 1);
    }
    // ---- admitted: charge the bucket once, build every member
    bkt.take(t);
    if (replace) stopGroup(replace, 0.08);
    wake();
    const snapshot = { ...famLast }; // layer families do not stack: the later voice skips a layer whose family started inside its window, which is also the money group's rule for coins
    const group = { id: main.id, variant: main.variant, tier: heavy.tier, startMs: t + extraDelay * 1000, endMs: t, voices: [], moment, osc: 0, stopped: false };
    const startT = ctxNow() + LIMITS.LEAD;
    for (const m of plan) {
      const k = pickPool(m.e, m.id + '#' + m.variant);
      let layers = layersFor(m.id, m.variant, m.opts.params, k);
      const skip = new Set();
      for (const [fam, ms2] of Object.entries(FAMILY_MS)) if (t - (snapshot[fam] ?? -Infinity) < ms2) skip.add(fam);
      if (m.opts.noCoin) skip.add('coin');
      const head = layers.find((L) => (L.k === 'tone' || L.k === 'bank') && (L.t || 0) < 0.02 && !L.th);
      let shift = extraDelay + (Number(m.opts.delay) || 0);
      if (head) { // two voices on the same fundamental are 30 to 45 ms apart (2.5)
        recentHeads = recentHeads.filter((h) => t - h.t < 100);
        if (recentHeads.some((h) => h.f === head.f)) shift += 0.03 + random() * 0.015;
        recentHeads.push({ f: head.f, t });
      }
      const osc = oscCount(layers);
      if (liveOsc() + group.osc + osc > LIMITS.OSCILLATORS) { skip.add('sparkle'); layers = layers.filter((L) => L.fam !== 'sparkle'); if (m.tier === 'tiny') continue; }
      const s = eff();
      let gainDb = (m.opts.gainDb || 0) + refuseDb + (m.opts.where === 'elsewhere' ? -8 : m.opts.where === 'offscreen' ? -4 : 0);
      if (s.quiet) gainDb += m.e.bus === 'ui' ? -6 : -10;
      const lp = m.opts.where === 'elsewhere' ? 2500 : m.opts.where === 'offscreen' ? 3500 : m.opts.lp || 0;
      const bus = m.e.bus, dest = m.opts.noDuck || m.tier === 'loud' || bus === 'amb' ? chain.buses[bus] : nodes[bus][m.tier];
      const pan = Number.isFinite(+m.opts.pan) ? clamp(+m.opts.pan, -1, 1) : 0;
      let v;
      try {
        v = voice(ctx, dest, layers, startT + shift, { seed: ++seedN, trim: trimFor(m.id, m.variant, k), gainDb, pan, jit: sharedJitter(t), skip, secondary: m.opts.secondary, dull: m.opts.dull, lp });
      } catch (e) { logOnce('recipe ' + m.id, e); continue; }
      group.voices.push(v); group.osc += osc;
      for (const fam of v.fams) famLast[fam] = t;
      group.endMs = Math.max(group.endMs, t + (v.end - ctxNow()) * 1000);
      const ckey = m.e.perVariant ? m.id + '#' + m.variant : m.id;
      cd.set(ckey, { until: t + cooldownOf(m.id, m.variant), rank: variantRank(m.id, m.variant), group });
      stats.played[m.id] = (stats.played[m.id] || 0) + 1;
    }
    if (!group.voices.length) return null;
    voices.push(group);
    if (REFUSAL.has(main.id)) { refuse = { n: (t - refuse.last > 2000 ? 0 : refuse.n) + 1, last: t }; }
    if (main.e.bus === 'game' && PRI[heavy.tier] >= 2) lastMedium = t;
    if (main.e.bus === 'game') lastGame = t;
    if (moment) { momentUntil = Math.max(momentUntil, group.endMs); lastMoment = t; if (extraDelay === 0) momentQueued = false; }
    if (!main.opts.noDuck) { // a loud sound ducks the rest so it stands clear; the duck lasts as long as the sound plus 300 ms (3.5)
      const len = group.endMs - t + 300;
      if (heavy.tier === 'loud') { duck('amb', null, -9, len); for (const bus of ['ui', 'game']) { duck(bus, 'tiny', -6, len); duck(bus, 'medium', -3, len); } }
      else if (heavy.tier === 'medium') duck('amb', null, -4, 600, 40, 400);
    }
    if (main.e.class === 'press' || main.e.class === 'world') env.lastPress = t;
    return { id: main.id, variant: main.variant, group, stop: (ms = 80) => stopGroup(group, ms / 1000) };
  }
  function playMix(members, base) {
    if (!supported) return null;
    try { return mix(members, base); } catch (e) { logOnce('mix', e); return null; }
  }
  function play(id, opts = {}) { return playMix([[id, opts]]); }

  // ---- the collector: every other class waits for one macrotask so the burst is resolved together (3.4.2)
  function flush() {
    armed = null;
    const burst = queue; queue = [];
    if (!burst.length) return;
    try {
      const out = resolveBurst(rs, burst, { speed: env.speed, durOf: (id, v) => (RECIPES[id]?.dur || 0) * 1000 }, nowMs());
      for (const d of out.dropped) drop(d.reason);
      lastBurst = out;
      stats.sentences += out.sentences; stats.bursts++; stats.maxSentences = Math.max(stats.maxSentences, out.sentences);
      for (const p of out.plays) playMix(p.mix.map(([id, o]) => [id, p.delay ? { ...o, delay: (o.delay || 0) + p.delay / 1000 } : o]), { burst: true });
    } catch (e) { logOnce('flush', e); }
  }
  function request(id, opts = {}) {
    if (!supported) return false;
    try {
      const e = RECIPES[id];
      if (!e) { drop('unknown'); return false; }
      if (e.class === 'press' || e.class === 'world') return !!play(id, opts);
      const reason = gate(e, id, opts);
      if (reason) { drop(reason); return false; }
      const t = nowMs();
      if (env.sandbox && SANDBOX_SILENT.has(id)) { drop('budget'); return false; }
      if (catchingUp(env, t)) { drop('catchup'); return false; }
      const r = { id, opts: { ...opts }, meta: opts.meta || {}, at: t };
      if (opts.state) { const g = stateGate(rs, opts.state, r.meta.amount, t); if (!g.play) { drop('budget'); return false; } if (g.amount && r.meta.amount != null) r.meta = { ...r.meta, amount: g.amount }; }
      if (e.class === 'clock' || opts.clock) {
        const g = gateClock(rs, r, { ...env, busy: env.busy || env.hold }, t);
        if (!g.ok) { drop(g.reason); return false; }
        if (r.sum != null) { r.id = r.sum >= 0 ? 'cash.in' : 'cash.out'; r.opts = { ...r.opts, size: moneySize(r.sum, env.netWorth), variant: undefined, clock: true }; if (r.id === 'cash.out' && r.opts.size === 'xl') r.opts.size = 'l'; }
      }
      queue.push(r);
      if (armed == null) armed = timers.set(flush, 0);
      return true;
    } catch (e) { logOnce('request', e); return false; }
  }

  // ---- the repair dial tone (4.5): the one sound that is not a recipe; it follows a value
  const NOTES = ['D4', 'E4', 'F#4', 'A4', 'B4', 'D5', 'E5', 'F#5', 'A5', 'B5', 'D6'];
  let dial = null;
  const dialApi = {
    start() {
      if (dial || !playable() || !eff().dial || eff().mute) return false;
      try {
        const t = ctxNow(), g = ctx.createGain(), main = ctx.createOscillator(), oct = ctx.createOscillator(), shim = ctx.createOscillator(), og = ctx.createGain(), sg = ctx.createGain();
        main.type = 'sine'; oct.type = 'sine'; shim.type = 'sine';
        main.frequency.value = hz(NOTES[0]); oct.frequency.value = hz(NOTES[0]) * 2; shim.frequency.value = hz('A5');
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(dB(-33), t + 0.03); // 6 dB under a tiny sound (-36 dB active level; a sine's peak is 3 dB over its level)
        og.gain.value = 0.0001; sg.gain.value = 0.0001;
        main.connect(g); oct.connect(og); shim.connect(sg); og.connect(g); sg.connect(g); g.connect(chain.buses.game);
        for (const o of [main, oct, shim]) o.start(t);
        dial = { g, main, oct, shim, og, sg };
        return true;
      } catch (e) { logOnce('dial', e); dial = null; return false; }
    },
    /** pos: the marker's place 0 to 1; lo and hi: the green zone. Left is low, right is high; in the zone the tone gains an octave partial and a glass shimmer and rises 3 dB. */
    update(pos, lo, hi) {
      if (!dial || !ctx) return;
      try {
        const t = ctxNow(), p = clamp(Number.isFinite(+pos) ? +pos : 0, 0, 1), f = hz(NOTES[Math.round(p * (NOTES.length - 1))]);
        const inZone = Number.isFinite(+lo) && Number.isFinite(+hi) && p >= lo && p <= hi;
        dial.main.frequency.setTargetAtTime(f, t, 0.035 / 3); dial.oct.frequency.setTargetAtTime(f * 2, t, 0.035 / 3);
        dial.og.gain.setTargetAtTime(inZone ? 0.35 : 0.0001, t, 0.02); dial.sg.gain.setTargetAtTime(inZone ? 0.18 : 0.0001, t, 0.02);
        dial.g.gain.setTargetAtTime(dB(inZone ? -30 : -33), t, 0.02);
      } catch { /* the tone is an addition */ }
    },
    stop(fade = 0.015) {
      const d = dial; dial = null;
      if (!d || !ctx) return;
      try { const t = ctxNow(); d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(Math.max(0.0001, d.g.gain.value), t); d.g.gain.exponentialRampToValueAtTime(0.0001, t + fade); for (const o of [d.main, d.oct, d.shim]) o.stop(t + fade + 0.02); } catch { /* already gone */ }
    },
    get active() { return !!dial; },
  };

  // ---- the public API
  const api = {
    play, request, playMix,
    stop(h, ms = 80) { try { h?.stop?.(ms); } catch { /* gone */ } },
    stopAll(ms = 60) { for (const g of voices) stopGroup(g, ms / 1000); voices.length = 0; queue = []; if (armed != null) { timers.clear(armed); armed = null; } dialApi.stop(); },
    unlock() {
      if (!supported) return;
      try {
        if (!ctx) create();
        unlocked = true;
        if (!hidden) { const p = ctx.resume && ctx.resume(); p && p.catch && p.catch(() => {}); idleSuspended = false; }
        amb.apply();
        notify('state');
      } catch (e) { supported = false; ctx = null; logOnce('unlock', e); notify('state'); }
    },
    get state() {
      if (!supported) return 'unsupported';
      if (!ctx) return 'locked';
      if (hidden || idleSuspended) return 'suspended';
      return ctx.state === 'running' ? 'running' : 'locked'; // suspended or interrupted until the next gesture
    },
    /** The page was hidden or shown: a hidden tab stops every voice with a short fade, then suspends the context so no half-played voice resumes in the middle on return (7.5). */
    setHidden(h) {
      if (!supported || hidden === !!h) return;
      hidden = !!h;
      if (hidden) {
        api.stopAll(40); amb.pause();
        if (ctx) timers.set(() => { try { if (hidden && ctx.state === 'running') { const p = ctx.suspend(); p && p.catch && p.catch(() => {}); } } catch { /* ignore */ } }, 60);
      } else if (ctx && unlocked) {
        env.justVisible = true;
        timers.set(() => { try { const p = ctx.resume(); p && p.catch && p.catch(() => {}); } catch { /* quietly until the next gesture */ } amb.apply(); notify('state'); }, 0);
      }
      notify('state');
    },
    sync(a) {
      if (a && typeof a === 'object') { const cur = get(); if (cur !== a && cur && typeof cur === 'object') Object.assign(cur, a); }
      try {
        applyGains(false);
        const s = eff();
        if (!s.ambient || s.mute) amb.stop(0.4); else amb.apply();
        if (!s.dial || s.mute) dialApi.stop();
        if (s.mute) { api.stopAll(30); }
      } catch (e) { logOnce('sync', e); }
      notify('settings'); notify('mute');
    },
    setMaster(v) { const a = get(); if (a) a.master = clamp(Math.round((+v || 0) / 5) * 5, 0, 100); api.sync(); },
    setMute(b) { const a = get(); if (a) a.mute = !!b; api.sync(); },
    setBus(bus, on) { const a = get(); if (a && (bus === 'ui' || bus === 'game')) a[bus] = !!on; api.sync(); },
    setAmbient(on) { const a = get(); if (a) a.ambient = !!on; api.sync(); },
    setAmbientLevel(v) { const a = get(); if (a) a.ambientLevel = clamp(Math.round((+v || 0) / 5) * 5, 0, 100); api.sync(); },
    setDial(on) { const a = get(); if (a) a.dial = !!on; api.sync(); },
    setClockSounds(on) { const a = get(); if (a) a.clockSounds = !!on; api.sync(); },
    applyPreset(name) { const a = get(); if (!a) return; const P = { full: { ui: true, game: true, ambient: false, dial: false, clockSounds: true, quiet: false }, classroom: { ui: true, game: true, ambient: false, dial: false, clockSounds: false, quiet: true }, interface: { ui: true, game: false, ambient: false, dial: false, clockSounds: true, quiet: false } }; if (name === 'off') a.mute = true; else if (P[name]) Object.assign(a, P[name], { master: 70 }); a.touched = true; api.sync(); },
    /** The clock-sound hold (3.4.5): true while a dialog, the Deal Room or a lesson is open; false plays the one summed coin. */
    hold(on) {
      on = !!on;
      if (env.hold === on) return;
      env.hold = on;
      if (!on) { const r = holdRelease(rs, env.netWorth); if (r) request(r[0], r[1]); }
      notify('hold');
    },
    /** `countUp` started at least one number: ui.count-up for 25 XP or more, skipped when a medium or louder sound started in the last 1200 ms (3.4.6). */
    countUp(xp) { if (!(Number(xp) >= 25)) return null; if (nowMs() - lastMedium < 1200) return drop('cooldown'); return play('ui.count-up'); },
    ambient(state) { amb.set(state); },
    dial: dialApi,
    /** One ambient one-shot on demand, whatever the rate rule says: for the audition page. */
    playOneShot(id) { if (!playable() || !nodes) return null; return voice(ctx, nodes.ambLevel, oneShotLayers(id), ctxNow() + LIMITS.LEAD, { seed: ++seedN, trim: TRIMS.oneShots?.[id] ?? 0, jitterCents: 7 }); },
    /** A level meter for the audition page: an analyzer on the output of the master chain (made on first use, so nothing runs for the game). */
    meter() { if (!ctx || !chain) return null; if (!meterNode) { meterNode = ctx.createAnalyser(); meterNode.fftSize = 1024; chain.clip.connect(meterNode); const sink = ctx.createGain(); sink.gain.value = 0; meterNode.connect(sink); sink.connect(ctx.destination); } /* a silent tail keeps the analyser pulled */ return meterNode; },
    /** Tell the engine the world it is in (speed, paused, busy, lag, sandbox, net worth...). */
    setEnv(patch) { Object.assign(env, patch); },
    touch() { env.lastPress = nowMs(); },
    env,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    stats() { purge(); return { active: voices.length, dropped: { ...stats.dropped }, played: { ...stats.played }, sentences: stats.sentences, bursts: stats.bursts, maxSentences: stats.maxSentences, lastBurst, ambient: { playing: amb.playing(), theme: amb.theme(), timer: amb.timerActive(), ...amb.stats }, makeupMeasured: makeupSet }; },
    ids: () => IDS.slice(),
    variants: (id) => variantsOf(id),
    /** The same voice into an OfflineAudioContext: the test plan's hook. Through the chain it starts at 0.6 s or later (3.7). */
    render(id, variant, oc, o = {}) {
      const e = RECIPES[id]; if (!e) return null;
      const at = o.at ?? (o.chain ? 0.6 : 0.01);
      let dest = oc.destination;
      if (o.chain) dest = master(oc, { master: o.master ?? 1, makeup: 1 / (TRIMS.makeup || MAKEUP_FALLBACK) }).buses[e.bus];
      return voice(oc, dest, layersFor(id, variant ?? firstVariant(id), o.params, o.k || 0), at, { seed: o.seed ?? 7, trim: trimFor(id, variant ?? firstVariant(id), o.k || 0) + (o.gainDb || 0), noJitter: true, jit: 0 });
    },
    release() { api.stopAll(40); amb.stop(0.3); queue = []; if (idleT != null) { timers.clear(idleT); idleT = null; } env.hold = false; env.sandbox = false; },
    /** Closed on pagehide. */
    close() { api.release(); try { ctx?.close?.(); } catch { /* ignore */ } ctx = null; chain = null; nodes = null; unlocked = false; },
    get supported() { return supported; },
    /** The master chain and the duck nodes, for tests. */
    get chain() { return chain && { ...chain, nodes }; },
    get context() { return ctx; },
    _resolver: rs, _amb: amb, _voices: voices,
  };
  return api;
}
