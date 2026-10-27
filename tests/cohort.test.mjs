// "The rest of the class": the ghost herd that gives solo play a market to be crowded in, real peers' published niches, and synthetic students for sixteen districts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Cohort, ghostCounts, zoneShare, makeSynth, synthSnapshot, synthFlags, cohortStats, median } from '../js/cohort.js';
import { ASSETS, BUYERS, ZONES, ZONE_IDS, PERK_IDS, MIL, FMV_BAND } from '../js/config.js';
import { fitOf, demandOf, nicheKey } from '../js/market.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const classesIn = (z) => Object.keys(ASSETS).filter((c) => demandOf(ASSETS[c], z) > 0);
const buyersIn = (z) => Object.keys(BUYERS).filter((b) => BUYERS[b].zone === z);

// ---------------------------------------------------------------- zoneShare
test('zoneShare is a distribution over the sixteen districts on every day of the run', () => {
  for (let day = 1; day <= 90; day++) {
    const shares = ZONE_IDS.map((z) => zoneShare(day, z));
    near(sum(shares), 1, 1e-9);
    for (const s of shares) assert.ok(s > 0 && s <= 1 && Number.isFinite(s), `day ${day}`);
  }
  assert.equal(ZONE_IDS.length, 16);
});

test('the herd climbs the districts together: its centre moves from district 1 to the top of the avenue and widens as it goes', () => {
  const argmax = (day) => ZONE_IDS.reduce((best, z) => (zoneShare(day, z) > zoneShare(day, best) ? z : best), 1);
  const mean = (day) => sum(ZONE_IDS.map((z) => z * zoneShare(day, z)));
  assert.equal(argmax(1), 1, 'day 1: the herd is in the Scrap Yard');
  // The bell's centre is 1 + 14 x (day/90)^0.9, i.e. district 15 on day 90 (the doc comment says "towards district 16"); 16 itself is the thinnest tail of the run.
  assert.ok(argmax(90) >= 15, 'day 90: the herd is at the top of the avenue: ' + argmax(90));
  let prevArg = 0, prevMean = 0;
  for (let day = 1; day <= 90; day++) {
    assert.ok(argmax(day) >= prevArg, 'the peak never moves back (day ' + day + ')');
    assert.ok(mean(day) > prevMean - 1e-9, 'the mean never moves back (day ' + day + ')');
    prevArg = argmax(day); prevMean = mean(day);
  }
  assert.ok(mean(1) < 3 && mean(90) > 12, `mean ${mean(1)} -> ${mean(90)}`);
  // widening: the share of the single busiest district falls as the herd spreads out
  const peak = (day) => Math.max(...ZONE_IDS.map((z) => zoneShare(day, z)));
  assert.ok(peak(60) < peak(10), 'the herd spreads out: ' + peak(10) + ' -> ' + peak(60));
});

// ---------------------------------------------------------------- ghostCounts
test('ghostCounts: no ghosts or no demand means no crowd; the crowd scales with the number of ghosts', () => {
  assert.deepEqual(ghostCounts('s', 100, 1, 'pen', 0), { total: 0, byBuyer: {} });
  assert.deepEqual(ghostCounts('s', 100, 16, 'pen', 36), { total: 0, byBuyer: {} }, 'nobody wants a pen at the Global Exchange');
  const a = ghostCounts('s', 100, 1, 'pen', 36), b = ghostCounts('s', 100, 1, 'pen', 72);
  assert.ok(a.total > 0);
  near(b.total / a.total, 2, 1e-9);
  assert.deepEqual(ghostCounts('s', 100, 1, 'pen', 36), a, 'deterministic');
  assert.notDeepEqual(ghostCounts('other', 100, 1, 'pen', 36), a, 'a different world seed has a different crowd');
});

test('ghostCounts: each niche\'s volumes add up to the class total, for every class in every district, on several days', () => {
  for (const day of [1, 20, 55, 90]) {
    const hour = (day - 1) * 24;
    for (const z of ZONE_IDS) for (const cls of classesIn(z)) {
      const g = ghostCounts('t', hour, z, cls, 36);
      assert.ok(Number.isFinite(g.total) && g.total >= 0, `${cls}@${z}`);
      const parts = Object.values(g.byBuyer);
      for (const v of parts) assert.ok(v >= 0 && Number.isFinite(v));
      const anyFit = buyersIn(z).some((b) => fitOf(cls, b) >= 0.2);
      if (anyFit) near(sum(parts), g.total, 1e-6 * Math.max(1, g.total));
      for (const b of Object.keys(g.byBuyer)) assert.equal(BUYERS[b].zone, z, 'only buyers of this district');
    }
  }
});

