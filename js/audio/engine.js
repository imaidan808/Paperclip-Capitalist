// The engine (docs/AUDIO.md section 3 and 8.2): one AudioContext for the page, the buses and the master chain, the voice manager, rank-aware cooldowns, token buckets, ducking, the collector,
// the settings sync, the ambient bed and the repair dial tone. Nothing here touches the DOM, and the context comes from an injected factory, so a recording fake context tests all of it in
// Node. With Web Audio missing, or any failure, `state` is 'unsupported' and every method returns without throwing. With sound idle there is no timer and no frame callback.
import { voice, master, dB, hz, fadeIn, noiseBuffers, MAKEUP_FALLBACK, FAMILY_MS, layerSpans, isGhost, moneySize } from './palette.js';
import { RECIPES, IDS, layersFor, tierOf, firstVariant, variantsOf, cooldownOf, variantRank, trimFor, noiseAtFor, isMoment, PREEMPT, jitterOf } from './recipes.js';
import { createAmbient, oneShotLayers } from './ambient.js';
import { TRIMS } from './trims.js';
import { createResolverState, resolveBurst, gateClock, holdRelease, stateGate, catchingUp, recentPress } from './resolve.js';
import { volumeGain, masterGain, CLASSROOM_DB } from './settings.js';

const PRI = { tiny: 1, medium: 2, loud: 3 };
export const LIMITS = { VOICES: 12, OSCILLATORS: 160, LEAD: 0.012, WARM: 0.16, IDLE_MS: 60000, DUCK_REL: 600 };
// LEAD: how far ahead of `currentTime` a voice is scheduled, so that nothing starts in the past. WARM: the earliest a voice may start, in the context's own time. Chrome's glue compressor is cold for the
// first 100 to 150 ms after the context is made and takes up to 10 dB off a short sound that starts inside them, whatever was fed to it before (a -80 dBFS sine changed nothing: it is the time since the
// compressor started, not what it heard; docs/AUDIO.md 3.7, sixth round R3-1). A key or a touch makes the context and plays its tick in the same task, 12 ms in, and that tick came out up to 9.8 dB quiet
// (a mouse click's tick follows its pointerdown by 60 to 150 ms and lost 0.4 to 2.8). A voice that would start earlier waits for 160 ms of context time, where the loss is under half a dB; from then on
// nothing waits for anything. A context that sat silent for 30 s was not cold again (an offline render; a suspended live context was not measured).
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
/** The layers a voice really builds: `voice()` leaves out a layer whose family is in `skip`, a texture layer of a secondary voice and a ding of a dull one. The oscillator budget counts these. */
const builtLayers = (layers, skip, o) => layers.filter((L) => !(L.fam && skip.has(L.fam)) && !(o.secondary && isGhost(L)) && !(o.dull && L.ding));
/** The spans ([from, to, count], in ms of the page's clock) of a voice that starts at `startMs`. */
const spansOf = (layers, startMs) => layers.flatMap(layerSpans).map(([a, b, n]) => [startMs + a * 1000, startMs + b * 1000, n]);
/**
 * The most oscillators alive at one instant when `mine` is added to `others` (docs/AUDIO.md 3.3), looking only at the instants when `mine` has any alive: a sound that starts when the others
 * have ended does not share the budget with them, however long the group they belong to is. Spans that end where another begins do not overlap.
 */
