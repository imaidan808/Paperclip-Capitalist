// Roadmap item 10c, step zero: "First check what the engine does today at $0 with no crates: is there a real soft lock?" This is the check, as a scenario the suite replays.
//
// The scenario: on day 1 the player sells the one thing they own, the starting paperclip, to the Scrap Yard's liquidity pool (the Stock drawer's sell button, js/ui/drawers/stock.js, has no
// guard on a last crate). The pool pays the fair value less the district's friction: about four cents. They now have no stock, no pipeline, nothing in transit, and nothing earns: a lead
// pays for a crate and a manager runs a plot, so with neither the only way back is to buy a lot.
//
// What the engine does (measured 2026-11-16 over 200 seeds, `buyQuote` in js/engine.js: a lot costs its price times a multiplier the Deal Room's haggle sets between 0.6 and 1.4, never under a cent):
//   * at par (multiplier 1, which is what Quick plays: docs/ROADMAP.md item 5) no lot is affordable on any of the 90 days, in any seed: a SOFT LOCK. The cheapest lot of the first day is five cents;
//   * at the haggle floor (0.6) a lot is affordable at once in about half the seeds, and in every seed by day 15 at the latest: slow, not locked, but only for a player who can haggle.
// So the lock is real and narrow: a Quick-only player (or one who haggles badly) who sells the clip first. It is not a known fault the deploy may carry, so it is NOT marked todo (the Pages
// workflow stops on a todo test): the first test pins the fault as it is. When item 10c's lifeline is built, that test is the one to flip: the player finds a paperclip, and `stuckAtPar` is
// then false for every seed. The second test holds the floor case, which the lifeline must not make worse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './bot.mjs';

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const PAR = 1, FLOOR = 0.6, STEP = 4; // hours; lots arrive every 4 hours in the Scrap Yard (`lotEvery`), so looking every 4 hours misses none

/** A game on day 1 whose player has just sold the starting paperclip to the pool. */
function soldTheClip(seed) {
  const g = makeGame([], 'ops', seed), s = g.s;
  const r = g.sellPool([s.assets[0].id]);
  assert.ok(r.ok, 'the pool takes the starting paperclip: ' + r.msg);
  return g;
}
/** Whether some open lot costs no more than the player's cash at the multiplier `mult`. */
const canBuy = (g, mult) => g.s.zones.some((z) => (g.s.lots[z] || []).some((l) => g.buyQuote(z, l.id, { mult }).price <= g.s.cash));
/** The hours until a lot is first affordable at `mult`, or null if none is within `days`. */
function hoursToFirstLot(seed, mult, days = 90) {
  const g = soldTheClip(seed);
  for (let h = 0; h <= days * 24; h += STEP) {
    if (canBuy(g, mult)) return h;
    g.advanceTo(g.s.hour + STEP);
  }
  return null;
}

test('the scenario: after the clip is sold the player has about four cents and nothing that earns', () => {
  const g = soldTheClip(1), s = g.s;
  assert.ok(s.cash > 0 && s.cash < 0.05, `the pool pays under five cents for the clip (paid ${s.cash})`);
  assert.deepEqual([s.assets.length, s.pipes.length, s.freight.length, s.settle.length, s.escrow.length], [0, 0, 0, 0, 0]);
});

test('KNOWN FAULT, roadmap item 10c: at par prices a player who sold the clip can afford no lot in 90 days, in any seed (flip this when the lifeline is built)', () => {
  const stuckAtPar = SEEDS.map((seed) => hoursToFirstLot(seed, PAR) === null);
  assert.ok(stuckAtPar.every(Boolean), `at par every seed is locked for 90 days (these were not: ${SEEDS.filter((_, i) => !stuckAtPar[i])})`);
});

test('at the haggle floor the same player is slow but not locked: a first lot is affordable within 15 days in every seed', () => {
  for (const seed of SEEDS) {
    const h = hoursToFirstLot(seed, FLOOR, 30);
    assert.ok(h !== null && h <= 15 * 24, `seed ${seed}: first affordable lot at the floor after ${h} hours`);
  }
});