test('ghostCounts: the crowd follows the herd up the avenue', () => {
  const crowd = (day, z) => sum(classesIn(z).map((c) => ghostCounts('t', (day - 1) * 24, z, c, 36).total));
  assert.ok(crowd(1, 1) > crowd(1, 12) * 3, 'day 1: starter districts are crowded, far ones empty');
  assert.ok(crowd(90, 15) > crowd(90, 1), 'day 90: the herd has left the Scrap Yard behind');
  assert.ok(crowd(1, 16) < crowd(1, 1) / 20);
});

test('ghostCounts: the obvious channel is crowded, and a meta guide drifts the herd to a second-best niche for ten days at a time', () => {
  // textbooks at Metro Hub: the trainer is the obvious buyer, the recruiter a decent second
  const early = ghostCounts('meta', (40.1 - 1) * 24, 5, 'textbooks', 36), late = ghostCounts('meta', (49.9 - 1) * 24, 5, 'textbooks', 36);
  const share = (g, b) => (g.byBuyer[b] || 0) / g.total;
  assert.ok(share(early, 'trainer') > 0.3);
  // at the start of a ten-day bucket 35% of the herd is pulled away from the obvious channel; by the end the pull has faded
  assert.ok(share(early, 'trainer') < share(late, 'trainer'), `trainer ${share(early, 'trainer')} -> ${share(late, 'trainer')}`);
  const moved = Object.keys({ ...early.byBuyer, ...late.byBuyer }).reduce((a, b) => a + Math.abs(share(early, b) - share(late, b)), 0);
  assert.ok(moved > 0.05, 'the herd moved: ' + moved);
});

// ---------------------------------------------------------------- Cohort
test('Cohort: with no peers it is the ghosts; peers\' published niches add on top', () => {
  const c = new Cohort({ seed: 'k', ghosts: 36 });
  const base = c.counts(48, 5, 'textbooks');
  assert.deepEqual(base, { total: ghostCounts('k', 48, 5, 'textbooks', 36).total, byBuyer: ghostCounts('k', 48, 5, 'textbooks', 36).byBuyer });
  c.setPeers([{ pid: 'P1', niches: { [nicheKey(5, 'textbooks', 'trainer')]: 4, [nicheKey(5, 'textbooks', 'recruiter')]: 1, [nicheKey(6, 'watches', 'x')]: 9 } }]);
  const withPeer = c.counts(48, 5, 'textbooks');
  near(withPeer.total, base.total + 5, 1e-9);
  near(withPeer.byBuyer.trainer, base.byBuyer.trainer + 4, 1e-9);
  near(withPeer.byBuyer.recruiter, base.byBuyer.recruiter + 1, 1e-9);
  assert.equal(c.counts(48, 6, 'watches').byBuyer.x, 9, 'another district\'s niche is counted where it lives');
  assert.deepEqual(base.byBuyer.trainer, ghostCounts('k', 48, 5, 'textbooks', 36).byBuyer.trainer, 'the ghosts\' own numbers were not mutated');
  c.upsert({ pid: 'P2', niches: { [nicheKey(5, 'textbooks', 'trainer')]: 6 } });
  near(c.counts(48, 5, 'textbooks').byBuyer.trainer, base.byBuyer.trainer + 10, 1e-9);
  c.setPeers([]);
  assert.equal(c.counts(48, 5, 'textbooks').total, base.total, 'peers leave, their crowd leaves');
});

test('Cohort: zero ghosts leaves only real classmates; counts are cached per six-hour bucket and refresh clears them', () => {
  const c = new Cohort({ seed: 'k', ghosts: 0 });
  assert.deepEqual(c.counts(10, 1, 'pen'), { total: 0, byBuyer: {} });
  c.upsert({ pid: 'P', niches: { [nicheKey(1, 'pen', 'student')]: 3 } });
  assert.equal(c.counts(10, 1, 'pen').total, 3);
  const g = new Cohort({ seed: 'k', ghosts: 36 });
  const x = g.counts(7, 2, 'radio');
  assert.equal(g.counts(11, 2, 'radio'), x, 'same bucket: the very same object');
  g.ghosts = 72; g.refresh();
  near(g.counts(7, 2, 'radio').total, x.total * 2, 1e-9);
  const y = g.counts(30, 2, 'radio');
  assert.notEqual(y, x, 'a later bucket is recomputed');
});

