// node dev/audio-proto/events.mjs
// Revision 2 of docs/AUDIO.md, section 3.4. Plays the heuristic bot (tests/bot.mjs) for 90 virtual days on three seeds with the shell's own order of delivery
// (js/ui/shell.js attachGame: `progress.onEvent(evt)` first, then the event is passed on to the audio wiring) and the real Progress hooks, and reports
//   how often a reward was delivered before the sale it came with, the largest burst, the reward counts, the herd and flat splits (docs 4.1),
//   and, with nothing done, how many buyers arrive a minute at 1x in the starting district.
// Pure Node, no browser, about a minute.
import { makeGame, decide } from '../../tests/bot.mjs';
import { Progress } from '../../js/meta/progress.js';

const SEEDS = [7, 13, 21];
const isReward = (x) => x === 'level' || x === 'quest' || x === 'daily' || x.startsWith('ach:') || x === 'codex' || x === 'skill';
const out = {};
for (const seed of SEEDS) {
  const g = makeGame(['trades', 'pro'], 'ops', seed);
  let cur = null;
  const push = (t) => { if (cur) cur.push(t); };
  const progress = new Progress(g, {
    onComplete(kind, def) { push(kind === 'achievement' ? `ach:${def.rarity}` : kind); },
    onCodex() { push('codex'); },
  });
  g.onEvent = (evt) => {
    progress.onEvent(evt);                         // the shell runs the progress hooks first ...
    if (evt.type === 'pitch') push(`pitch:${evt.outcome}${evt.outcome === 'herd' ? (evt.gain > 0.02 ? '+win' : '-loss') : ''}${evt.outcome === 'flat' ? (evt.gain < -0.02 ? '-below' : '-fair') : ''}`);
    else if (evt.type !== 'day' && evt.type !== 'cycle') push(evt.type);   // ... and only then does the event reach the audio wiring
  };
  const bursts = [];
  for (let h = 0; h < 90 * 24 && !g.s.over; h++) {
    cur = []; g.advanceTo(g.s.hour + 1); if (cur.length) bursts.push(cur);
    if (h % 2 === 0) { cur = []; decide(g); if (cur.length) bursts.push(cur); }
  }
  cur = null;
  const all = bursts.flat(), count = (f) => all.filter(f).length;
  const sales = bursts.filter((b) => b.some((x) => x.startsWith('pitch:')));
  const withReward = sales.filter((b) => b.some(isReward));
  const rewardFirst = withReward.filter((b) => b.findIndex(isReward) < b.findIndex((x) => x.startsWith('pitch:')));
  const biggest = bursts.reduce((m, b) => (b.length > m.length ? b : m), []);
  const herd = all.filter((x) => x.startsWith('pitch:herd')), flat = all.filter((x) => x.startsWith('pitch:flat'));
  out[seed] = {
    saleStepsWithReward: withReward.length, rewardBeforeSale: rewardFirst.length, sharePct: Math.round(100 * rewardFirst.length / Math.max(1, withReward.length)),
    biggestBurst: biggest.length, biggest: biggest.join(' '),
    daily: count((x) => x === 'daily'), quests: count((x) => x === 'quest'), achievements: { common: count((x) => x === 'ach:common'), rare: count((x) => x === 'ach:rare'), epic: count((x) => x === 'ach:epic') },
    codex: count((x) => x === 'codex'), levels: count((x) => x === 'level'),
    herd: { total: herd.length, wins: herd.filter((x) => x.endsWith('+win')).length }, flat: { total: flat.length, belowFairBy2pct: flat.filter((x) => x.endsWith('-below')).length },
  };
}
console.log(JSON.stringify(out, null, 1));
const arr = [];
for (const seed of SEEDS) {
  const g = makeGame(['trades', 'pro'], 'ops', seed), z = Math.min(...g.s.zones), seen = new Set((g.s.leads[z] || []).map((l) => l.id));
  let n = 0, need = 0;
  for (let h = 0; h < 336; h++) { g.advanceTo(g.s.hour + 1); for (const l of g.s.leads[z] || []) if (!seen.has(l.id)) { seen.add(l.id); n++; if (l.need) need++; } }
  arr.push({ seed, zone: z, arrivals: n, withANeed: need, perMinuteAt1x: +(n / (336 * 7 / 60)).toFixed(2) });
}
console.log('buyers arriving, nothing done, 336 virtual hours:', JSON.stringify(arr));

// The ambient one-shots' rate from the table of docs/AUDIO.md 6.4: the sum of each allowed one-shot's own rate (one timer per one-shot) against one chain
// that draws a single delay at a time. Day, and at night with the cricket added.
const { ONE_SHOTS, BEDS } = await import('./ambient.js');
const mid = (o) => (o.every[0] + o.every[1]) / 2;
const rates = Object.keys(BEDS).map((bed) => {
  const day = ONE_SHOTS.filter((o) => o.theme.split(/[ ,]+/).includes(bed) && !/night|crunch/.test(o.theme)), night = day.concat(ONE_SHOTS.filter((o) => o.id === 'amb.cricket'));
  const chain = (L) => (L.length ? 60 / (L.reduce((s, o) => s + mid(o), 0) / L.length) : 0), each = (L) => L.reduce((s, o) => s + 60 / mid(o), 0);
  return { bed, oneShots: day.length, dayEach: +each(day).toFixed(1), dayChain: +chain(day).toFixed(1), nightEach: +each(night).toFixed(1), nightChain: +chain(night).toFixed(1) };
});
console.log('ambient one-shots a minute, by bed (each = one timer per one-shot, chain = one delay at a time):');
console.table(rates);