function peakAlive(others, mine) {
  const ev = [];
  for (const [a, b, n] of others) ev.push([a, n, 0], [b, -n, 0]);
  for (const [a, b, n] of mine) ev.push([a, n, 1], [b, -n, 1]);
  ev.sort((x, y) => x[0] - y[0] || x[1] - y[1]); // at one instant the ends come before the starts
  let o = 0, m = 0, pk = 0;
  for (const [, n, own] of ev) { if (own) m += n; else o += n; if (m > 0 && o + m > pk) pk = o + m; }
  return pk;
}
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const DEFAULT_SETTINGS = { master: 70, mute: false, ui: true, game: true, ambient: false, ambientLevel: 70, dial: false, clockSounds: true, quiet: false, worldTicks: true };

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
  let ctx = null, chain = null, nodes = null, unlocked = false, gesture = false, hidden = false, idleSuspended = false, makeupSet = false, seedN = 0, burstN = 0, momentBurst = -1;
  const listeners = new Set(), rs = createResolverState();
  const env = { speed: 1, paused: false, busy: false, market: false, hold: false, lagMs: 0, justVisible: false, rewound: false, sandbox: false, lastPress: -Infinity, netWorth: 0, classroom: false };
  const stats = { dropped: {}, played: {}, sentences: 0, bursts: 0, maxSentences: 0 };
  const voices = [], cd = new Map(), famLast = {}, poolLast = new Map(), rotateLast = new Map(), ducks = {}, buckets = {};
  for (const [k, v] of Object.entries(BUCKET_SPEC)) buckets[k] = makeBucket(v);
  let queue = [], armed = null, idleT = null, momentUntil = 0, momentQueued = false, lastMedium = -Infinity, lastGame = -Infinity, lastMoment = -Infinity;
  let refuse = { n: 0, last: -Infinity }, jitState = { t: -Infinity, c: 0 }, recentHeads = [], broken = new Set(), lastBurst = null;

  const drop = (reason) => { stats.dropped[reason] = (stats.dropped[reason] || 0) + 1; return null; };
  const notify = (what) => { for (const fn of [...listeners]) { try { fn(what); } catch { /* a listener must not break the sound */ } } };
  const logOnce = (key, e) => { if (broken.has(key)) return; broken.add(key); try { console.warn('[audio]', key, e && e.message ? e.message : e); } catch { /* no console */ } };
  const settings = () => { const a = get() || DEFAULT_SETTINGS; return { master: clamp(Number.isFinite(+a.master) ? +a.master : 70, 0, 100), mute: a.mute === true, ui: a.ui !== false, game: a.game !== false, ambient: a.ambient === true, ambientLevel: clamp(Number.isFinite(+a.ambientLevel) ? +a.ambientLevel : 70, 0, 100), dial: a.dial === true, clockSounds: a.clockSounds !== false, quiet: a.quiet === true, worldTicks: a.worldTicks !== false }; };
  /** What the settings amount to: the Classroom rule forces ambient, the dial tone and the clock sounds off (7.1). */
  const eff = () => { const s = settings(); return { ...s, ambient: s.ambient && !s.quiet, dial: s.dial && !s.quiet, clockSounds: s.clockSounds && !s.quiet }; };
  /** Nothing can be heard: muted, or the volume is at 0. No voice is built, no bed runs and no context is made for it (a muted page costs nothing). */
  const silent = () => { const s = eff(); return s.mute || s.master <= 0; };
  const playable = () => supported && !!ctx && unlocked && !hidden && ctx.state !== 'closed';
  const ctxNow = () => ctx.currentTime;
  /** Where a voice asked for at `now` starts, in context time: LEAD from now, and never inside the compressor's warm-up (LIMITS.WARM). */
  const startAt = (now) => Math.max(now + LIMITS.LEAD, LIMITS.WARM);

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
    try { noiseBuffers(ctx); } catch (e) { logOnce('noise', e); } // the shared noise (about 40 ms of work) is made at the first gesture, not by the first sound
    measureMakeup();
  }
  function applyGains(instant) {
    if (!ctx || !chain) return;
    const s = eff(), t = ctxNow();
    const mg = masterGain(s), al = volumeGain(s.ambientLevel); // the volume's taper and the headroom ahead of the compressor (docs/AUDIO.md 3.2, A2); the ambience has the taper only
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
    enabled: () => eff().ambient && !silent(), running: () => playable(), dialogOpen: () => env.hold, lastMedium: () => lastMedium, lastMoment: () => lastMoment,
    duck: (db) => { if (!nodes) return; const t = ctxNow(); nodes.ambBase.gain.cancelScheduledValues(t); nodes.ambBase.gain.setTargetAtTime(dB(db), t, db < 0 ? 0.1 : 0.17); },
    shot: (id, layers, pan) => { if (!nodes || !playable()) return; voice(ctx, nodes.ambLevel, layers, startAt(ctxNow()), { seed: ++seedN, trim: TRIMS.oneShots?.[id] ?? 0, noiseAt: TRIMS.noiseAt?.[id], pan, jitterCents: 7 }); },
  });

  // ---- gates shared by play and request
  function gate(e, id, opts) {
    const s = eff();
    if (s.mute || s.master <= 0) return 'mute';
    if (e.bus === 'ui' ? !s.ui : !s.game) return 'bus';
    if ((id === 'world.hover' || id === 'world.step') && !s.worldTicks) return 'bus'; // the world's ticks have a switch of their own (7.1): hover and footsteps are the most frequent sounds there are
    if (s.quiet && e.bus === 'game' && tierOf(id, peekVariant(e, id, opts) ?? firstVariant(id)) === 'tiny') return 'quiet';
    if ((e.class === 'clock' || opts.clock) && !s.clockSounds) return 'bus';
    if (!playable()) return 'locked';
    return null;
  }
  function purge() {
    const t = nowMs();
    for (let i = voices.length - 1; i >= 0; i--) if (voices[i].endMs <= t) voices.splice(i, 1);
  }
  /** What the voices already admitted keep alive inside [from, to] (a group that is stopped has had its spans cut short by `stopGroup`). */
  const spansIn = (from, to, extra) => { const out = []; for (const g of voices) for (const sp of g.spans) if (sp[0] < to && sp[1] > from) out.push(sp); for (const sp of extra) if (sp[0] < to && sp[1] > from) out.push(sp); return out; };
  function stopGroup(g, fadeSec) {
    if (!g || g.stopped) return;
    g.stopped = true;
    for (const v of g.voices) { try { v.stop(ctxNow(), fadeSec); } catch { /* gone */ } }
    g.endMs = Math.min(g.endMs, nowMs() + fadeSec * 1000 + 30);
    for (const sp of g.spans) sp[1] = Math.min(sp[1], g.endMs); // a stopped voice's oscillators are alive for its fade and no longer
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
  /**
   * The variant a request names, by `variant` or by `size`, or null when it names none (a rotation or the first variant decides). It only LOOKS: the gate asks it for every request and a rotation is advanced
   * only when a voice is built. The gate used to read `opts.variant` alone, so a coin asked for by size ({ size: 'm' }, as the test button asked) was judged as the first, tiny, variant and
   * Classroom left it out, whatever its size: the Classroom rule is about the sound that plays (fifth round, U2).
   */
  function peekVariant(e, id, opts) {
    if (opts.variant && e.variants[opts.variant]) return opts.variant;
    if (opts.size) { const v = opts.size === 'xl' && id === 'cash.out' ? 'l' : opts.size; if (e.variants[v]) return v; }
    return null;
  }
  function variantFor(e, id, opts) {
    const named = peekVariant(e, id, opts);
    if (named) return named;
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
    const mainPan = Number.isFinite(+mainOpts.pan) ? clamp(+mainOpts.pan, -1, 1) : 0; // the members of one mix share the cause's place unless they have their own
    const heavy = plan.reduce((a, b) => (PRI[b.tier] > PRI[a.tier] ? b : a));
    const main = plan[0];
    // per-sound cooldown, with the rank rule (3.4.3): a higher rank inside the cooldown of a lower variant plays and stops it; equal or lower is dropped
    const key = main.e.perVariant ? main.id + '#' + main.variant : main.id;
    const last = cd.get(key), rank = variantRank(main.id, main.variant);
    let replace = null;
    if (!main.opts.noCooldown && last && t < last.until) { if (rank > last.rank && last.group && !last.group.stopped) replace = last.group; else return drop('cooldown'); }
    // the player flag: a press or a world activation in the last 1500 ms draws from a bucket of its own
    const player = main.opts.player ?? (main.e.player && (main.e.class === 'press' || main.e.class === 'world' || recentPress(env, t)));
    // The bucket is the CAUSE's own tier, not its heaviest member's: a sale with an xl coin is a medium sound that carries a big coin, and charging the loud bucket for it left the level-up
    // of the same burst nothing to draw from. The second sentence of a burst (the resolver's reward) was already limited by the reward budget, so it does not queue behind the first.
    const second = base.role === 's2';
    const bkt = player ? buckets.player : buckets[main.tier];
    // causal groups (3.4.6)
    if (main.opts.cause === 'result' && t - lastMedium < 1500) return drop('cooldown');
    if ((main.opts.cause === 'toast' || main.opts.cause === 'dialog') && t - lastGame < 400) return drop('cooldown');
    // refusal family escalation: a repeat within 2 s plays at -4 dB, a third is silent until 2 s of quiet
    let refuseDb = 0;
    if (REFUSAL.has(main.id)) { const r = t - refuse.last > 2000 ? 0 : refuse.n; if (r >= 2) return drop('cooldown'); refuseDb = r === 1 ? -4 : 0; }
    // run.end and the two alerts preempt (3.4.7): they are the most serious sounds in the game and are never held back by a bucket that a fanfare 1 s ago emptied
    if (!bkt.can(t) && !second && !PREEMPT.has(main.id)) return drop('bucket');
    // the moment queue (3.4.7): the big moments are serial
    let extraDelay = 0;
    const moment = isMoment(heavy.id, heavy.variant, heavy.tier);
    if (moment && t < momentUntil && !(second && base.bid != null && base.bid === momentBurst)) { // the second sentence of the burst that made the slot busy is the resolver's own plan
      if (PREEMPT.has(heavy.id) || main.opts.preempt) { for (const v of voices) if (v.moment) stopGroup(v, 0.12); } // `preempt`: a press on the audition page wins over the moment still ringing (the game never asks for it)
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
    const group = { id: main.id, variant: main.variant, tier: heavy.tier, startMs: t + extraDelay * 1000, endMs: t, voices: [], moment, osc: 0, spans: [], stopped: false };
    const now0 = ctxNow(), startT = startAt(now0), lead = startT - now0; // `lead`: how far from now the voices really start: LEAD, or the rest of the compressor's warm-up for the first sound of a context
    for (const m of plan) {
      const k = Number.isInteger(m.opts.poolIndex) && m.opts.poolIndex >= 0 && m.opts.poolIndex < (m.e.pool || 1) ? m.opts.poolIndex : pickPool(m.e, m.id + '#' + m.variant); // poolIndex: a member asked for by name (the audition page)
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
      // The oscillator budget (3.3) counts what is alive at the same instant: this voice's built layers (not those it will leave out) against the spans of the voices already admitted, each from its
      // own start (a second sentence at +500 ms or a tick at +2 s is not alive at the time of the first). Over it, the optional sparkle goes; a tiny sound that still does not fit is dropped.
      const startMs = t + (lead + shift) * 1000, mo = { secondary: m.opts.secondary, dull: m.opts.dull };
      let spans = spansOf(builtLayers(layers, skip, mo), startMs);
      const total = (sp) => sp.reduce((n, x) => n + x[2], 0);
      const over = (sp) => { // the plain sum is the quick answer; the sweep only runs when the sum is over
        const others = spansIn(Math.min(...sp.map((x) => x[0])), Math.max(...sp.map((x) => x[1])), group.spans);
        return total(sp) + total(others) > LIMITS.OSCILLATORS && peakAlive(others, sp) > LIMITS.OSCILLATORS;
      };
      if (spans.length && over(spans)) {
        skip.add('sparkle'); layers = layers.filter((L) => L.fam !== 'sparkle'); spans = spansOf(builtLayers(layers, skip, mo), startMs);
        if (m.tier === 'tiny' && spans.length && over(spans)) { drop('osc'); continue; }
      }
      const osc = total(spans);
      const s = eff();
      let gainDb = (m.opts.gainDb || 0) + refuseDb + (m.opts.where === 'elsewhere' ? -8 : m.opts.where === 'offscreen' ? -4 : 0);
      if (s.quiet) gainDb += m.e.bus === 'ui' ? CLASSROOM_DB.ui : CLASSROOM_DB.game;
      const lp = m.opts.where === 'elsewhere' ? 2500 : m.opts.where === 'offscreen' ? 3500 : m.opts.lp || 0;
      const bus = m.e.bus, dest = m.opts.noDuck || m.tier === 'loud' || bus === 'amb' ? chain.buses[bus] : nodes[bus][m.tier];
      const pan = Number.isFinite(+m.opts.pan) ? clamp(+m.opts.pan, -1, 1) : mainPan; // the coins and the streak of a sale sound where the sale does (3.6); a member that must stay centred says `pan: 0`
      let v;
      try {
        v = voice(ctx, dest, layers, startT + shift, { seed: ++seedN, trim: trimFor(m.id, m.variant, k), noiseAt: noiseAtFor(m.id, m.variant, k), gainDb, pan, jit: sharedJitter(t) * jitterOf(m.id, m.variant), skip, secondary: m.opts.secondary, dull: m.opts.dull, lp });
      } catch (e) { logOnce('recipe ' + m.id, e); continue; }
      group.voices.push(v); group.osc += osc; group.spans.push(...spans);
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
    if (moment) { momentUntil = Math.max(momentUntil, group.endMs); lastMoment = t; momentBurst = base.bid ?? -1; if (extraDelay === 0) momentQueued = false; }
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
      const bid = ++burstN;
      for (const p of out.plays) playMix(p.mix.map(([id, o]) => [id, p.delay ? { ...o, delay: (o.delay || 0) + p.delay / 1000 } : o]), { burst: true, role: p.role, bid });
    } catch (e) { logOnce('flush', e); }
  }
  function request(id, opts = {}) {
    if (!supported) return false;
    try {
      const e = RECIPES[id];
      if (!e) { drop('unknown'); return false; }
      if (e.class === 'press' || e.class === 'world') {
        if (opts.state) { // a state sound (burnout's nudge) is a state whatever its class: it plays on entering, then once per 45 s, and not while the engine is catching up (4.2)
          const why = gate(e, id, opts); if (why) { drop(why); return false; }
          const at = nowMs();
          if (catchingUp(env, at)) { drop('catchup'); return false; }
          const sg = stateGate(rs, opts.state, opts.meta?.amount, at); if (!sg.play) { drop('budget'); return false; }
        }
        return !!play(id, opts);
      }
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
      if (dial || !playable() || !eff().dial || silent() || !eff().game) return false; // the tone is a game-bus voice: with Game sounds off it is off
      try {
        const t = ctxNow(), g = ctx.createGain(), main = ctx.createOscillator(), oct = ctx.createOscillator(), shim = ctx.createOscillator(), og = ctx.createGain(), sg = ctx.createGain();
        main.type = 'sine'; oct.type = 'sine'; shim.type = 'sine';
        main.frequency.value = hz(NOTES[0]); oct.frequency.value = hz(NOTES[0]) * 2; shim.frequency.value = hz('A5');
        fadeIn(g.gain, t, 0.03, dB(-33)); // 6 dB under a tiny sound (-36 dB active level; a sine's peak is 3 dB over its level)
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
    /** Every voice gets a fade; `keepMs` lets one that began that recently play on (the tick of the press that is leaving the screen). */
    stopAll(ms = 60, keepMs = 0) { const t = nowMs(), rest = []; for (const g of voices) { if (keepMs > 0 && t - g.startMs < keepMs) rest.push(g); else stopGroup(g, ms / 1000); } voices.length = 0; voices.push(...rest); queue = []; if (armed != null) { timers.clear(armed); armed = null; } dialApi.stop(); },
    unlock() {
      if (!supported) return;
      gesture = true;
      try {
        if (!ctx) { if (silent()) { notify('state'); return; } create(); } // a muted page (or one at volume 0) makes no context and never runs one: sync() makes it when sound is wanted
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
        const quiet = silent();
        if (!s.ambient || quiet) amb.stop(0.4); else amb.apply();
        if (!s.dial || quiet || !s.game) dialApi.stop();
        if (quiet) { api.stopAll(30); }
        else if (gesture && !ctx && supported) api.unlock(); // unmuted (or the volume raised) after the first gesture: the context that a silent page never made
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
    applyPreset(name) { const a = get(); if (!a) return; const P = { full: { ui: true, game: true, ambient: false, dial: false, clockSounds: true, quiet: false }, classroom: { ui: true, game: true, ambient: false, dial: false, clockSounds: false, quiet: true }, interface: { ui: true, game: false, ambient: false, dial: false, clockSounds: true, quiet: false } }; if (name === 'off') a.mute = true; else if (P[name]) { Object.assign(a, P[name], { mute: false }); if (!(a.master > 0)) a.master = 70; } a.touched = true; api.sync(); }, // the volume is the player's own (settings.js applyPreset)
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
    playOneShot(id) { if (!playable() || !nodes) return null; return voice(ctx, nodes.ambLevel, oneShotLayers(id), startAt(ctxNow()), { seed: ++seedN, trim: TRIMS.oneShots?.[id] ?? 0, noiseAt: TRIMS.noiseAt?.[id], jitterCents: 7 }); },
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
      return voice(oc, dest, layersFor(id, variant ?? firstVariant(id), o.params, o.k || 0), at, { seed: o.seed ?? 7, trim: trimFor(id, variant ?? firstVariant(id), o.k || 0) + (o.gainDb || 0), noiseAt: noiseAtFor(id, variant ?? firstVariant(id), o.k || 0), noJitter: true, jit: 0 });
    },
    release(keepMs = 0) { api.stopAll(40, keepMs); amb.stop(0.3); queue = []; if (idleT != null) { timers.clear(idleT); idleT = null; } env.hold = false; env.sandbox = false; },
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