test('BUG: the crowd a niche sees depends only on the world and the 6-hour bucket, not on who asked first', () => {
  // js/cohort.js counts(): the bucket's cache is filled by the first query's own hour, so counts(245) is 10.90 after counts(240) but 11.08 asked cold. That makes the economy depend on UI
  // calls, and makes a restored game (empty cache) drift from the one that never stopped. Compute at the bucket start (or key the cache by hour) and the problem goes away.
  const a = new Cohort({ seed: 'k', ghosts: 36 }), b = new Cohort({ seed: 'k', ghosts: 36 });
  a.counts(240, 5, 'textbooks');
  assert.deepEqual(a.counts(245, 5, 'textbooks'), b.counts(245, 5, 'textbooks'), 'same question, same answer');
  const c = new Cohort({ seed: 'k', ghosts: 36 }), d = new Cohort({ seed: 'k', ghosts: 36 });
  c.counts(241, 5, 'textbooks'); d.counts(244, 5, 'textbooks');
  assert.deepEqual(c.counts(242, 5, 'textbooks'), d.counts(242, 5, 'textbooks'));
});

test('Cohort.allNiches lists every niche the radar and the instructor heat map can use', () => {
  const c = new Cohort({ seed: 'k', ghosts: 36 });
  const rows = c.allNiches(24 * 20);
  assert.ok(rows.length > 300, 'rows: ' + rows.length);
  const keys = new Set();
  for (const r of rows) {
    assert.ok(!keys.has(r.key), 'unique niche ' + r.key); keys.add(r.key);
    assert.equal(r.key, nicheKey(r.zone, r.cls, r.buyer));
    assert.equal(BUYERS[r.buyer].zone, r.zone);
    assert.ok(r.fit >= 0.3 && r.fit <= 1 && r.n >= 0 && r.n <= r.total + 1e-9 && Number.isFinite(r.total));
  }
  for (const z of ZONE_IDS) assert.ok(rows.some((r) => r.zone === z), 'district ' + z + ' has niches');
});

// ---------------------------------------------------------------- statistics
test('median and cohort statistics', () => {
  assert.equal(median([]), 0); assert.equal(median([5]), 5); assert.equal(median([3, 1, 2]), 2); assert.equal(median([4, 1, 3, 2]), 2.5);
  const snaps = [
    { nw: 10, autoEligible: false }, { nw: 10, autoEligible: false }, { nw: 10, autoEligible: false },
    { nw: 10000, autoEligible: true, lastAutoHour: 0 }, { nw: 20, autoEligible: true, lastAutoHour: 24 * 9 },
  ];
  const st = cohortStats(snaps, 24 * 10);
  assert.equal(st.n, 5); assert.equal(st.median, 10);
  assert.ok(st.gini > 0.65 && st.alertGini, 'one student holds nearly everything');
  assert.deepEqual(st.static3.map((s) => s.nw), [10000], 'only the one who has not automated for three days is static');
  const flat = cohortStats([{ nw: 5 }, { nw: 5 }, { nw: 5 }], 0);
  assert.equal(flat.gini, 0); assert.equal(flat.alertGini, false);
});

// ---------------------------------------------------------------- synthetic students
test('makeSynth builds a believable class: unique, deterministic, two different real Backgrounds each, favoured niches that exist', () => {
  for (const seed of ['demo', 'ROOM', 'solo-123']) {
    const class40 = makeSynth(40, seed);
    assert.equal(class40.length, 40);
    assert.equal(new Set(class40.map((s) => s.pid)).size, 40, 'unique ids for ' + seed);
    assert.deepEqual(makeSynth(40, seed), class40, 'deterministic');
    for (const s of class40) {
      assert.ok(s.pid.startsWith('SYN-') && s.synth === true && s.handle);
      assert.equal(s.perks.length, 2); assert.notEqual(s.perks[0], s.perks[1]);
      for (const p of s.perks) assert.ok(PERK_IDS.includes(p), p);
      assert.equal(s.favored.length, 3);
      for (const f of s.favored) {
        assert.ok(ZONE_IDS.includes(f.z));
        assert.ok(demandOf(ASSETS[f.cls], f.z) > 0, `${f.cls} sells in district ${f.z}`);
        assert.equal(BUYERS[f.buyer].zone, f.z);
      }
      assert.ok(s.anchors.length >= 5 && s.anchors.every(([d, v]) => d >= 0 && v > 0));
      assert.ok(s.sp > 0.6 && s.sp < 1.8 && s.idleFrom >= 28 && s.idleFrom < 58);
    }
  }
  assert.notDeepEqual(makeSynth(5, 'a'), makeSynth(5, 'b'));
  assert.equal(makeSynth(0).length, 0);
});

test('synthetic students climb all sixteen districts: net worth only ever opens the districts whose gates it has passed', () => {
  const crowd = makeSynth(240, 'sixteen');
  const reached = new Set();
  for (const st of crowd) {
    let last = 1;
    for (let day = 1; day <= 91; day += 2) {
      const snap = synthSnapshot(st, (day - 1) * 24);
      assert.ok(Number.isFinite(snap.nw) && snap.nw > 0, `${st.pid} day ${day} nw`);
      const expect = Math.max(1, ...ZONE_IDS.filter((z) => snap.nw >= ZONES[z].gate));
      assert.equal(snap.zones, expect, `${st.pid} day ${day}: nw ${snap.nw} opens district ${expect}`);
      reached.add(snap.zones);
      if (st.style === 'cautious' || st.style === 'creative') continue; // their small dips can cross a gate downward
      if (st.style !== 'leveraged' && st.style !== 'herd') { assert.ok(snap.zones >= last, `${st.pid}: districts do not close again`); last = snap.zones; }
    }
  }
  assert.deepEqual([...reached].sort((a, b) => a - b), ZONE_IDS, 'somebody gets to every district: ' + [...reached].sort((a, b) => a - b));
});

test('synthSnapshot has the shape the leaderboard, heat map and instructor view read', () => {
  const crowd = makeSynth(60, 'shape');
  for (const st of crowd) for (const day of [1, 14, 40, 75, 90]) {
    const sn = synthSnapshot(st, (day - 1) * 24);
    assert.equal(sn.pid, st.pid); assert.equal(sn.synth, true); assert.equal(sn.startCap, ASSETS.paperclip.base);
    assert.deepEqual(sn.perks, st.perks);
    assert.ok(sn.cash > 0 && sn.cash < sn.nw && sn.debt >= 0);
    assert.equal(sn.autoEligible, sn.nw >= MIL.m1);
    assert.equal(sn.pipelines === 0, sn.nw <= MIL.m1);
    assert.ok(sn.lastAutoHour <= sn.hour);
    for (const [key, n] of Object.entries(sn.niches)) {
      const [z, cls, buyer] = key.split('|');
      assert.ok(+z >= 1 && +z <= 16 && ASSETS[cls] && BUYERS[buyer], key);
      assert.ok(Number.isInteger(n) && n >= 1);
    }
    assert.ok(sn.cmAvg > 0 && sn.flags.insolvent === false);
    if (st.style === 'leveraged') near(sn.debt, sn.nw * 1.8, 1e-6);
  }
});

test('synthetic student styles behave as their names say', () => {
  const crowd = makeSynth(200, 'styles');
  const by = (style) => crowd.filter((s) => s.style === style);
  for (const s of by('idle')) {
    const frozen = synthSnapshot(s, (s.idleFrom + 5 - 1) * 24);
    near(synthSnapshot(s, (s.idleFrom + 30 - 1) * 24).nw, frozen.nw, 1e-6);      // they stop making money...
    assert.ok(synthSnapshot(s, (s.idleFrom + 30 - 1) * 24).lastAutoHour < (s.idleFrom - 1) * 24 + 1); // ...and the instructor sees they went static
  }
  for (const s of by('herd')) assert.ok(s.favored.every((f) => f.z <= 3), 'the herd stays in the starter districts');
  const lev = by('leveraged')[0], calm = { ...lev, style: 'cautious' }; // same path, only the dip differs
  const rel = (day) => synthSnapshot(lev, (day - 1) * 24).nw / synthSnapshot(calm, (day - 1) * 24).nw;
  near(rel(40), 1, 1e-9);
  assert.ok(rel(51) < 0.7, 'the leveraged student loses about 40% around day 51: ' + rel(51));
  near(rel(60), 1, 1e-9);
  assert.ok(synthSnapshot(by('creative')[0], 30 * 24).cmAvg > synthSnapshot(by('herd')[0], 30 * 24).cmAvg, 'creative students score higher Creativity');
});

test('synthetic flags: three classmates are caught proposing lopsided deals, one every three weeks, all well past the guardrail', () => {
  const crowd = makeSynth(11, 'flags');
  assert.deepEqual(synthFlags(crowd, 0), []);
  assert.equal(synthFlags(crowd, 12 * 24).length, 1);
  assert.equal(synthFlags(crowd, 33 * 24).length, 2);
  const all = synthFlags(crowd, 90 * 24);
  assert.equal(all.length, 3);
  for (const f of all) { assert.ok(f.variance > FMV_BAND); assert.ok(crowd.some((s) => s.pid === f.pid)); assert.ok(f.peer && f.peer !== f.pid); assert.ok(f.note); }
  assert.deepEqual(synthFlags([], 90 * 24), []);
});
