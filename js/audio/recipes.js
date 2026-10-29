// The sound map as data (docs/AUDIO.md section 4): one entry per id, each with its meta (for the audition page and the tests) and a builder (variant params -> layers).
// Pitches are written as note names in D major pentatonic (D E F# A B), so a stray out-of-key fundamental is a test failure. This is the revision-2 map: 90 ids.
// A builder receives the variant's params merged with the caller's (`n`, `i`, `v`...) and `k`, the index of the pool member the engine picked (the frequent sounds rotate three equivalent
// timbres so the same one never plays twice in a row). It returns layers: objects, or arrays of them, nested as deep as is convenient.
import { TRIMS } from './trims.js';
import { mar, gls, bellL, click, wood, thump, paper, swoosh, stamp, coin, brass, horn, COINS, FALL, RISE, coins, sparkle, arp, ticks, pair, body, P5 } from './palette.js';

export const SOUNDS = [];
const S = (id, m) => SOUNDS.push({ id, ...m });

// =============================================================================================== INTERFACE (bus ui)
S('ui.tick', { bus: 'ui', tier: 'tiny', cd: 30, pan: 'center',
  trigger: 'Any press of a button, tab or icon that has no sound of its own (capture-phase click on `.btn`, `.ibtn`, `[data-act]`). Variant `light` for ghost, small and icon buttons; `full` for primary and `.big` ones',
  meaning: 'Neutral: "I heard you"', recipe: 'light: wood D6 sine 28 ms + 3.2 kHz noise tick; full: marimba D5 120 ms + the tick', visual: 'Pressed state, focus ring, the action\'s own result',
  variants: { light: {}, full: { full: 1 } }, pool: 3, dur: 0.16, build: (p) => p.full ? [mar(['D5', 'E5', 'F#5'][p.k | 0], 0, 0.5, 0.12), click(0, 0.2)] : [{ k: 'tone', f: ['D6', 'E6', 'F#6'][p.k | 0], a: 0.0008, d: 0.028, g: 0.6 }, click(0, 0.25)] });

S('ui.toggle', { bus: 'ui', tier: 'tiny', cd: 60, pan: 'center',
  trigger: 'A checkbox, switch or `aria-pressed` button changes: Assist, Interface/Game/Ambient switches, the "Show me" button, Ledger and badge-list disclosures',
  meaning: 'On rises, off falls', recipe: 'on: wood A4 then D5 (45 ms apart); off: D5 then A4, 20% softer', visual: 'The control\'s checked or pressed state',
  variants: { on: {}, off: { off: 1 } }, dur: 0.2, build: (p) => p.off ? [wood('D5', 0, 0.4), wood('A4', 0.045, 0.34)] : [wood('A4', 0, 0.4), wood('D5', 0.045, 0.5)] });

S('ui.select', { bus: 'ui', tier: 'tiny', cd: 40, pan: 'center',
  trigger: 'A tab, segmented control or option is chosen: dock-drawer tabs, Market sections, Crew tabs, Travel and Codex tabs, quest and badge filters, specialty cards',
  meaning: 'You moved to the nth item', recipe: 'marimba, one pentatonic step per index: D5 E5 F#5 A5 B5 D6 (90 ms)', visual: 'The pressed tab and the new panel',
  variants: { i0: { i: 0 }, i5: { i: 5 } }, dur: 0.2, build: (p) => [mar(P5[5 + p.i], 0, 0.45, 0.09)] });

S('ui.crate', { bus: 'ui', tier: 'tiny', cd: 40, pan: 'center',
  trigger: 'A crate is ticked or unticked (Stock list, "Tick all", Clear, a crate clicked in the world); `n` is how many are ticked now',
  meaning: 'Stacking: each pick climbs a step, clearing steps down', recipe: 'pick: wood knock on the nth note of D4 E4 F#4 A4 B4 D5 E5 F#5; clear: two soft falling knocks A4 D4', visual: 'Checkbox, the "N crates ticked" bar, the crate\'s highlight in the world',
  variants: { pick1: { n: 1 }, pick8: { n: 8 }, clear: { clear: 1 } }, dur: 0.2, build: (p) => p.clear ? [wood('A4', 0, 0.3, 0.05), wood('D4', 0.06, 0.26, 0.07)] : [wood(P5[Math.min(7, p.n - 1)], 0, 0.5, 0.06), thump('D3', 'D2', 0, 0.2, 0.05)] });

S('ui.drawer-open', { bus: 'ui', tier: 'tiny', cd: 120, pan: 'center',
  trigger: 'A drawer opens: a dock button, keys 1 to 7, a building or board clicked in the world (`ctx.emit({type:"ui", ui:"open-drawer", id})`). Seven motifs, one per drawer',
  meaning: 'A panel slides out; each motif says which', recipe: 'paper slide (pink noise 900 to 2600 Hz, 160 ms) + motif. stock: wood knock D4; market: marimba E5 + a paper tick; crew: bell A5; bank: vault tone D3 + glass F#5; travel: glass E5 to A5; codex: page flip + glass D5; quests: brass-lite A4', visual: 'The drawer itself, the pressed dock icon',
  variants: { stock: { m: 'stock' }, market: { m: 'market' }, crew: { m: 'crew' }, bank: { m: 'bank' }, travel: { m: 'travel' }, codex: { m: 'codex' }, quests: { m: 'quests' } }, dur: 0.5,
  build: (p) => [swoosh(0, 0.16, 900, 2600, 0.22), ...({
    stock: () => [wood('D4', 0.05, 0.45, 0.07), thump('D3', 'D2', 0.05, 0.3, 0.08)],
    market: () => [mar('E5', 0.05, 0.4, 0.14), paper(0.04, 0.05, 0.12)],
    crew: () => [bellL('A5', 0.06, 0.28, 0.5)],
    bank: () => [{ k: 'tone', f: 'D3', t: 0.04, a: 0.01, d: 0.3, g: 0.4 }, gls('F#5', 0.1, 0.22, 0.4), ...body(0.04, 0.3, 'D4', 0.1)],
    travel: () => [gls('E5', 0.04, 0.3, 0.3), gls('A5', 0.13, 0.3, 0.4)],
    codex: () => [paper(0.1, 0.12, 0.2), gls('D5', 0.14, 0.3, 0.45)],
    quests: () => [brass('A4', 0.04, 0.3, 0.05, 0.2, 600, 1800)],
  })[p.m]()] });

S('ui.drawer-close', { bus: 'ui', tier: 'tiny', cd: 120, pan: 'center',
  trigger: 'A drawer closes: its Close button, Escape, a phone sheet dragged shut, a dock button pressed again',
  meaning: 'The panel slides back; the mirror of open', recipe: 'paper slide 2600 to 900 Hz (120 ms) + soft falling tone A4 to D4', visual: 'The drawer leaves, focus returns to its dock button',
  variants: { d: {} }, dur: 0.3, build: () => [swoosh(0, 0.13, 2600, 900, 0.18), { k: 'tone', f: 'A4', f2: 'D4', gl: 0.1, a: 0.004, d: 0.12, g: 0.22 }] });

S('ui.dialog-open', { bus: 'ui', tier: 'tiny', cd: 150, pan: 'center',
  trigger: 'The shared `<dialog>` opens with no sound of its own (Help, Menu, breakdowns, settings, confirm sheets). Seen by a MutationObserver on `#dlg[open]`',
  meaning: 'A page is put in front of you', recipe: 'paper rustle (hp 1.5 kHz, 120 ms) + marimba A4 soft', visual: 'The dialog and its focus',
  variants: { d: {} }, dur: 0.3, build: () => [paper(0, 0.12, 0.26, 1500, 5000), mar('A4', 0.03, 0.3, 0.22)] });

S('ui.dialog-close', { bus: 'ui', tier: 'tiny', cd: 150, pan: 'center',
  trigger: 'The dialog closes without a result sound (Close, Cancel, Escape, a click on the backdrop)',
  meaning: 'The page is put away', recipe: 'short falling paper rustle + marimba D4 soft', visual: 'The dialog leaves, focus returns',
  variants: { d: {} }, dur: 0.25, build: () => [paper(0, 0.09, 0.2, 4200, 1600), mar('D4', 0.02, 0.28, 0.16)] });

S('ui.ask', { bus: 'ui', tier: 'tiny', cd: 300, pan: 'center',
  trigger: 'A confirm sheet opens (`confirmBox`): normal for Sell to the pool, Release, Exit; `danger` for Delete and restart, Leave the Academy',
  meaning: 'A question that is yours to answer', recipe: 'normal: marimba A4 then D5, the last one held open; danger: glass F#4 then D4 (falling minor third) over a low knock', visual: 'The sheet and its two buttons',
  variants: { normal: {}, danger: { danger: 1 } }, dur: 0.6, build: (p) => p.danger ? [gls('F#4', 0, 0.36, 0.3), gls('D4', 0.13, 0.4, 0.5), thump('D3', 'D2', 0.13, 0.3, 0.12)] : [mar('A4', 0, 0.4, 0.2), mar('D5', 0.1, 0.45, 0.45)] });

S('ui.refuse', { bus: 'ui', tier: 'tiny', cd: 250, pan: 'center',
  trigger: 'The engine refuses an action (`say(r)` with `r.ok === false`: not enough cash, storage full, locked, blocked proposal, "That lot is gone")',
  meaning: 'A short low "no", never a buzzer', recipe: 'two soft taps: triangle D3 then A2 (110 ms apart) over a dull knock, plus a mid body (a sine D4 and a knock at 300 to 600 Hz) so a laptop speaker has something to play', visual: 'A bad toast with the reason in words',
  variants: { r: {} }, dur: 0.3, build: () => [{ k: 'tone', f: 'D3', type: 'triangle', a: 0.003, d: 0.1, g: 0.7, lp: [900, 0.7] }, { k: 'tone', f: 'A2', type: 'triangle', t: 0.11, a: 0.003, d: 0.16, g: 0.7, lp: [800, 0.7] }, { k: 'noise', c: 'pink', a: 0.001, d: 0.04, g: 0.3, lp: [700, 0.7] }, ...body(0.01, 0.9, 'D4', 0.12, 'A4')] });

S('ui.nudge', { bus: 'ui', tier: 'tiny', cd: 400, pan: 'center',
  trigger: 'A warn toast that is advice and not a failure ("Tick a crate first", "Pick one of your crates first", "Slide to an amount first"), an Academy hint, an Academy lesson that cannot be finished',
  meaning: 'Gentle "not yet": look again', recipe: 'glass E4 with a third partial, 180 ms, over a wood tick', visual: 'The toast, or the hint card',
  variants: { n: {} }, dur: 0.3, build: () => [gls('E4', 0, 0.45, 0.18), ...wood('E4', 0, 0.2, 0.03)] });

S('ui.ok', { bus: 'ui', tier: 'tiny', cd: 150, pan: 'center',
  trigger: 'A small success with no richer sound: a good toast on its own ("Copied", "Now putting $x to work", proposal sent, pause or release confirmed), a save',
  meaning: 'Done, small', recipe: 'marimba A4 then D5 (70 ms apart) + a glass shimmer D6 at 10%', visual: 'The good toast',
  variants: { o: {} }, dur: 0.5, build: () => [mar('A4', 0, 0.4, 0.14), mar('D5', 0.07, 0.45, 0.28), gls('D6', 0.07, 0.1, 0.3)] });

S('ui.slider', { bus: 'ui', tier: 'tiny', cd: 80, pan: 'center',
  trigger: 'A range input (Bank amount, quick-pick percentages, Crew allocation, Deal Room dial slider, master volume) crosses a detent: every 10% of its travel, at most 12 a second, and the last one when the thumb is let go',
  meaning: 'Pitch follows value: low is less, high is more', recipe: 'wood tick on the nth of D4 E4 F#4 A4 B4 D5 E5 F#5 A5 B5 D6; at 0% a low thump D3, at 100% a glass ping D6 + A6', visual: 'The slider thumb, the value text',
  variants: { mid: { v: 5 }, top: { v: 10, end: 1 }, zero: { v: 0, zero: 1 } }, dur: 0.4,
  build: (p) => p.zero ? [thump('D3', 'D2', 0, 0.5, 0.1), ...wood('D4', 0, 0.2), ...body(0, 0.45, 'D4', 0.1)] : p.end ? [gls('D6', 0, 0.4, 0.3), gls('A6', 0.04, 0.3, 0.3)] : wood([...P5][Math.min(10, p.v)], 0, 0.45, 0.03) });

S('ui.count-up', { bus: 'ui', tier: 'tiny', cd: 600, pan: 'center',
  trigger: 'A number counts up (`countUp` in js/ui/polish.js: the Deal Room result\'s XP, the lesson reward): one sound for the whole count, 700 ms',
  meaning: 'Numbers are adding up', recipe: '12 ticks accelerating, each a marimba note climbing D5 to D6, ending on a glass D6', visual: 'The number ticking to its final value',
  variants: { c: {} }, dur: 0.6, build: () => [...Array.from({ length: 7 }, (_, i) => mar(P5[Math.min(10, 5 + Math.floor(i * 0.85))], 0.3 * (i / 6) ** 1.35, 0.22, 0.05)), gls('D6', 0.31, 0.3, 0.2)] });

// =============================================================================================== CLOCK, CAMERA, WORLD
S('clock', { bus: 'ui', tier: 'tiny', cd: 100, pan: 'center',
  trigger: 'HUD clock: the play and pause button, the speed select (`#spd`, 0.25x to 64x)',
  meaning: 'Time stops, time runs, time gets faster', recipe: 'pause: marimba F#4 over a falling tone A3 to D3 (180 ms); resume: rising A3 to F#4; speed: n+1 ticks for the nth speed, quicker each step, on rising notes', visual: 'The button\'s icon and `aria-pressed`, the speed value',
  variants: { pause: { v: 'pause' }, resume: { v: 'resume' }, speed4: { v: 'speed', i: 4 } }, dur: 0.5,
  build: (p) => p.v === 'pause' ? [mar('A4', 0, 0.36, 0.1), mar('F#4', 0.055, 0.45, 0.2), { k: 'tone', f: 'A3', f2: 'D3', gl: 0.16, a: 0.005, d: 0.2, g: 0.4 }]
    : p.v === 'resume' ? [{ k: 'tone', f: 'D3', f2: 'A3', gl: 0.12, a: 0.005, d: 0.16, g: 0.35 }, mar('F#4', 0.09, 0.45, 0.25)]
      : Array.from({ length: p.i + 1 }, (_, i) => mar(P5[3 + i], i * (0.075 - p.i * 0.008), 0.34, 0.07)) });

S('cam', { bus: 'ui', tier: 'tiny', cd: 150, pan: 'center',
  trigger: 'Camera buttons (+, -, show the whole island, back to my district) and a wheel or pinch zoom (once per 150 ms, never per frame)',
  meaning: 'In rises, out falls; fit opens wide; home comes back', recipe: 'in: air sweep 600 to 1800 Hz + sine D5 to A5; out: reverse; fit: sweep up then down; home: wood knock + glass A5 to D5', visual: 'The camera itself',
  variants: { in: { v: 'in' }, out: { v: 'out' }, fit: { v: 'fit' }, home: { v: 'home' } }, dur: 0.4,
  build: (p) => p.v === 'in' ? [swoosh(0, 0.13, 600, 1800, 0.2), { k: 'tone', f: 'D5', f2: 'A5', gl: 0.1, a: 0.004, d: 0.12, g: 0.16 }]
    : p.v === 'out' ? [swoosh(0, 0.13, 1800, 600, 0.2), { k: 'tone', f: 'A5', f2: 'D5', gl: 0.1, a: 0.004, d: 0.12, g: 0.16 }]
      : p.v === 'fit' ? [swoosh(0, 0.12, 700, 2200, 0.18), swoosh(0.12, 0.14, 2200, 700, 0.14)]
        : [...wood('D4', 0, 0.4, 0.07), gls('A5', 0.05, 0.22, 0.3), gls('D5', 0.12, 0.22, 0.35)] });

S('world.locked', { bus: 'game', tier: 'tiny', cd: 400, pan: 'object x',
  trigger: 'A locked gate, plot, board or district is clicked ("... opens at $x net worth", "Not open yet", "Resolve your audit")',
  meaning: 'Shut. Not yet', recipe: 'chain rattle (4 noise bursts at 3.5 kHz, 35 ms apart) + two dull knocks D3 and A2 + a faint metal ting A5', visual: 'Warn toast with the gate\'s price in words',
  variants: { l: {} }, dur: 0.3, build: () => [...ticks(4, 0, 0.035, 0.32, 3500), ...wood('D3', 0.02, 0.5, 0.08), ...wood('A2', 0.15, 0.5, 0.1), gls('A5', 0.02, 0.1, 0.12), ...wood('D4', 0.02, 0.4, 0.08), ...body(0.15, 0.7, 'D4', 0.12, 'A4')] });

S('world.step', { bus: 'game', tier: 'tiny', cd: 280, pan: 'player x',
  trigger: 'Your character takes a step while walking between districts or to a ground click: one step every 0.3 s; never for NPCs',
  meaning: 'You are moving', recipe: 'soft step: a thump gliding from A3 or D3 down to D2 + gravel noise lowpassed at 1.2 kHz; two timbres in rotation', visual: 'The character walking, dust puffs',
  variants: { a: {}, b: { b: 1 } }, rotate: true, dur: 0.15, build: (p) => [{ k: 'tone', f: p.b ? 'A3' : 'D3', f2: 'D2', gl: 0.04, a: 0.002, d: 0.06, g: 0.18 }, { k: 'noise', c: 'brown', a: 0.002, d: 0.05, g: 0.08, lp: [p.b ? 900 : 1300, 0.7] }, { k: 'noise', c: 'pink', a: 0.002, d: 0.045, g: 2.8, bp: [p.b ? 520 : 700, 0.9], main: true }] }); // the gravel: a band at 500 to 700 Hz is the part of a footstep a small speaker plays

S('zone.enter', { bus: 'game', tier: 'tiny', cd: 1500, pan: 'center',
  trigger: 'Your district changes (`U.zone`): travel, a quest link, the map. The note pair depends on the district\'s tier (1 to 4)',
  meaning: 'You have arrived somewhere', recipe: 'air glide 400 to 1600 Hz (300 ms) + a two-note marimba tag: tier 1 D4 A4, tier 2 E4 B4, tier 3 F#4 D5, tier 4 A4 E5', visual: 'The camera moves, the district name tag',
  variants: { t1: { t: 1 }, t4: { t: 4 } }, dur: 0.7,
  build: (p) => { const T = { 1: ['D4', 'A4'], 2: ['E4', 'B4'], 3: ['F#4', 'D5'], 4: ['A4', 'E5'] }[p.t]; return [swoosh(0, 0.3, 400, 1600, 0.16), mar(T[0], 0.1, 0.4, 0.2), mar(T[1], 0.22, 0.45, 0.35)]; } });

S('buyer.arrive', { bus: 'game', tier: 'tiny', cd: 6000, pan: 'buyer x',
  trigger: 'A new buyer appears in the district you are in (diff of `s.leads[U.zone]` ids at each render), at most one per 6 s and only at speed 4x or slower',
  meaning: 'The shop door bell: someone came in', recipe: 'two door-bell dings D6 then A5 (glass partials, 350 ms)', visual: 'The buyer walking in with a bubble, the Market badge',
  variants: { b: {} }, dur: 0.8, build: () => [bellL('D6', 0, 0.3, 0.35), bellL('A5', 0.12, 0.3, 0.45)] });

S('buyer.urgent', { bus: 'game', tier: 'medium', cd: 3000, pan: 'buyer x',
  trigger: 'A new buyer with an urgent `need` that one of your sound crates can serve arrives in your district',
  meaning: 'Someone needs what you have, now', recipe: 'three rising door-bell dings A5 D6 F#6 over a wood tap', visual: 'The buyer\'s "urgent: needs" bubble, the Market badge count',
  variants: { u: {} }, dur: 0.8, build: () => [bellL('A5', 0, 0.3, 0.4), bellL('D6', 0.1, 0.32, 0.4), bellL('F#6', 0.2, 0.34, 0.6), ...wood('D4', 0, 0.3, 0.06)] });

S('day.turn', { bus: 'game', tier: 'tiny', cd: 2500, pan: 'center',
  trigger: 'The `day` event, only at speed 4x or slower and not while a dialog is open',
  meaning: 'A new day: bounties, royalties and rent have just landed', recipe: 'soft tower-clock chime: glass D4 + A4 (600 ms) + a paper flip', visual: 'The HUD day counter',
  variants: { d: {} }, dur: 1.1, build: () => [gls('D4', 0, 0.4, 0.7), gls('A4', 0.1, 0.34, 0.7), paper(0.01, 0.08, 0.14, 2000, 5000)] });

// =============================================================================================== MONEY AND TRADE
// A gain climbs (2.2): the last coin of every size is higher than the first. Size l used to end on D6 after a run up to E7 (the index (i * 3 + 1) % 8 of COINS), which is a fall.
const L_COINS = ['A6', 'D7', 'B6', 'E7', 'D7', 'E7'];
const sizeSpec = {
  s: { n: 1, span: 0, g: 0.5, set: ['A6'] }, m: { n: 3, span: 0.12, g: 0.34, set: ['D6', 'E6', 'A6'], seq: true }, l: { n: 6, span: 0.3, g: 0.3, set: L_COINS, seq: true }, xl: { n: 10, span: 0.5, g: 0.3, set: ['A6', 'D7', 'B6', 'E7', 'D7', 'A6', 'E7', 'D7', 'E7', 'D7'], seq: true },
};
S('cash.in', { bus: 'game', tier: 'tiny', cd: 120, pan: 'source x, else center',
  trigger: 'Money arrives (see "Sizing money"): pool and manager proceeds, loan drawn, royalties, a released manager, exits. Size s, m, l, xl by `moneySize(amount, netWorth)`; `settle` is the quiet version for cash that lands after a delay',
  meaning: 'Coins: bigger sums are brighter and longer', recipe: 's: one coin A6; m: three coins A6 E7 D7; l: six coins + register ding D6; xl: ten coins + bell chord D6 A6 + soft brass stab D3 + glass shower; settle: four soft coins, lowpassed', visual: 'Cash in the HUD flashes green (`.rs.up`), a "+$" pop in the world',
  variants: { s: { z: 's' }, m: { z: 'm', tier: 'medium' }, l: { z: 'l', tier: 'medium' }, xl: { z: 'xl', tier: 'loud' }, settle: { z: 'settle' } }, pool: 3, dur: 1.5,
  build: (p) => { if (p.z === 'settle') return coins(4, 0.5, 0, 0.2, RISE, { lp: [3600, 0.7] }, true); const q = sizeSpec[p.z], b = p.z === 's' ? coins(1, 0, 0, q.g, [['A6', 'D7', 'E6'][p.k | 0]], {}, true) : coins(q.n, q.span, 0, q.g, q.set, {}, !!q.seq);
    if (p.z === 'l') b.push(bellL('D6', 0.04, 0.22, 0.7, { ding: true }));
    if (p.z === 'xl') b.push(bellL('D6', 0.05, 0.1, 1.1, { fam: 'bell', ding: true }), bellL('A6', 0.05, 0.12, 1.0, { fam: 'bell', ding: true }), brass('D3', 0, 0.14, 0.1, 0.5, 400, 1800), sparkle(9, 0.2, 0.26, 11, 0.05), gls('D7', 0.06, 0.3, 0.9), gls('A7', 0.1, 0.26, 0.9), { k: 'noise', c: 'white', t: 0.04, a: 0.25, d: 0.5, g: 0.035, hp: [4800, 0.7] });
    return b; } });

S('cash.out', { bus: 'game', tier: 'tiny', cd: 120, pan: 'source x, else center',
  trigger: 'Money leaves: a lot bought, repair, hire, upgrade, freight, client acquisition, loan repaid, fines, SLA penalties. Sizes s, m, l',
  meaning: 'Muted coins that fall: spending is quieter and darker than earning', recipe: 'the coin cascade through a 2.2 kHz lowpass, each coin a step lower (D6 B5 A5 E5 D5), with a pouch thud; l ends on a vault latch D2 + click', visual: 'Cash in the HUD flashes red (`.rs.down`)',
  variants: { s: { z: 1 }, m: { z: 3 }, l: { z: 5, tier: 'medium' } }, dur: 1.0,
  build: (p) => [...coins(p.z, 0.04 + p.z * 0.05, 0, 0.28, FALL, { lp: [2200, 0.7] }, true), { k: 'noise', c: 'brown', a: 0.004, d: 0.08, g: 0.3, lp: [800, 0.7] }, ...(p.z >= 5 ? [thump('D3', 'D2', 0.3, 0.5, 0.14), click(0.32, 0.25, 2000), ...body(0.3, 0.5, 'D4', 0.12)] : [])] });

S('sale.win', { bus: 'game', tier: 'medium', cd: 300, pan: 'buyer x',
  trigger: '`pitch` event with `outcome: "win"` (sold above fair value). Played together with `cash.in` sized by `price`',
  meaning: 'The cash register: a good sale', recipe: 'drawer thump A3 to D3 + register bell A5 with four partials (700 ms) + a short "ching" D7', visual: 'Coins thrown in the world, a good toast, the Deal Room result',
  variants: { w: {} }, dur: 1.1, build: () => [thump('A3', 'D3', 0, 0.7, 0.1), bellL('A5', 0.03, 0.4, 0.7), bellL('D7', 0.1, 0.26, 0.3)] }); // the ching is 70 ms behind the bell and 4 dB under it, so the gain is heard to rise (it was 10.7 dB under, 20 ms behind: one flat chord)

S('sale.pioneer', { bus: 'game', tier: 'medium', cd: 300, pan: 'buyer x',
  trigger: '`pitch` event with `outcome: "pioneer"` (a win in a niche nobody else is selling into)',
  meaning: 'You found something new: the register plus a rising sparkle', recipe: 'sale.win + a glass arpeggio D6 A6 D7 E7 rising in 70 ms steps + a low brass swell D3', visual: 'Coins and sparks, "Pioneer sale" title, the Creativity Multiplier in the result',
  variants: { p: {} }, dur: 1.5, build: () => [thump('A3', 'D3', 0, 0.7, 0.1), bellL('A5', 0.03, 0.36, 0.7), ...arp(['D6', 'A6', 'D7', 'E7'], 0.07, (n, t) => gls(n, 0.15 + t, 0.2, 0.55)), brass('D3', 0.1, 0.22, 0.12, 0.5, 400, 1600)] });

S('sale.herd', { bus: 'game', tier: 'medium', cd: 300, pan: 'buyer x',
  trigger: '`pitch` event with `outcome: "herd"` (sold into a crowded niche, whatever it paid)',
  meaning: 'Money, but a hollow one: the herd is crowded', recipe: 'h (lost money in the crowd): drawer thump + a dull bell A4 (lowpass 2 kHz) then a soft falling pair B3 to A3 over a low shuffle; hw (it paid, whatever the crowd): the thump and the dull bell, no falling pair', visual: '"Sold into the herd" title and the saturation lesson',
  variants: { h: {}, hw: { w: 1 } }, dur: 1.0, build: (p) => p.w ? [thump('A3', 'D3', 0, 0.6, 0.1), bellL('A4', 0.03, 0.34, 0.5, { lp: [2000, 0.7] })] : [thump('A3', 'D3', 0, 0.6, 0.1), bellL('A4', 0.03, 0.34, 0.5, { lp: [2000, 0.7] }), { k: 'tone', f: 'B3', type: 'triangle', t: 0.25, a: 0.01, d: 0.18, g: 0.34, lp: [900, 0.7] }, { k: 'tone', f: 'A3', type: 'triangle', t: 0.4, a: 0.01, d: 0.3, g: 0.34, lp: [800, 0.7] }, { k: 'noise', c: 'brown', t: 0.1, a: 0.05, d: 0.3, g: 0.12, lp: [400, 0.7] }, ...body(0.25, 0.4, 'D4', 0.14)] });

S('sale.flat', { bus: 'game', tier: 'medium', cd: 300, pan: 'buyer x',
  trigger: '`pitch` event with `outcome: "flat"` (sold at or below fair value)',
  meaning: 'A sale, no more: plain, no shine', recipe: 'drawer thump + a single bell D5, short (300 ms), no overtones above the third', visual: '"Sold, no gain" or "Sold below market"',
  variants: { f: {} }, dur: 0.6, build: () => [thump('A3', 'D3', 0, 0.6, 0.1), { k: 'bank', f: 'D5', t: 0.03, a: 0.001, g: 0.4, p: [[1, 1, 0.3], [2, 0.5, 0.2], [3, 0.2, 0.1]] }] });

S('sale.reject', { bus: 'game', tier: 'medium', cd: 300, pan: 'buyer x',
  trigger: '`pitch` with `outcome: "rejected"` and no scam: the buyer had no use for it (`nofit`), or spotted a counterfeit (`fake`)',
  meaning: 'The buyer said no. A counterfeit is a coin that clunks and does not ring', recipe: 'nofit: paper shake + the refuse pair D3 A2; fake: a dull metal clunk (a thump + two short, non-ringing partials) with a rattle and a falling B3 to D3', visual: 'Buyer walks off, "No sale" or "Counterfeit spotted" title, bad toast',
  variants: { nofit: {}, fake: { fake: 1 } }, dur: 0.7,
  build: (p) => p.fake ? [thump('D3', 'D2', 0, 0.7, 0.1), { k: 'bank', f: 'A5', a: 0.001, g: 0.3, p: [[1, 1, 0.05], [1.5, 0.7, 0.04]], lp: [1500, 0.7] }, ...ticks(5, 0.04, 0.03, 0.22, 2800), { k: 'tone', f: 'B3', f2: 'D3', gl: 0.2, t: 0.1, type: 'triangle', a: 0.01, d: 0.25, g: 0.4, lp: [900, 0.7] }, ...body(0.02, 0.45, 'D4', 0.12, 'A4')]
    : [paper(0, 0.1, 0.25, 1400, 2200), { k: 'tone', f: 'D3', type: 'triangle', t: 0.04, a: 0.003, d: 0.1, g: 0.6, lp: [900, 0.7] }, { k: 'tone', f: 'A2', type: 'triangle', t: 0.15, a: 0.003, d: 0.16, g: 0.6, lp: [800, 0.7] }, ...body(0.04, 0.9, 'D4', 0.12, 'A4')] });

S('sale.scam', { bus: 'game', tier: 'medium', cd: 600, pan: 'buyer x',
  trigger: '`pitch` with `outcome: "rejected"` while a `scam` note has just been sent (or `reason: "scam"`): an unverified fraudster took the crate and paid nothing',
  meaning: 'You were swindled: coins drain away, a door slams', recipe: 'muted coins falling in pitch, a comic slide D4 to D3 (450 ms), a door thump and a low horn blip', visual: '"Scammed" title, bad toast, the crate vanishes',
  variants: { s: {} }, dur: 1.0, build: () => [...coins(5, 0.35, 0, 0.26, FALL, { lp: [2200, 0.7] }, true), { k: 'tone', f: 'D4', f2: 'D3', gl: 0.45, type: 'triangle', t: 0.1, a: 0.01, d: 0.5, g: 0.45, lp: [1000, 0.7] }, thump('D3', 'D2', 0.5, 0.7, 0.14), ...horn('A3', 'A2', 0.52, 0.22, 0.05, 0.2), ...body(0.5, 0.5, 'D4', 0.14)] });

S('buy.lot', { bus: 'game', tier: 'medium', cd: 300, pan: 'lot x',
  trigger: '`buy` event. Never reads `fake` or the condition truth (that would give the lot away); `cond: "broken"` is public and adds a rattle. Played with `cash.out` sized by `price`',
  meaning: 'A crate lands on your shelf and the purse gets lighter', recipe: 'crate thump A2 to D2 + wood knock + pallet slide (noise 900 Hz); broken adds three metal rattles and a glass clink', visual: 'The pallet drops in the world, a toast, cash falls',
  variants: { ok: {}, broken: { b: 1 } }, dur: 0.6,
  build: (p) => [thump('A2', 'D2', 0, 0.8, 0.16), ...wood('D4', 0.01, 0.5, 0.07), { k: 'noise', c: 'pink', t: 0.06, a: 0.02, d: 0.12, g: 0.2, bp: [900, 0.8, 500] }, ...body(0.01, 0.6, 'D4', 0.12), ...(p.b ? [...ticks(3, 0.1, 0.045, 0.24, 2600), gls('A5', 0.1, 0.12, 0.1)] : [])] });

S('pool.sell', { bus: 'game', tier: 'medium', cd: 600, pan: 'center',
  trigger: '`sell-pool` event. Played with `cash.in` sized by `total` (the cash lands after a delay: `cash.in settle` plays then)',
  meaning: 'Crates go down the chute for a lump sum', recipe: 'chute slide (noise sweeping 1800 to 600 Hz, 500 ms) + three thumps + a soft register ding D5', visual: 'Crates leave the shelf, a good toast',
  variants: { p: {} }, dur: 1.0, build: () => [swoosh(0, 0.5, 1800, 600, 0.3), thump('A2', 'D2', 0.15, 0.5, 0.1), thump('A2', 'D2', 0.28, 0.5, 0.1), thump('A2', 'D2', 0.42, 0.55, 0.12), bellL('D5', 0.45, 0.22, 0.5), ...body(0.28, 0.5, 'D4', 0.14)] });

S('streak', { bus: 'game', tier: 'tiny', cd: 400, pan: 'center',
  trigger: '`streak` event (a second win in a row or more), layered on the sale sound; `n` is the length (capped at 6 notes)',
  meaning: 'On a roll: each win climbs a step', recipe: 'n glass notes rising through the pentatonic from D6 in 35 ms steps, the last one held', visual: 'The "deal streak n" line in the result card',
  variants: { n2: { n: 2 }, n6: { n: 6 } }, dur: 0.8, build: (p) => Array.from({ length: p.n }, (_, i) => gls(P5[10 + i], i * 0.035, 0.26, i === p.n - 1 ? 0.5 : 0.2)) });

S('manager.cycle', { bus: 'game', tier: 'tiny', cd: 400, pan: 'building x',
  trigger: '`cycle` event (a manager finished a run). Gains: a coin; losses: a muted tink. Many at once are merged into one sound; none above 16x speed except one a second',
  meaning: 'Your people earned (or lost) money while you were away', recipe: 'gain: one high coin D7 over a faint building thud (the pool rotates D7, A6, D6); loss: one muted tink D5, lowpassed at 1.8 kHz', visual: 'The "+$x" pop above the building',
  variants: { gain: {}, loss: { loss: 1 } }, pool: 3, dur: 0.4, build: (p) => p.loss ? coin('D5', 0, 0.3, 0.1, { lp: [1800, 0.7] }) : [coin(['D7', 'A6', 'D6'][p.k | 0], 0, 0.36, 0.12), thump('A3', 'D3', 0, 0.2, 0.05)] });

// =============================================================================================== DEAL ROOM (bus game: moves are game moves)
S('deal.open', { bus: 'game', tier: 'medium', cd: 500, pan: 'center',
  trigger: 'The Deal Room sheet opens (`#dlg.deal`). `sell` for a buyer, `buy` for a lot, `fix` for a crate on the bench',
  meaning: 'You sat down at the table', recipe: 'sell: shop-door bell A5 + paper + marimba D5; buy: stall slide (noise 500 to 1500 Hz) + three purse ticks + marimba A4; fix: anvil ting A5 + two bench knocks', visual: 'The sheet slides up, the buyer or lot appears with a line of dialogue',
  variants: { sell: { v: 'sell' }, buy: { v: 'buy' }, fix: { v: 'fix' } }, dur: 0.9,
  build: (p) => ({ sell: () => [bellL('A5', 0, 0.3, 0.5), paper(0.05, 0.1, 0.16), mar('D5', 0.12, 0.4, 0.3)], buy: () => [swoosh(0, 0.2, 500, 1500, 0.22), ...ticks(3, 0.18, 0.05, 0.2, 4200), mar('A4', 0.2, 0.4, 0.3)], fix: () => [{ k: 'bank', f: 'A5', a: 0.001, g: 0.34, p: [[1, 1, 0.4], [2, 0.5, 0.2], [3, 0.3, 0.1]] }, ...wood('D4', 0.12, 0.45, 0.07), ...wood('D4', 0.22, 0.4, 0.07)] })[p.v]() });

S('deal.stage-done', { bus: 'game', tier: 'tiny', cd: 600, pan: 'center',
  trigger: 'A stage finishes and its Continue or See the result button appears (Read and Pitch; Close, Bid and Fix end in the result card, which has its own sound)',
  meaning: 'This part is done', recipe: 'glass E5 then A5, soft (350 ms)', visual: 'The stepper shows a tick, "Continue" appears',
  variants: { s: {} }, dur: 0.7, build: () => pair('E5', 'A5', 0, 0.09, 0.4, 0.3) });

S('deal.quick', { bus: 'game', tier: 'tiny', cd: 600, pan: 'center',
  trigger: 'Quick (auto-play the stage) or Quick deal is pressed',
  meaning: 'The rest is played for you, fast', recipe: 'eight ticks accelerating on rising notes, paper rustle, ending on glass D6', visual: 'The stage is filled in, "Quick" note in the card',
  variants: { q: {} }, dur: 0.9, build: () => [...Array.from({ length: 8 }, (_, i) => mar(P5[4 + Math.floor(i * 0.9)], 0.45 * (i / 7) ** 1.4, 0.22, 0.05)), paper(0, 0.4, 0.14), gls('D6', 0.48, 0.3, 0.3)] });

S('deal.verify', { bus: 'game', tier: 'tiny', cd: 600, pan: 'center',
  trigger: 'Verify this buyer is pressed (a cost of 1% of their budget). `ok` for a clean buyer, `bad` for a fraudster found',
  meaning: 'A check mark, or a warning', recipe: 'ok: marimba D5 then A5; bad: two-tone glass A4 then F#4 with a low knock (medium level)', visual: 'The callout ("verified" or "this buyer is a scam")',
  variants: { ok: {}, bad: { bad: 1, tier: 'medium' } }, dur: 0.6, build: (p) => p.bad ? [...pair('A4', 'F#4', 0, 0.13, 0.5, 0.3), ...wood('D3', 0.13, 0.4, 0.1)] : [mar('D5', 0, 0.4, 0.14), mar('A5', 0.08, 0.45, 0.3)] });

S('deal.result', { bus: 'game', tier: 'medium', cd: 800, pan: 'center',
  trigger: 'The result card is drawn (`result()` in the Deal Room). Skipped if a `sale.*`, `buy.lot` or fanfare sound played in the last 900 ms. tone good, warn, bad, info',
  meaning: 'How the whole deal went', recipe: 'good: glass arpeggio D5 F#5 A5 + soft stamp + sparkle; warn: glass A4 F#4 + stamp; bad: low D3 A2 + dull stamp; info: a stamp and a paper rustle only', visual: 'The result card\'s colored title and stamp',
  variants: { good: { v: 'good' }, warn: { v: 'warn' }, bad: { v: 'bad' }, info: { v: 'info', tier: 'tiny' } }, dur: 1.1,
  build: (p) => ({ good: () => [...arp(['D5', 'F#5', 'A5'], 0.07, (n, t) => gls(n, t, 0.34, 0.5)), ...stamp(0.22, 0.6), ...sparkle(3, 0.3, 0.12, 11)], warn: () => [...pair('A4', 'F#4', 0, 0.12, 0.4, 0.4), ...stamp(0.2, 0.6)], bad: () => [{ k: 'tone', f: 'D3', type: 'triangle', a: 0.004, d: 0.18, g: 0.6, lp: [900, 0.7] }, { k: 'tone', f: 'A2', type: 'triangle', t: 0.14, a: 0.004, d: 0.3, g: 0.6, lp: [800, 0.7] }, ...stamp(0.18, 0.5), ...body(0, 0.9, 'D4', 0.16, 'A4')], info: () => [...stamp(0, 0.7), paper(0.04, 0.12, 0.2), ...body(0, 0.7, 'D4', 0.12)] })[p.v]() });

S('read.probe', { bus: 'game', tier: 'tiny', cd: 120, pan: 'center',
  trigger: 'A probe is bought in the Read stage (`[data-deal="probe"]`): look, serial, power, papers, expert',
  meaning: 'Each way of checking sounds like what it is', recipe: 'look: soft glance (paper hiss 3 kHz) + glass E6; serial: six typewriter ticks + a beep A6; power: relay click + sine D4 to D5 zap + a hum burst; papers: two paper rustles; expert: bell A5 + wood tap D4', visual: 'The probe card is marked used, evidence appears',
  variants: { look: { v: 'look' }, serial: { v: 'serial' }, power: { v: 'power' }, papers: { v: 'papers' }, expert: { v: 'expert' } }, dur: 0.5,
  build: (p) => ({ look: () => [{ k: 'noise', c: 'pink', a: 0.02, d: 0.1, g: 0.18, bp: [3000, 1] }, gls('E6', 0.04, 0.16, 0.2)], serial: () => [...ticks(6, 0, 0.034, 0.26, 3400), { k: 'tone', f: 'A6', t: 0.24, a: 0.002, d: 0.06, g: 0.2 }], power: () => [click(0, 0.4, 1600, 1.5, 0.01), { k: 'tone', f: 'D4', f2: 'D5', gl: 0.1, a: 0.004, d: 0.14, g: 0.3, type: 'triangle' }, { k: 'noise', c: 'pink', t: 0.02, a: 0.01, d: 0.18, g: 0.14, bp: [120, 2] }], papers: () => [paper(0, 0.14, 0.32), paper(0.14, 0.12, 0.26)], expert: () => [bellL('A5', 0, 0.22, 0.5), ...wood('D4', 0.04, 0.45, 0.07)] })[p.v]() });

S('pitch.angle', { bus: 'game', tier: 'tiny', cd: 60, pan: 'center',
  trigger: 'A pitch angle is chosen or dropped (`[data-deal="angle"]`, read before the toggle). The angle sets the timbre: prestige glass, utility wood, scarcity ticking, price coin, story page. A pick rises, a drop falls',
  meaning: 'Each angle has its own voice', recipe: 'prestige: glass F#6; utility: two wood taps A3 D4 + a thump; scarcity: two clock ticks + glass A5; price: marimba D6; story: page flip + marimba E5. Drop = the same, a step lower and softer', visual: 'The angle card lights with a number 1 or 2',
  variants: { prestige: { v: 'prestige' }, utility: { v: 'utility' }, scarcity: { v: 'scarcity' }, price: { v: 'price' }, story: { v: 'story' }, drop: { v: 'price', drop: 1 } }, dur: 0.5,
  build: (p) => ({ prestige: () => [gls('F#6', 0, 0.3, 0.45)], utility: () => [...wood('A3', 0, 0.5, 0.05), ...wood('D4', 0.055, 0.5, 0.06), thump('D3', 'D2', 0.055, 0.3, 0.06)], scarcity: () => [click(0, 0.3, 4200, 2, 0.008), click(0.09, 0.3, 4200, 2, 0.008), gls('A5', 0.1, 0.2, 0.25)], price: () => [mar(p.drop ? 'A5' : 'D6', 0, p.drop ? 0.26 : 0.36, 0.1), click(0, 0.2, 3000, 1.4, 0.01)], story: () => [paper(0, 0.12, 0.22), mar('E5', 0.05, 0.35, 0.2)] })[p.v]() });

S('pitch.fit', { bus: 'game', tier: 'tiny', cd: 800, pan: 'center',
  trigger: 'The Pitch stage reports its fit change (`+0.12 fit` callout): up when fitDelta >= 0.05, down when <= -0.03, silent between',
  meaning: 'Your angles matched the buyer, or missed', recipe: 'up: glass A4 to D5 rising with a sparkle; down: triangle B3 to F#3 falling over a soft thud', visual: 'The callout turns green or amber with the number',
  variants: { up: {}, down: { down: 1 } }, dur: 0.7, build: (p) => p.down ? [{ k: 'tone', f: 'B3', f2: 'F#3', gl: 0.18, type: 'triangle', a: 0.008, d: 0.28, g: 0.5, lp: [1000, 0.7] }, thump('D3', 'D2', 0, 0.35, 0.1), ...body(0.02, 0.5, 'D4', 0.12, 'A4')] : [gls('A4', 0, 0.38, 0.3), gls('D5', 0.1, 0.4, 0.5), ...sparkle(2, 0.18, 0.1, 11)] });

S('haggle.anchor', { bus: 'game', tier: 'tiny', cd: 200, pan: 'center',
  trigger: 'Your first number: Aim high (or Generous), Fair, Quick sale (or Lowball) (`[data-deal="anchor"]`)',
  meaning: 'The bolder the number, the bolder the note', recipe: 'high: brass-lite A4 (lowpass opening) + tap; fair: marimba D4 + tap; low: soft triangle F#3', visual: 'Your marker appears on the price track',
  variants: { high: { v: 'high' }, fair: { v: 'fair' }, low: { v: 'low' } }, dur: 0.5,
  build: (p) => ({ high: () => [brass('A4', 0, 0.36, 0.05, 0.2, 700, 2400), ...wood('D4', 0, 0.3, 0.05)], fair: () => [mar('D4', 0, 0.5, 0.25), ...wood('D4', 0, 0.2, 0.04)], low: () => [{ k: 'tone', f: 'F#3', type: 'triangle', a: 0.01, d: 0.25, g: 0.5, lp: [900, 0.7] }, { k: 'tone', f: 'F#4', type: 'triangle', a: 0.01, d: 0.2, g: 0.6, lp: [1200, 0.7] }] })[p.v]() });

S('haggle.move', { bus: 'game', tier: 'tiny', cd: 200, pan: 'center',
  trigger: 'A move after the anchor: Hold; Raise your offer or Come down (small, medium, large); Split the difference',
  meaning: 'Hold is a still tap; concessions step down; a split brings two notes together', recipe: 'hold: one wood tap D4; concede: 1, 2 or 3 soft falling taps (D4 B3 A3) by size; split: two notes A3 and D4 converging to a glass unison D4', visual: 'The track marker moves, the rounds counter drops',
  variants: { hold: { v: 'hold' }, small: { v: 'c', n: 1 }, large: { v: 'c', n: 3 }, split: { v: 'split' } }, pool: 3, dur: 0.6,
  build: (p) => p.v === 'hold' ? wood(['D4', 'E4', 'F#4'][p.k | 0], 0, 0.55, 0.07) : p.v === 'c' ? ['A4', 'F#4', 'D4'].slice(0, p.n).flatMap((n, i) => wood(n, i * 0.085, 0.45 - i * 0.05, 0.06)) : [{ k: 'tone', f: 'A3', f2: 'D4', gl: 0.14, a: 0.01, d: 0.2, g: 0.3 }, { k: 'tone', f: 'F#4', f2: 'D4', gl: 0.14, a: 0.01, d: 0.2, g: 0.3 }, gls('D4', 0.15, 0.4, 0.4)] });

S('haggle.leverage', { bus: 'game', tier: 'medium', cd: 600, pan: 'center',
  trigger: 'Mention your other option is pressed (once per haggle)',
  meaning: 'You played your ace', recipe: 'card snap (noise, 40 ms) + a bright glass sting A5 D6 F#6 (60 ms apart)', visual: 'The button is spent; their stance shifts',
  variants: { l: {} }, dur: 0.8, build: () => [click(0, 0.5, 2200, 0.9, 0.04), ...arp(['A5', 'D6', 'F#6'], 0.06, (n, t) => gls(n, 0.04 + t, 0.32, 0.5))] });

S('haggle.close', { bus: 'game', tier: 'medium', cd: 600, pan: 'center',
  trigger: 'Accept their offer or price is pressed (handshake); Walk away is pressed (tiny)',
  meaning: 'A deal is shaken on, or you left the table', recipe: 'accept: two soft thumps (the clasp) + a coin D6 + a stamp; walk: chair slide (noise sweep down) + a door thump and latch tick', visual: '"Agreed at $x" callout, or "no deal"',
  variants: { accept: {}, walk: { walk: 1, tier: 'tiny' } }, dur: 0.7,
  build: (p) => p.walk ? [swoosh(0, 0.2, 1600, 500, 0.2), thump('D3', 'D2', 0.22, 0.5, 0.1), click(0.25, 0.25, 2600), ...body(0.22, 0.35, 'D4', 0.1, 'A4')] : [thump('A2', 'D2', 0, 0.5, 0.08), thump('A2', 'D2', 0.09, 0.5, 0.08), ...coin('D6', 0.18, 0.3), ...stamp(0.22, 0.6), ...body(0.09, 0.5, 'D4', 0.12)] });

S('haggle.tell', { bus: 'game', tier: 'tiny', cd: 300, pan: 'center',
  trigger: 'After each counter, their stance changes ("far apart", "getting closer", "very close")',
  meaning: 'Warmer or colder: the interval shrinks and the tone opens as you close in', recipe: 'a two-note chord that narrows: far D3 + F#5 behind a 700 Hz lowpass; closer D4 + A4 behind 2 kHz; very close A4 + A4 (+7 cents, a slow beat) wide open', visual: 'The words "They are very close"',
  variants: { far: { v: 'far' }, reach: { v: 'reach' }, near: { v: 'near' } }, dur: 0.6,
  build: (p) => ({ far: () => [{ k: 'tone', f: 'D3', a: 0.01, d: 0.3, g: 0.3, lp: [700, 0.7] }, { k: 'tone', f: 'F#4', a: 0.01, d: 0.3, g: 0.26, lp: [700, 0.7] }, { k: 'tone', f: 'F#5', a: 0.01, d: 0.3, g: 0.12, lp: [700, 0.7] }], reach: () => [{ k: 'tone', f: 'D4', a: 0.01, d: 0.3, g: 0.34, lp: [2000, 0.7] }, { k: 'tone', f: 'A4', a: 0.01, d: 0.3, g: 0.3, lp: [2000, 0.7] }], near: () => [{ k: 'tone', f: 'A4', a: 0.01, d: 0.4, g: 0.32 }, { k: 'tone', f: 'A4', det: 7, a: 0.01, d: 0.4, g: 0.32 }, gls('A5', 0, 0.12, 0.3)] })[p.v]() });

S('bid.raise', { bus: 'game', tier: 'tiny', cd: 120, pan: 'center',
  trigger: 'Bid (or Open the bidding) is pressed in an auction. `n` is the number of raises so far',
  meaning: 'Your paddle goes up; the climb rises with the price', recipe: 'paddle clack (noise 1.5 kHz + wood) then a marimba note one step higher each raise (D5 up to B5)', visual: 'The price on the ladder, "You bid $x"',
  variants: { r1: { n: 0 }, r5: { n: 4 } }, pool: 3, dur: 0.4, build: (p) => [click(0, 0.4, 1500, 1, 0.02), ...wood(['D4', 'E4', 'F#4'][p.k | 0], 0, 0.3, 0.04), mar(P5[5 + Math.min(4, p.n)], 0.04, 0.4, 0.16)] });

S('bid.rival', { bus: 'game', tier: 'tiny', cd: 200, pan: 'rival, alternating left and right',
  trigger: 'A rival bids (in) or drops out (out) in the auction log, each on its own side of the stereo field',
  meaning: 'Someone else is in the room: a lower bell for a bid, a falling note for a dropout', recipe: 'in: soft bell A3 (lowpass 2.5 kHz) + paddle tick; out: triangle E3 falling to D3 + a paper shuffle', visual: 'The rival list ("in", "out at $x") and the event log',
  variants: { in: { v: 'in' }, out: { v: 'out' } }, dur: 0.5, build: (p) => p.v === 'in' ? [bellL('A3', 0, 0.3, 0.35, { lp: [2500, 0.7] }), click(0, 0.2, 1500, 1, 0.02), ...body(0, 0.3, 'D4', 0.1)] : [{ k: 'tone', f: 'D4', f2: 'A3', gl: 0.2, type: 'triangle', a: 0.01, d: 0.25, g: 0.4, lp: [900, 0.7] }, paper(0.05, 0.1, 0.12, 1200, 600), ...body(0, 0.35, 'D4', 0.1, 'A4')] }); // out falls D4 to A3 (a fifth): E3 to D3 was a tone apart, at the edge of what a laptop plays

S('bid.drop', { bus: 'game', tier: 'tiny', cd: 300, pan: 'center',
  trigger: 'Drop out is pressed',
  meaning: 'You stepped back (and kept your cash)', recipe: 'soft falling air sweep + a wood tap D4', visual: '"You dropped out" callout',
  variants: { d: {} }, dur: 0.4, build: () => [swoosh(0, 0.18, 1800, 500, 0.2), ...wood('D4', 0.16, 0.35, 0.06)] });

S('bid.hammer', { bus: 'game', tier: 'medium', cd: 800, pan: 'center',
  trigger: 'The auction ends (`sold` or `nosale` in the log). `won` if you hold the winning bid',
  meaning: 'Sold. The gavel falls; a chime rises if it is yours, a low note if it is not', recipe: 'gavel: hard wood hit (noise 800 Hz + thump D4 to A3 + knock); won: glass A5 D6 rising; lost: triangle D3', visual: 'The callout "You won at $x" or "You are out"',
  variants: { won: {}, lost: { lost: 1 } }, dur: 0.9,
  build: (p) => [click(0, 0.6, 800, 0.8, 0.03), thump('D4', 'A3', 0, 0.7, 0.08), ...wood('D4', 0, 0.5, 0.08), ...(p.lost ? [{ k: 'tone', f: 'D3', type: 'triangle', t: 0.12, a: 0.01, d: 0.35, g: 0.5, lp: [900, 0.7] }, ...body(0.12, 0.8, 'D4', 0.14, 'A4')] : [gls('A5', 0.1, 0.34, 0.5), gls('D6', 0.19, 0.38, 0.6)])] });

S('repair.stop', { bus: 'game', tier: 'tiny', cd: 150, pan: 'center',
  trigger: 'Stop is pressed on the repair dial (or Space, or Stop here on the slider). By precision: perfect >= 90%, good >= 65%, ok > 0, miss',
  meaning: 'The better the stop, the cleaner the ring', recipe: 'perfect: anvil bell D6 A6 + hammer thud + sparkle; good: anvil ting A5 + thud; ok: wood thunk + dull tink; miss: clunk + three rattles and a falling B3 to D3', visual: 'The step turns green, amber or red with its precision',
  variants: { perfect: { v: 'perfect', tier: 'medium' }, good: { v: 'good' }, ok: { v: 'ok' }, miss: { v: 'miss' } }, dur: 0.9,
  build: (p) => ({ perfect: () => [thump('A3', 'D3', 0, 0.6, 0.1), bellL('D6', 0.01, 0.34, 0.8), bellL('A6', 0.02, 0.22, 0.7), ...sparkle(3, 0.12, 0.12, 12)], good: () => [thump('A3', 'D3', 0, 0.55, 0.1), bellL('A5', 0.01, 0.34, 0.4)], ok: () => [...wood('D3', 0, 0.55, 0.08), { k: 'bank', f: 'A5', a: 0.001, g: 0.18, p: [[1, 1, 0.07], [1.5, 0.5, 0.05]], lp: [2200, 0.7] }, ...body(0, 0.5, 'D4', 0.08)], miss: () => [thump('D3', 'D2', 0, 0.6, 0.1), ...ticks(3, 0.05, 0.04, 0.22, 2600), { k: 'tone', f: 'B3', f2: 'D3', gl: 0.2, type: 'triangle', t: 0.08, a: 0.01, d: 0.25, g: 0.3, lp: [900, 0.7] }, ...body(0.06, 0.6, 'D4', 0.1, 'A4')] })[p.v]() });

S('repair.done', { bus: 'game', tier: 'medium', cd: 800, pan: 'center',
  trigger: '`repair` event: great when precision >= 0.8, ok >= 0.4, rough below. Careful (pay more, guaranteed) plays ok',
  meaning: 'The work is finished, and how well', recipe: 'great: three anvil hits rising A5 D6 F#6 + glass chime D6 A6 + stamp; ok: three wrench clicks + wood + a soft glass A4; rough: dull clank + a short falling triangle', visual: '"Repaired, and it pays" or "Repaired" title; quality shown as a percentage',
  variants: { great: { v: 'great' }, ok: { v: 'ok' }, rough: { v: 'rough' } }, dur: 1.1,
  build: (p) => ({ great: () => [...['A3', 'B3', 'D4'].map((n, i) => [thump(n, 'D3', i * 0.1, 0.5, 0.08), bellL(['A5', 'D6', 'F#6'][i], i * 0.1, 0.18, 0.2)]), gls('D6', 0.35, 0.34, 0.6), gls('A6', 0.42, 0.34, 0.7), ...stamp(0.5, 0.6)], ok: () => [...ticks(3, 0, 0.07, 0.28, 2400), ...wood('D4', 0.22, 0.45, 0.08), gls('A4', 0.25, 0.3, 0.4)], rough: () => [thump('D3', 'D2', 0, 0.7, 0.12), ...ticks(2, 0.02, 0.05, 0.22, 2400), { k: 'tone', f: 'A3', f2: 'F#3', gl: 0.15, type: 'triangle', t: 0.1, a: 0.01, d: 0.2, g: 0.4, lp: [900, 0.7] }, ...body(0.05, 0.7, 'D4', 0.14, 'A4')] })[p.v]() });

// =============================================================================================== CREW, FREIGHT, BANK, AUDIT
S('hire.manager', { bus: 'game', tier: 'medium', cd: 800, pan: 'building x',
  trigger: '`hire` event (Hire in the Crew drawer). Flavor by kind: student, broker, logistics',
  meaning: 'Someone joins your team', recipe: 'door bell A5 + paper + two handshake thumps + a small brass swell D4 A4; student: marimba flourish; broker: marimba plink; logistics: horn blip', visual: 'A building rises on the plot, the Crew drawer lists them',
  variants: { student: { v: 'student' }, broker: { v: 'broker' }, logistics: { v: 'logistics' } }, dur: 1.2,
  build: (p) => [bellL('A5', 0, 0.3, 0.5), paper(0.04, 0.1, 0.14), thump('A2', 'D2', 0.18, 0.4, 0.07), thump('A2', 'D2', 0.27, 0.4, 0.07), brass('D4', 0.3, 0.26, 0.08, 0.4, 500, 1800), brass('A4', 0.32, 0.2, 0.08, 0.4, 500, 1800), ...({ student: () => arp(['D5', 'F#5', 'A5'], 0.06, (n, t) => mar(n, 0.45 + t, 0.28, 0.2)), broker: () => [mar('A6', 0.5, 0.3, 0.14), click(0.5, 0.15, 3000)], logistics: () => [...horn('A3', 'A2', 0.45, 0.2, 0.08, 0.2), mar('D6', 0.52, 0.3, 0.2)] })[p.v]()] });

S('crew.build', { bus: 'game', tier: 'medium', cd: 800, pan: 'building x',
  trigger: '`pipe-level` event (a manager leveled up) or `upgrade` event (a company upgrade bought)',
  meaning: 'Your business got stronger', recipe: 'level: three hammer hits rising D4 A4 D5 on marimba + a brass-lite note; upgrade: a relay click, a rising machine whirr (noise 300 to 1500 Hz) and a glass ping A5', visual: 'The building grows a floor / the upgrade is marked bought, a good toast',
  variants: { level: { v: 'level' }, upgrade: { v: 'upgrade' } }, dur: 1.0,
  build: (p) => p.v === 'level' ? [...['D4', 'A4', 'D5'].map((n, i) => [thump('A3', 'D3', i * 0.09, 0.4, 0.07), mar(n, i * 0.09, 0.42, 0.25)]), brass('A4', 0.26, 0.24, 0.1, 0.4, 600, 2000)] : [click(0, 0.5, 1600, 1.5, 0.012), swoosh(0.05, 0.4, 300, 1500, 0.28), gls('A5', 0.45, 0.38, 0.5)] });

S('crew.client', { bus: 'game', tier: 'medium', cd: 800, pan: 'center',
  trigger: '`client` event (a contract signed): smb, corp, ent',
  meaning: 'A contract is signed', recipe: 'pen scribble (noise at 4.5 kHz with fast tremolo, 250 ms) + stamp + bell D6; corp adds a glass fifth; ent adds a brass chord D3 A3', visual: 'The client appears in the Crew drawer',
  variants: { smb: { v: 'smb' }, ent: { v: 'ent' } }, dur: 1.1,
  build: (p) => [{ k: 'noise', c: 'white', a: 0.02, d: 0.22, g: 0.14, bp: [4500, 1.4], am: [18, 0.7] }, ...stamp(0.27, 0.8), bellL('D6', 0.3, 0.28, 0.6), ...(p.v === 'ent' ? [gls('A6', 0.32, 0.2, 0.6), brass('D3', 0.3, 0.24, 0.1, 0.5, 400, 1500), brass('A3', 0.3, 0.2, 0.1, 0.5, 400, 1500)] : [])] });

S('ship.depart', { bus: 'game', tier: 'medium', cd: 1000, pan: 'origin district x',
  trigger: '`ship` event (crates sent to another district)',
  meaning: 'A truck pulls out', recipe: 'engine rumble (brown noise lowpassed at 240 Hz and closing to 120) + a short air horn, D3 over D2', visual: 'A truck drives along the road, a "Shipped" toast',
  variants: { s: {} }, dur: 1.2, build: () => [{ k: 'noise', c: 'brown', a: 0.3, d: 0.8, g: 0.5, lp: [240, 0.7, 120] }, { k: 'noise', c: 'pink', a: 0.3, d: 0.7, g: 0.3, bp: [450, 0.8], main: true }, ...horn('D3', 'D2', 0.2, 0.3, 0.12, 0.25), ...body(0.2, 0.4, 'D4', 0.3)] });

S('ship.arrive', { bus: 'game', tier: 'tiny', cd: 1500, pan: 'destination district x',
  trigger: 'Note kind `freight-arrive` ("Freight arrived in ...")',
  meaning: 'The truck is here', recipe: 'air-brake hiss (a noise band falling from 3 to 1.8 kHz, 300 ms) + a door-bell ding D6 + a crate knock', visual: 'The truck vanishes, the crates appear; the news ticker (and a polite screen-reader line)',
  variants: { a: {} }, dur: 0.8, build: () => [{ k: 'noise', c: 'pink', a: 0.02, d: 0.3, g: 0.5, bp: [3000, 0.7, 1800] }, bellL('D6', 0.28, 0.26, 0.4), ...wood('D4', 0.3, 0.4, 0.07)] });

S('ship.trouble', { bus: 'game', tier: 'medium', cd: 1500, pan: 'destination district x',
  trigger: 'Note kind `customs` (inspected: a delay and a fee) or `damage` (crates damaged in transit)',
  meaning: 'Something went wrong on the road', recipe: 'customs: a stop whistle (two sine A5 pulses) + clipboard stamp; damage: crate crunch (noise bursts) + a glass shatter-lite + a falling sting', visual: 'A warn or bad toast with the cost',
  variants: { customs: { v: 'customs' }, damage: { v: 'damage' } }, dur: 0.9,
  build: (p) => p.v === 'customs' ? [{ k: 'tone', f: 'A5', a: 0.005, h: 0.07, d: 0.05, g: 0.3 }, { k: 'tone', f: 'A5', t: 0.15, a: 0.005, h: 0.07, d: 0.05, g: 0.3 }, ...stamp(0.4, 0.7)] : [thump('D3', 'D2', 0, 0.6, 0.12), ...ticks(5, 0.02, 0.04, 0.3, 2200), gls('A5', 0.05, 0.14, 0.1), { k: 'tone', f: 'A3', f2: 'D3', gl: 0.25, type: 'triangle', t: 0.1, a: 0.01, d: 0.3, g: 0.35, lp: [900, 0.7] }, ...body(0.05, 0.4, 'D4', 0.14, 'A4')] });

S('bank.draw', { bus: 'game', tier: 'medium', cd: 800, pan: 'center',
  trigger: '`draw` event (a loan taken)',
  meaning: 'Cash in, but it is owed: coins that end on a low note', recipe: 'vault door (low sine D2 + a sweeping noise 400 Hz) + bills counted (six paper flutters) + a stamp, ending on a held triangle D3', visual: 'Cash rises, Debt appears in the gauge, a "Liability added" toast',
  variants: { b: {} }, dur: 1.4, build: () => [{ k: 'tone', f: 'D2', a: 0.02, d: 0.4, g: 0.5 }, { k: 'noise', c: 'brown', a: 0.1, d: 0.3, g: 0.2, bp: [400, 1, 250] }, ...Array.from({ length: 6 }, (_, i) => paper(0.3 + i * 0.07, 0.07, 0.2)), ...stamp(0.75, 0.7), { k: 'tone', f: 'D3', type: 'triangle', t: 0.8, a: 0.02, d: 0.5, g: 0.28, lp: [800, 0.7] }, ...body(0.3, 1.0, 'D4', 0.16, 'A4')] });

S('bank.repay', { bus: 'game', tier: 'medium', cd: 800, pan: 'center',
  trigger: '`repay` event: half or full of one loan; `free` when the last loan is cleared (Debt-free)',
  meaning: 'Debt goes down: a stamp, coins out, relief rising', recipe: 'stamp + three muted coins + glass A4 (half) or F#5 to A5 (full); free: vault latch closing + a rising glass arpeggio D5 F#5 A5 D6 + a shower', visual: 'The loan row shrinks, a toast; "Debt-free" toast for the last one',
  variants: { half: { v: 'half' }, full: { v: 'full' }, free: { v: 'free', tier: 'loud' } }, dur: 1.6,
  build: (p) => p.v === 'free' ? [thump('D3', 'D2', 0, 0.7, 0.14), click(0.03, 0.3, 2000), ...arp(['D5', 'F#5', 'A5', 'D6'], 0.09, (n, t) => gls(n, 0.2 + t, 0.34, 0.8)), ...sparkle(6, 0.5, 0.14, 10, 0.06), gls('D6', 0.2, 0.3, 1.0)] : [...stamp(0, 0.8), ...coins(3, 0.15, 0.1, 0.12, FALL, { lp: [2600, 0.7] }, true), ...(p.v === 'half' ? [gls('A4', 0.3, 0.34, 0.4), gls('D5', 0.4, 0.36, 0.6)] : [gls('F#5', 0.3, 0.34, 0.4), gls('A5', 0.4, 0.38, 0.7)])] }); // the coins going out are soft; what is heard is relief rising (half: A4 to D5, full: F#5 to A5)

S('audit.notice', { bus: 'game', tier: 'medium', cd: 2000, pan: 'center',
  trigger: 'Note with `audit: true` (an audit event with 72 virtual hours to answer)',
  meaning: 'An official letter has arrived', recipe: 'five typewriter ticks + a carriage bell A5 + the warning pair glass A4 F#4', visual: 'Warn toast, the Bank drawer\'s audit panel, the Bank badge',
  variants: { a: {} }, dur: 1.0, build: () => [...ticks(5, 0, 0.055, 0.25, 2400), bellL('A5', 0.3, 0.22, 0.5), ...pair('A4', 'F#4', 0.4, 0.14, 0.4, 0.4)] });

S('audit.result', { bus: 'game', tier: 'medium', cd: 2000, pan: 'center',
  trigger: '`audit` event (you answered): `ok` true is a pass, false a fail',
  meaning: 'Approved, or fined', recipe: 'pass: stamp + glass D5 F#5 A5 rising; fail: stamp + a falling triangle A3 to D3 + a muted coin', visual: 'Toast and the audit panel clears (a fine appears in the ledger)',
  variants: { pass: {}, fail: { fail: 1 } }, dur: 1.0, build: (p) => p.fail ? [...stamp(0, 0.9), ...coin('D5', 0.02, 0.22, 0.1, { lp: [2000, 0.7] }), { k: 'tone', f: 'A3', f2: 'D3', gl: 0.3, type: 'triangle', t: 0.14, a: 0.01, d: 0.4, g: 0.45, lp: [900, 0.7] }, { k: 'tone', f: 'D4', f2: 'A3', gl: 0.25, t: 0.14, a: 0.01, d: 0.3, g: 0.9 }, ...body(0.05, 0.5, 'D4', 0.14, 'A4')] : [...stamp(0, 0.9), ...arp(['D5', 'F#5', 'A5'], 0.07, (n, t) => gls(n, 0.1 + t, 0.34, 0.6)), gls('D6', 0.24, 0.24, 0.5)] });

// =============================================================================================== ALERTS AND SHOCKS
S('alert.advance', { bus: 'game', tier: 'medium', cd: 3000, pan: 'center',
  trigger: 'A macro warning note (`alert` with `level` 1 to 3, "effective in N days"); also the alert dialog',
  meaning: 'Severity escalates: one pair, two pairs with a drone, three pairs with a horn', recipe: '1: the warning pair glass A4 F#4; 2: the pair twice (350 ms apart) over a saw drone D2; 3: the pair three times over a horn (D3 over D2) and a vault knock', visual: 'The alert dialog with its code and readout; the ticker',
  variants: { l1: { l: 1 }, l2: { l: 2 }, l3: { l: 3, tier: 'loud' } }, dur: 1.6,
  build: (p) => [...Array.from({ length: p.l }, (_, i) => pair('A4', 'F#4', i * 0.4, 0.14, 0.4, 0.35)).flat(), ...(p.l >= 2 ? [{ k: 'tone', f: 'D2', type: 'sawtooth', a: 0.15, h: 0.3, d: 0.4, g: 0.3, lp: [320, 0.8] }] : []), ...(p.l >= 3 ? [...horn('D3', 'D2', 0.1, 0.4, 0.5, 0.5), thump('D3', 'D2', 0, 0.5, 0.14)] : [])] });

S('alert.shock', { bus: 'game', tier: 'loud', cd: 3000, pan: 'center',
  trigger: '`shock` event (it is live now). By kind: tiktok, fed, tariff (scheduled), viral, glut, scare (surprise events, quieter)',
  meaning: 'tiktok: exciting; fed: ominous; tariff: heavy; viral: bright; glut: sinking; scare: nervous', recipe: 'tiktok: five-note bright arpeggio D5 to F#6 + confetti noise swell; fed: low brass A2 to D2 glide + rain-onset noise + rumble; tariff: gate slam + metal clang + horn A2; viral: glass D6 A6 D7; glut: marimba D5 A4 D4 falling; scare: the pair + a paper shake', visual: 'Breaking-news toast and dialog, rain or confetti in the world',
  variants: { tiktok: { v: 'tiktok' }, fed: { v: 'fed' }, tariff: { v: 'tariff' }, viral: { v: 'viral', tier: 'medium' }, glut: { v: 'glut', tier: 'medium' }, scare: { v: 'scare', tier: 'medium' } }, dur: 2.2,
  build: (p) => ({ tiktok: () => [...arp(['D5', 'F#5', 'A5', 'D6', 'F#6'], 0.09, (n, t) => mar(n, t, 0.42, 0.3)), { k: 'noise', c: 'white', t: 0.1, a: 0.5, d: 0.6, g: 0.16, hp: [5000, 0.7] }, ...sparkle(5, 0.5, 0.14, 11, 0.07)], fed: () => [{ k: 'tone', f: 'A2', f2: 'D2', gl: 1.0, type: 'sawtooth', uni: [3, 8], a: 0.1, h: 0.5, d: 1.0, g: 0.5, lp: [380, 0.8] }, { k: 'noise', c: 'white', t: 0.3, a: 0.8, d: 0.9, g: 0.12, hp: [2500, 0.7] }, { k: 'noise', c: 'brown', a: 0.3, d: 1.2, g: 0.4, lp: [140, 0.7] }, ...body(0.1, 0.6, 'D4', 0.5, 'A4')], tariff: () => [thump('D3', 'D2', 0, 0.9, 0.2), bellL('D3', 0.01, 0.34, 1.0), ...horn('A3', 'A2', 0.15, 0.4, 0.3, 0.5), ...body(0.05, 0.6, 'D4', 0.3)], viral: () => [gls('D6', 0, 0.4, 0.4), gls('A6', 0.08, 0.4, 0.4), gls('D7', 0.16, 0.4, 0.6)], glut: () => arp(['D5', 'A4', 'D4'], 0.16, (n, t) => mar(n, t, 0.45, 0.35)), scare: () => [...pair('A4', 'F#4', 0, 0.13, 0.4, 0.3), paper(0.3, 0.12, 0.2)] })[p.v]() });

S('alert.margin-call', { bus: 'game', tier: 'loud', cd: 5000, pan: 'center',
  trigger: '`margin-call` event (debt-to-equity passed 4.5: the bank liquidates)',
  meaning: 'The most serious sound in the game', recipe: 'siren pair A3 D4 three times (saw, lowpassed 1.4 kHz) + a vault slam thump + a low horn blast, D3 over D2', visual: 'The "Margin Liquidation Protocol" dialog, bad toast, assets sold off',
  variants: { m: {} }, dur: 2.0, build: () => [...Array.from({ length: 3 }, (_, i) => [{ k: 'tone', f: 'A3', type: 'sawtooth', t: i * 0.45, a: 0.02, h: 0.14, d: 0.1, g: 0.4, lp: [1400, 0.8] }, { k: 'tone', f: 'D4', type: 'sawtooth', t: i * 0.45 + 0.2, a: 0.02, h: 0.14, d: 0.1, g: 0.4, lp: [1400, 0.8] }]).flat(), thump('D3', 'D2', 0, 0.9, 0.25), ...horn('D3', 'D2', 0.05, 0.5, 0.6, 0.6), ...body(0.05, 0.6, 'D4', 0.5)] });

S('alert.insolvent', { bus: 'game', tier: 'loud', cd: 5000, pan: 'center',
  trigger: '`insolvent` event (net worth fell to zero or below)',
  meaning: 'You are broke: a toll and a slow fall', recipe: 'two deep bell tolls D3 (1.5 s each) over a falling slide D4 to D2', visual: 'Bad toast; net worth turns red',
  variants: { i: {} }, dur: 2.6, build: () => [bellL('D3', 0, 0.38, 1.8, { a: 0.012 }), bellL('D3', 0.9, 0.32, 1.6, { a: 0.012 }), { k: 'tone', f: 'A4', f2: 'D3', gl: 1.1, type: 'triangle', a: 0.05, d: 1.6, g: 0.27, lp: [700, 0.7] }, ...body(0.09, 0.3, 'D4', 0.25, 'A4'), ...body(0.99, 0.28, 'D4', 0.25, 'A4')] }); // the slow fall stops at D3: below 150 Hz a laptop plays nothing, and the D4 to D2 slide spent 1.1 s of its 1.6 s there; it starts at A4 so that the first half of it, and the body's two steps, are in what a laptop plays

S('perk.bailout', { bus: 'game', tier: 'loud', cd: 5000, pan: 'center',
  trigger: '`perk` event: `bailout` (the Legacy Heir\'s family clears your debt) or `fine-waived` (the family lawyer, medium)',
  meaning: 'Rescue: relief that rises after a hard moment', recipe: 'bailout: rising brass swell A3 D4 A4 + a glass chord D5 F#5 A5 + an approved stamp + a long falling sigh (noise lowpassed); fine-waived: stamp + a glass tink', visual: 'Good toast ("The family stepped in")',
  variants: { bailout: { v: 'bailout' }, waived: { v: 'waived', tier: 'medium' } }, dur: 1.8,
  build: (p) => p.v === 'waived' ? [...stamp(0, 0.8), gls('A5', 0.12, 0.34, 0.5), gls('D6', 0.2, 0.3, 0.6)] : [...['A3', 'D4', 'A4'].map((n, i) => brass(n, i * 0.18, 0.3, 0.1, 0.6, 400, 1800)), ...['D5', 'F#5', 'A5'].map((n) => gls(n, 0.6, 0.26, 1.0)), ...stamp(0.55, 0.8), { k: 'noise', c: 'pink', t: 0.7, a: 0.1, d: 0.8, g: 0.08, lp: [900, 0.7, 300] }] });

// =============================================================================================== PROGRESS, SOCIAL
S('quest.complete', { bus: 'game', tier: 'medium', cd: 1500, pan: 'center',
  trigger: 'Progress `onComplete("quest")` or `("daily")`',
  meaning: 'A goal reached: a short rising run, with a coin for the reward', recipe: 'marimba arpeggio D5 F#5 A5 D6 (60 ms) + a glass sparkle + a glass bell A6 for the reward (XP is not cash, so no coin)', visual: '"Quest complete: ..." toast, confetti burst, XP',
  variants: { quest: {} }, dur: 0.8, build: () => [...arp(['D5', 'F#5', 'A5', 'D6'], 0.06, (n, t) => mar(n, t, 0.42, 0.3)), gls('D6', 0.22, 0.2, 0.6), gls('A6', 0.3, 0.26, 0.5)] });

S('achievement', { bus: 'game', tier: 'medium', cd: 1500, pan: 'center',
  trigger: 'Progress `onComplete("achievement")`, by `def.rarity`: common, rare, epic',
  meaning: 'Rarity is loudness and length', recipe: 'common: glass A5 D6 + sparkle; rare: three notes + a shimmer and a brass-lite swell; epic: full arpeggio D5 to D7 + brass D3 A3 + a shower of glass (1.6 s)', visual: 'Achievement toast, confetti (more for epic)',
  variants: { common: { v: 'common', tier: 'tiny' }, rare: { v: 'rare' }, epic: { v: 'epic', tier: 'loud' } }, dur: 2.0,
  build: (p) => ({ common: () => [gls('A5', 0, 0.38, 0.4), gls('D6', 0.09, 0.4, 0.45)], rare: () => [...arp(['A5', 'D6', 'F#6'], 0.08, (n, t) => gls(n, t, 0.36, 0.7)), ...sparkle(5, 0.3, 0.12, 11, 0.05), brass('D4', 0, 0.22, 0.1, 0.5, 500, 1800)], epic: () => [...arp(['D5', 'F#5', 'A5', 'D6', 'F#6', 'A6', 'D7'], 0.07, (n, t) => gls(n, t, 0.3, 0.9)), brass('D3', 0, 0.34, 0.2, 0.8, 400, 2200), brass('A3', 0, 0.28, 0.2, 0.8, 400, 2200), ...sparkle(10, 0.5, 0.12, 8, 0.06), ...coins(6, 0.5, 0.4, 0.2)] })[p.v]() });

S('codex.unlock', { bus: 'game', tier: 'tiny', cd: 1500, pan: 'center',
  trigger: 'Progress `onCodex` (a new Codex page unlocked)',
  meaning: 'A new idea: a lightbulb on a page', recipe: 'page flip + glass E6 then A6, soft (450 ms)', visual: '"Codex unlocked: ..." toast, the Codex badge',
  variants: { c: {} }, dur: 0.8, build: () => [paper(0, 0.12, 0.2), gls('E6', 0.1, 0.3, 0.3), gls('A6', 0.18, 0.3, 0.45)] });

S('mentor.tip', { bus: 'game', tier: 'tiny', cd: 3000, pan: 'center',
  trigger: 'Note kind `mentor` (the Seasoned Pro\'s weekly tip)',
  meaning: 'A hint from someone who has seen it before', recipe: 'glass A5, F#5, B5 (a gentle question) + a wood tap', visual: 'The news ticker and a polite screen-reader line',
  variants: { t: {} }, dur: 0.9, build: () => [gls('A5', 0, 0.34, 0.3), gls('F#5', 0.11, 0.3, 0.3), gls('B5', 0.22, 0.36, 0.6), ...wood('D4', 0, 0.3, 0.05)] });

S('level.up', { bus: 'game', tier: 'loud', cd: 2000, pan: 'center',
  trigger: '`level` event. `big` on every 5th level',
  meaning: 'The biggest everyday moment: brass, marimba and glass together', recipe: 'brass stab D3 A3 + marimba run D5 A5 D6 F#6 A6 (80 ms) + glass shimmer D7 + a low boom; big adds an octave doubling', visual: 'Level toast, the HUD ring, confetti',
  variants: { s: { s: 1, tier: 'medium' }, l: {}, big: { big: 1 } }, dur: 2.0,
  build: (p) => p.s ? [...arp(['D5', 'A5', 'D6'], 0.08, (n, t) => mar(n, 0.02 + t, 0.42, 0.3)), gls('D6', 0.2, 0.18, 0.3)] : [brass('D3', 0, 0.36, 0.15, 0.6, 400, 2400), brass('A3', 0, 0.3, 0.15, 0.6, 400, 2400), ...arp(['D5', 'A5', 'D6', 'F#6', 'A6'], 0.08, (n, t) => mar(n, 0.05 + t, 0.4, 0.5)), gls('D7', 0.4, 0.2, 0.9), thump('D3', 'D2', 0, 0.5, 0.25), ...(p.big ? [...arp(['D6', 'A6', 'D7'], 0.08, (n, t) => gls(n, 0.5 + t, 0.28, 0.9)), brass('D4', 0, 0.26, 0.2, 0.7, 400, 2400)] : [])] });

S('skill.up', { bus: 'game', tier: 'medium', cd: 600, pan: 'center',
  trigger: 'A skill point is spent (Quests drawer: Spend)',
  meaning: 'Power-up: three notes climbing', recipe: 'marimba A4 D5 F#5 + a metallic click-in', visual: 'The skill level bar fills, a toast',
  variants: { s: {} }, dur: 0.7, build: () => [...arp(['A4', 'D5', 'F#5'], 0.07, (n, t) => mar(n, t, 0.45, 0.3)), click(0.22, 0.35, 2200, 2, 0.015), gls('A5', 0.22, 0.2, 0.4)] });

S('milestone', { bus: 'game', tier: 'loud', cd: 5000, pan: 'center',
  trigger: '`milestone` event, `n` 1 to 3 (1: managers and the bank open; 2: audits begin; 3: enterprise opens)',
  meaning: 'A door opens; milestone 2 carries a warning', recipe: '1: brass fanfare D3 A3 D4 + marimba run + a door-open swell; 2: the same but the last chord turns to the warning pair A4 F#4; 3: longer, adds a bell chord D6 A6 and a second brass voice', visual: 'Milestone toast, confetti, new dock icons',
  variants: { m1: { n: 1 }, m2: { n: 2 }, m3: { n: 3 } }, dur: 2.4,
  build: (p) => [brass('D3', 0, 0.36, 0.3, 0.7, 400, 2400), brass('A3', 0.12, 0.3, 0.3, 0.7, 400, 2400), brass('D4', 0.24, 0.3, 0.3, 0.7, 400, 2400), ...arp(['D5', 'F#5', 'A5', 'D6'], 0.1, (n, t) => mar(n, 0.3 + t, 0.4, 0.5)), swoosh(0.1, 0.8, 400, 3000, 0.16), ...(p.n === 2 ? pair('A4', 'F#4', 1.0, 0.18, 0.4, 0.6) : [gls('D6', 0.7, 0.3, 1.0)]), ...(p.n === 3 ? [bellL('D6', 0.7, 0.3, 1.4), bellL('A6', 0.75, 0.2, 1.2), brass('A4', 0.5, 0.26, 0.3, 0.7, 500, 2400), ...sparkle(8, 0.9, 0.12, 9, 0.06), gls('D7', 1.3, 0.14, 0.6)] : [])] }); // 3 is the longest: the bell chord rings 200 ms longer and a high glass closes it

S('zone.open', { bus: 'game', tier: 'loud', cd: 4000, pan: 'district x',
  trigger: '`zone` event (a district opens as net worth passes its gate), `t` the tier 1 to 4; with `world.startReveal`',
  meaning: 'The fog lifts: a place opens to you', recipe: 'n+3 glass notes rising (n = tier) + a low pad swell D2 A2 + a rising air sweep and sparkle; tier 4 adds brass and a bell chord', visual: 'Rings and sparks over the district, its fog lifts, a "... is open" toast',
  variants: { t1: { t: 1, tier: 'medium' }, t4: { t: 4 } }, dur: 2.4,
  build: (p) => [...Array.from({ length: p.t + 3 }, (_, i) => gls(P5[5 + i], i * 0.1, 0.32, 0.8)), { k: 'tone', f: 'D2', a: 0.4, h: 0.4, d: 0.8, g: 0.2 }, { k: 'tone', f: 'A2', a: 0.4, h: 0.4, d: 0.8, g: 0.14 }, swoosh(0, 1.2, 500, 4000, 0.18), ...sparkle(5 + p.t, 0.4, 0.11, 10, 0.07), ...(p.t >= 3 ? [brass('D3', 0.2, 0.3, 0.3, 0.8, 400, 2200), bellL('D6', 0.6, 0.24, 1.2)] : [])] });

S('swap.offer-in', { bus: 'game', tier: 'medium', cd: 3000, pan: 'center',
  trigger: 'Session event `offer` (a classmate or the Practice Partner proposes a swap)',
  meaning: 'A letter has been slipped under the door', recipe: 'soft door bell E5 B5 + an envelope flip (paper)', visual: 'The Market badge and the Invitations list (and a polite screen-reader line)',
  variants: { o: {} }, dur: 0.8, build: () => [bellL('E5', 0, 0.28, 0.4), bellL('B5', 0.13, 0.28, 0.5), paper(0.05, 0.12, 0.18)] });

S('swap.done', { bus: 'game', tier: 'medium', cd: 1500, pan: 'center',
  trigger: '`p2p` event (a swap is finished)',
  meaning: 'Hands shaken: crates changed owners', recipe: 'two thumps (the clasp) + two coins swapping sides (pan sweep) + glass A6', visual: 'The ledger row, a good toast',
  variants: { d: {} }, dur: 0.9, build: () => [thump('A2', 'D2', 0, 0.5, 0.08), thump('A2', 'D2', 0.09, 0.5, 0.08), ...coin('D6', 0.2, 0.3), ...coin('A6', 0.3, 0.3), gls('A6', 0.34, 0.26, 0.5)] });

// =============================================================================================== ACADEMY, DRAFT, RUN
S('acad.step', { bus: 'ui', tier: 'tiny', cd: 600, pan: 'center',
  trigger: 'The coach card moves to the next step (a step was done). `i` is the step number, so the note climbs along the lesson',
  meaning: 'Progress through the lesson', recipe: 'glass note one pentatonic step higher than the last (D5 E5 F#5 A5 B5 D6), 300 ms', visual: '"Step n of m" on the card',
  variants: { s0: { i: 0 }, s5: { i: 5 } }, dur: 0.6, build: (p) => [gls(P5[5 + Math.min(5, p.i)], 0, 0.4, 0.3), ...wood('D4', 0, 0.2, 0.04)] });

S('acad.teach', { bus: 'ui', tier: 'tiny', cd: 600, pan: 'center',
  trigger: 'Teach-back: an option is picked (right or wrong), or the answer is revealed',
  meaning: 'Right is bright; wrong is a soft "mm", never a punishment', recipe: 'right: marimba A5 D6 + a glass F#6 (medium); wrong: two soft low taps F#3 D3 behind a lowpass; reveal: page flip + glass E5', visual: 'The option shows its reason in words',
  variants: { right: { v: 'right', tier: 'medium' }, wrong: { v: 'wrong' }, reveal: { v: 'reveal' } }, dur: 0.8,
  build: (p) => ({ right: () => [mar('A5', 0, 0.5, 0.35), mar('D6', 0.08, 0.5, 0.5), gls('F#6', 0.2, 0.16, 0.5)], wrong: () => [{ k: 'tone', f: 'F#3', type: 'triangle', a: 0.005, d: 0.14, g: 0.5, lp: [800, 0.7] }, { k: 'tone', f: 'D3', type: 'triangle', t: 0.12, a: 0.005, d: 0.2, g: 0.5, lp: [800, 0.7] }, ...body(0, 0.6, 'D4', 0.12, 'F#4')], reveal: () => [paper(0, 0.12, 0.2), gls('E5', 0.08, 0.3, 0.4)] })[p.v]() });

S('acad.win', { bus: 'game', tier: 'medium', cd: 2000, pan: 'center',
  trigger: 'A lesson\'s goal is reached (`win()`); `reward` when the lesson-complete sheet opens',
  meaning: 'Lesson done; the reward sheet is a bigger fanfare', recipe: 'goal: marimba D5 A5 D6 + a brass blip; reward: the goal fanfare + glass F#6 A6 shimmer and a glass tail', visual: '"Lesson goal reached", the sheet, confetti',
  variants: { goal: { v: 'goal' }, reward: { v: 'reward', tier: 'loud' } }, dur: 1.6,
  build: (p) => [...arp(['D5', 'A5', 'D6'], 0.08, (n, t) => mar(n, t, 0.42, 0.4)), brass('D3', 0, 0.28, 0.1, 0.4, 500, 1800), ...(p.v === 'reward' ? [...arp(['F#6', 'A6'], 0.09, (n, t) => gls(n, 0.3 + t, 0.28, 0.9)), brass('A3', 0.2, 0.26, 0.2, 0.6, 500, 2200), ...sparkle(6, 0.5, 0.12, 10, 0.06)] : [])] });

S('acad.graduate', { bus: 'game', tier: 'loud', cd: 5000, pan: 'center',
  trigger: 'The last lesson\'s reward sheet ("Finish the Academy")',
  meaning: 'Graduation: the longest fanfare in the game', recipe: 'three bell strikes D5 A5 D6, a brass chord D3 A3 D4 F#4, a marimba run up two octaves and a shower of glass (2.6 s)', visual: 'Reward sheet, confetti',
  variants: { g: {} }, dur: 2.9, build: () => [...['D5', 'A5', 'D6'].map((n, i) => bellL(n, i * 0.25, 0.3, 1.2)), ...['D3', 'A3', 'D4', 'F#4'].map((n) => brass(n, 0.7, 0.28, 0.5, 1.0, 400, 2400)), ...arp(['D5', 'F#5', 'A5', 'B5', 'D6', 'F#6', 'A6', 'D7'], 0.07, (n, t) => mar(n, 0.8 + t, 0.34, 0.5)), ...sparkle(12, 1.3, 0.12, 6, 0.07)] });

S('draft.pick', { bus: 'ui', tier: 'tiny', cd: 60, pan: 'center',
  trigger: 'A Background card is picked or dropped (Background draft); the second pick completes the build',
  meaning: 'A card is slid into a slot: first slot D5, second A5; complete is a chord', recipe: 'card flip snap + marimba D5 (slot 1) or A5 (slot 2); drop: the reverse a step lower; complete: glass chord D5 F#5 A5 + stamp', visual: 'The tray fills, the count "2 of 2"',
  variants: { slot1: { s: 1 }, slot2: { s: 2 }, complete: { v: 'c', tier: 'medium' }, drop: { v: 'd' } }, dur: 0.8,
  build: (p) => p.v === 'c' ? [...['D5', 'F#5', 'A5'].map((n) => gls(n, 0, 0.3, 0.7)), ...stamp(0.12, 0.6)] : p.v === 'd' ? [click(0, 0.3, 2000, 1, 0.02), mar('F#4', 0.02, 0.32, 0.12)] : [click(0, 0.35, 2000, 1, 0.02), mar(p.s === 1 ? 'D5' : 'A5', 0.02, 0.45, 0.25)] });

S('draft.begin', { bus: 'game', tier: 'loud', cd: 5000, pan: 'center',
  trigger: 'Begin is pressed with two Backgrounds chosen',
  meaning: 'The run starts', recipe: 'stamp + rising brass stab D3 A3 + a marimba run D5 to D6 + a door-opening sweep', visual: 'The screen changes to the Academy or the world',
  variants: { b: {} }, dur: 1.6, build: () => [...stamp(0, 0.9), brass('D3', 0.05, 0.32, 0.2, 0.6, 400, 2200), brass('A3', 0.1, 0.28, 0.2, 0.6, 400, 2200), ...arp(['D5', 'F#5', 'A5', 'D6'], 0.08, (n, t) => mar(n, 0.2 + t, 0.4, 0.5)), swoosh(0.1, 0.7, 400, 3000, 0.18)] });

S('run.end', { bus: 'game', tier: 'loud', cd: 8000, pan: 'center',
  trigger: 'Day 90 closes the run (`final` note); an exit launches (`exit` event: IPO or trade sale) and settles (note `final` with an exit)',
  meaning: 'The end of something big', recipe: 'horizon: three slow bell tolls D3; exit start: a trading-floor bell (eight fast strikes A5 decaying) + brass; exit done: the grand fanfare, brass D3 A3 D4 F#4 + bells + a glass shower (2.8 s)', visual: 'The "simulation is complete" dialog with the EEI',
  variants: { horizon: { v: 'h' }, start: { v: 's' }, done: { v: 'd' } }, dur: 3.0,
  build: (p) => p.v === 'h' ? [bellL('D3', 0, 0.5, 2.0), bellL('D3', 0.85, 0.42, 1.8), bellL('D3', 1.7, 0.34, 1.6), gls('D4', 0, 0.3, 1.0), gls('D4', 0.85, 0.26, 0.9), gls('D4', 1.7, 0.22, 0.8)] : p.v === 's' ? [...Array.from({ length: 8 }, (_, i) => bellL('A5', i * 0.08, 0.3 - i * 0.02, 0.3)), brass('D3', 0.3, 0.3, 0.2, 0.6, 400, 2000), ...stamp(0.7, 0.6)] : [...['D3', 'A3', 'D4', 'F#4'].map((n) => brass(n, 0, 0.3, 0.6, 1.0, 400, 2600)), ...['D5', 'A5', 'D6'].map((n, i) => bellL(n, 0.1 + i * 0.2, 0.3, 1.5)), ...arp(['D5', 'F#5', 'A5', 'D6', 'F#6', 'A6', 'D7'], 0.08, (n, t) => mar(n, 0.4 + t, 0.34, 0.6)), ...sparkle(14, 1.0, 0.12, 6, 0.07), ...coins(8, 0.8, 0.6, 0.2)] });

S('inst.cue', { bus: 'game', tier: 'medium', cd: 2000, pan: 'center',
  trigger: 'Instructor dashboard only: Deploy to cohort (deploy), Start simulation (start), Rewind (rewind). Off by default in a room',
  meaning: 'A ceremony for the teacher', recipe: 'deploy: marimba D5 A5 + a horn D3; start: horns D3 and A3 over D2 and A2 + bell D6; rewind: tape whir (noise sweeping down 3 kHz to 300 Hz) with ticks', visual: 'The dashboard\'s own toast',
  variants: { deploy: { v: 'deploy' }, start: { v: 'start' }, rewind: { v: 'rewind', tier: 'tiny' } }, dur: 1.4,
  build: (p) => ({ deploy: () => [...horn('D3', 'D2', 0, 0.34, 0.4, 0.4), ...body(0, 0.4, 'D4', 0.3), mar('D5', 0.08, 0.4, 0.3), mar('A5', 0.18, 0.4, 0.4), gls('D6', 0.3, 0.3, 0.5)], start: () => [...horn('D3', 'D2', 0, 0.4, 0.3, 0.5), ...horn('A3', 'A2', 0, 0.3, 0.3, 0.5), bellL('D6', 0.35, 0.3, 0.9), ...body(0.05, 0.5, 'D4', 0.3)], rewind: () => [swoosh(0, 0.5, 3000, 300, 0.26), ...ticks(8, 0, 0.06, 0.15, 3000)] })[p.v]() });

// =============================================================================================== REVISION 2: redrawn and new
S('world.hover', { bus: 'game', tier: 'tiny', cd: 330, pan: 'object x',
  trigger: 'The pointer rests for 120 ms on a different thing in the world (not from the keyboard list): buyer, lot, crate, building, district, locked thing, truck. At most 3 a second, never within 250 ms of a click, and not while dragging the camera',
  meaning: 'There is something here; the tooltip says what', recipe: 'wood tick A5 or E6 (a pool of two), 25 ms, + the 2.4 kHz tick; the same for every kind', visual: 'The tooltip (also read out by the list view)',
  variants: { t: {} }, pool: 2, dur: 0.1, build: (p) => wood(['A5', 'E6'][p.k | 0], 0, 0.5, 0.025) });

S('read.suspect', { bus: 'game', tier: 'tiny', cd: 1500, pan: 'center',
  trigger: 'The Read stage\'s visible "Chance it is a counterfeit" meter rises through 60% after a probe, once per lot (the room emits `what:\'suspect\'` from the model\'s belief, which is what the meter draws). The sound reads nothing the player cannot see',
  meaning: 'The meter says be suspicious: a warning, not a verdict', recipe: 'glass A5 then F#5 (the warning interval, soft) over a low knock F#3; no sparkle', visual: 'The meter itself, which crosses 60%; the evidence line',
  variants: { s: {} }, dur: 0.45, build: () => [gls('A5', 0, 0.4, 0.18), gls('F#5', 0.11, 0.36, 0.22), ...wood('F#3', 0.02, 0.45, 0.1)] });

S('daily.done', { bus: 'game', tier: 'tiny', cd: 4000, pan: 'center',
  trigger: 'Progress `onComplete("daily")` (a daily bounty done). Silent in an Academy lesson, silent at 4x and above; a second within 60 s plays as `reward.also`',
  meaning: 'A small tick: one more thing ticked off', recipe: 'glass A5 (about 160 ms) + a stamp tick; no coin, no arpeggio', visual: '"Daily bounty done: ..." toast, confetti burst, XP',
  variants: { d: {} }, dur: 0.25, build: () => [gls('A5', 0, 0.4, 0.14), thump('D3', 'D2', 0.04, 0.3, 0.05, { fam: 'stamp' }), click(0.04, 0.3, 900, 0.9, 0.03)] });

S('reward.also', { bus: 'game', tier: 'tiny', cd: 3000, pan: 'center',
  trigger: 'A reward that lost its sentence to a better one in the same burst, or arrived inside the reward budget\'s window (3.4.2, 3.4.4); at most two a burst and one in 3 s. `n` is 1 or 2 notes',
  meaning: 'And something else was earned', recipe: 'one or two glass notes rising A5 then D6, 70 ms apart, played 6 dB down', visual: 'The toast of whatever it stands for',
  variants: { a: {} }, dur: 0.3, build: (p) => p.n === 1 ? [gls('A5', 0, 0.4, 0.12)] : [gls('A5', 0, 0.4, 0.12), gls('D6', 0.07, 0.4, 0.16)] });

// =============================================================================================== the tables that turn a recipe into a rule
const ids = (s) => s.split(/\s+/).filter(Boolean);
/** The class of a sound decides which road it takes through the engine (3.4.1). */
export const CLASS = {
  press: ids('ui.tick ui.toggle ui.select ui.crate ui.drawer-open ui.drawer-close ui.dialog-open ui.dialog-close ui.ask ui.refuse ui.nudge ui.ok ui.slider ui.count-up clock cam deal.open deal.quick deal.verify read.probe pitch.angle haggle.anchor haggle.move haggle.leverage haggle.close bid.raise bid.drop repair.stop inst.cue acad.step acad.teach draft.pick'),
  world: ids('world.hover world.locked world.step'),
  cause: ids('zone.enter cash.in cash.out sale.win sale.pioneer sale.herd sale.flat sale.reject sale.scam buy.lot pool.sell streak deal.stage-done deal.result read.suspect pitch.fit haggle.tell bid.rival bid.hammer repair.done hire.manager crew.build crew.client ship.depart bank.draw bank.repay audit.result skill.up swap.done draft.begin'),
  state: ids('ship.trouble audit.notice alert.advance alert.shock alert.margin-call alert.insolvent perk.bailout swap.offer-in run.end'),
  reward: ids('quest.complete achievement codex.unlock level.up milestone zone.open daily.done reward.also acad.win acad.graduate'),
  clock: ids('buyer.arrive buyer.urgent day.turn manager.cycle ship.arrive mentor.tip'),
};
const CLASS_OF = {};
for (const [c, list] of Object.entries(CLASS)) for (const id of list) CLASS_OF[id] = c;
/** The player flag P (3.4.1): the sound answers something the player did, so it draws from the player bucket when a press or a world activation happened in the last 1500 ms. */
const NO_P = new Set(['ui.count-up', 'streak']);
const PLAYER_CAUSE = new Set(ids('zone.enter cash.in cash.out sale.win sale.pioneer sale.herd sale.flat sale.reject sale.scam buy.lot pool.sell deal.stage-done deal.result read.suspect pitch.fit haggle.tell bid.rival bid.hammer repair.done hire.manager crew.build crew.client ship.depart bank.draw bank.repay audit.result skill.up swap.done draft.begin'));
export const isPlayer = (id) => { const c = CLASS_OF[id]; return (c === 'press' || c === 'world') ? !NO_P.has(id) : PLAYER_CAUSE.has(id); };
/** The three that preempt a moment in progress and are never queued behind a fanfare (3.4.7). */
export const PREEMPT = new Set(['run.end', 'alert.margin-call', 'alert.insolvent']);
/** Exempt from the reward budget (3.4.4). */
export const BUDGET_EXEMPT = (id) => id === 'milestone' || id === 'acad.graduate' || id === 'run.end' || id === 'perk.bailout' || id.startsWith('alert.');

// ---- rank (3.4.1): where two sounds of one burst compete, the higher rank wins
const CAUSE_GROUPS = [
  ['run.end', 'alert.margin-call', 'alert.insolvent'], ['perk.bailout'], ['sale.'], ['buy.lot', 'pool.sell', 'repair.done', 'deal.result'],
  ['hire.manager', 'crew.build', 'crew.client', 'ship.depart', 'bank.', 'audit.result', 'swap.done', 'zone.enter'], ['alert.', 'audit.notice', 'ship.trouble'], ['cash.in', 'cash.out'],
];
const REWARD_ORDER = ['milestone', 'zone.open', 'level.up#big', 'achievement#epic', 'level.up', 'achievement#rare', 'quest.complete', 'daily.done', 'achievement#common', 'codex.unlock'];
/** The rank of a cause, a state or a reward: higher plays first. Variants that are different causes have no rank among themselves. */
export function sentenceRank(id, variant) {
  const c = CLASS_OF[id];
  if (id === 'day.turn') return 7; // the new day outranks a manager's coin and a freight ding of the same step (the engine writes `cycle` before `day`): the chime was lost on every day a manager ran
  if (c === 'reward') {
    if (id === 'acad.graduate') return 125;
    if (id === 'acad.win') return 65;
    if (id === 'reward.also') return 1;
    let i = REWARD_ORDER.indexOf(id + '#' + variant);
    if (i < 0) i = REWARD_ORDER.indexOf(id);
    return i < 0 ? 5 : (REWARD_ORDER.length - i) * 10 + 20;
  }
  for (let g = 0; g < CAUSE_GROUPS.length; g++) for (const m of CAUSE_GROUPS[g]) if (m === id || (m.endsWith('.') && id.startsWith(m))) return (CAUSE_GROUPS.length - g) * 10;
  return 5;
}
/** Variants of one id that outrank one another, lowest first (the rank rule of the cooldown, 3.4.3). */
export const RANKED = { 'cash.in': ['settle', 's', 'm', 'l', 'xl'], 'cash.out': ['s', 'm', 'l'], achievement: ['common', 'rare', 'epic'], 'level.up': ['s', 'l', 'big'], 'zone.open': ['t1', 't2', 't3', 't4'], 'alert.advance': ['l1', 'l2', 'l3'] };
export const variantRank = (id, v) => { const l = RANKED[id]; return l ? Math.max(0, l.indexOf(v)) : 0; };
/** The big moments are serial (3.4.7): one at a time. */
export function isMoment(id, variant, tier) {
  if (['quest.complete', 'milestone', 'zone.open', 'acad.win', 'acad.graduate', 'draft.begin', 'run.end', 'alert.margin-call', 'alert.insolvent', 'perk.bailout'].includes(id)) return true;
  if (id === 'level.up') return variant !== 's';
  if (id === 'achievement') return variant === 'rare' || variant === 'epic';
  if (id === 'cash.in') return variant === 'xl';
  return tier === 'loud';
}

// ---- cooldowns (3.4.8), in milliseconds
const CD = {
  'ui.tick': 30, 'ui.select': 40, 'ui.crate': 40, 'ui.toggle': 60, 'pitch.angle': 60, 'draft.pick': 60, 'ui.slider': 80, clock: 100,
  'ui.drawer-open': 120, 'ui.drawer-close': 120, 'cash.in': 120, 'cash.out': 120, 'read.probe': 120, 'bid.raise': 120,
  'ui.dialog-open': 150, 'ui.dialog-close': 150, 'ui.ok': 150, cam: 150, 'repair.stop': 150,
  'haggle.anchor': 200, 'haggle.move': 200, 'bid.rival': 200,
  'ui.ask': 300, 'sale.win': 300, 'sale.pioneer': 300, 'sale.herd': 300, 'sale.flat': 300, 'sale.reject': 300, 'buy.lot': 300, 'haggle.tell': 300, 'bid.drop': 300,
  'world.hover': 330, 'world.step': 360, 'ui.nudge': 400, streak: 400, 'manager.cycle': 400, 'deal.open': 500,
  'ui.count-up': 600, 'sale.scam': 600, 'pool.sell': 600, 'deal.stage-done': 600, 'deal.quick': 600, 'deal.verify': 600, 'haggle.leverage': 600, 'haggle.close': 600, 'skill.up': 600, 'acad.step': 600, 'acad.teach': 600,
  'ui.refuse': 700, 'deal.result': 800, 'pitch.fit': 800, 'bid.hammer': 800, 'repair.done': 800, 'hire.manager': 800, 'crew.build': 800, 'crew.client': 800, 'bank.draw': 800, 'bank.repay': 800,
  'world.locked': 900, 'ship.depart': 1000,
  'zone.enter': 1500, 'ship.arrive': 1500, 'ship.trouble': 1500, 'quest.complete': 1500, achievement: 1500, 'codex.unlock': 1500, 'swap.done': 1500, 'read.suspect': 1500,
  'audit.notice': 2000, 'audit.result': 2000, 'level.up': 2000, 'acad.win': 2000, 'inst.cue': 2000,
  'day.turn': 2500,
  'alert.advance': 3000, 'alert.shock': 3000, 'mentor.tip': 3000, 'swap.offer-in': 3000, 'reward.also': 3000,
  'zone.open': 4000, 'daily.done': 4000,
  'alert.margin-call': 5000, 'alert.insolvent': 5000, 'perk.bailout': 5000, milestone: 5000, 'acad.graduate': 5000, 'draft.begin': 5000,
  'run.end': 8000, 'buyer.urgent': 20000, 'buyer.arrive': 30000,
};
/** Different causes inside one id have a cooldown each (a Fed announcement is not silenced by a viral one). */
export const CD_PER_VARIANT = new Set(['alert.shock', 'ship.trouble', 'haggle.tell']);
const CD_BY_VARIANT = { achievement: { common: 3000 } };
// Per variant: the loss twin of a gain is a little softer than it (2.2: spending is quieter than earning). Calibration levels every variant of a tier to the same target, which took the softness away.
const VARIANT_TRIM = { 'cash.out#l': -1.5, 'sale.herd#h': -1.5, 'sale.scam#s': -3, 'sale.reject#nofit': -1, 'ui.toggle#off': -1.5, 'pitch.fit#down': -1.5 };
export const trimDbOf = (id, variant) => (RECIPES[id]?.trimDb || 0) + (VARIANT_TRIM[id + '#' + variant] || 0);
const TUNED = {}; // the +3 dB of the refusal sounds is gone: a mis-click is never louder than a confirmation (2.2), and its body (a D4 sine and a knock at 440 Hz) carries it on a laptop instead

export const RECIPES = {};
for (const e of SOUNDS) {
  if (RECIPES[e.id]) throw new Error('duplicate sound id ' + e.id);
  if (!CLASS_OF[e.id]) throw new Error('no class for ' + e.id);
  if (CD[e.id] == null) throw new Error('no cooldown for ' + e.id);
  RECIPES[e.id] = { ...e, cd: CD[e.id], cdByVariant: CD_BY_VARIANT[e.id] || null, class: CLASS_OF[e.id], player: isPlayer(e.id), rank: sentenceRank(e.id), perVariant: CD_PER_VARIANT.has(e.id), ...(TUNED[e.id] || {}) };
}
export const IDS = Object.keys(RECIPES);
export const CLOCK_IDS = new Set(CLASS.clock);

const flat = (x) => x.flat(Infinity).filter(Boolean);
export const variantsOf = (id) => Object.keys(RECIPES[id]?.variants || {});
export const firstVariant = (id) => variantsOf(id)[0];
/** The tier of one variant: tiny, medium or loud. */
export const tierOf = (id, variant) => { const e = RECIPES[id]; return !e ? 'tiny' : e.variants[variant]?.tier || e.tier; };
export const cooldownOf = (id, variant) => { const e = RECIPES[id]; return e?.cdByVariant?.[variant] ?? e?.cd ?? 0; };
/** The flat layers of one variant. `params` are the caller's (n, i, v...), `k` the pool member. */
export function layersFor(id, variant, params = {}, k = 0) {
  const e = RECIPES[id];
  if (!e) return [];
  const v = e.variants[variant] ?? e.variants[firstVariant(id)];
  return flat(e.build({ ...v, ...params, k }));
}
/** The calibrated trim in dB of one variant (js/audio/trims.js, written by scripts/audio-check.mjs --calibrate). */
export const trimFor = (id, variant, k = 0) => TRIMS.sounds?.[id + '#' + variant + (k ? '@' + k : '')] ?? TRIMS.sounds?.[id + '#' + variant] ?? 0; // a pool member has a trim of its own when it sounds louder or softer than the first

// ---- levels (3.2): the K-weighted active level every variant is trimmed to, and the peak it may not pass before the buses
export const TIER_TARGET = { tiny: -30, medium: -24, loud: -17, amb: -32 };
export const TIER_CEIL = { tiny: -6, medium: -6, loud: -3, amb: -6 };
export const TIER_MAX_MS = { tiny: 1000, medium: 1500, loud: 3000, amb: 3000 };
/** The tier's compensation: the tiny tier follows the whole curve, the medium tier only its positive part (a short medium sound, a purchase of 140 ms, is as much under its tier on the Fast meter as a tick; a long one is not touched, so the gap to the loud tier holds), the loud tier none. */
export const tierComp = (tier, ms) => tier === 'tiny' ? durationComp(ms) : tier === 'medium' ? Math.max(0, durationComp(ms)) : 0;
/** Loudness rises with duration up to about 200 ms and the frame-based level does not, so the tiny tier is compensated along a smooth curve: +5.5 dB at 40 ms or less, +3.3 at 105 ms, +1.5 at 190 ms, nothing at 360 ms, -1 from 700 ms (3.2). */
const COMP = [[40, 5.5], [75, 4.5], [105, 3.3], [140, 2.6], [190, 1.5], [260, 0.7], [360, 0], [500, -0.9], [700, -1]];
export const durationComp = (ms) => { // measured: the 125 ms Fast level of a tiny sound is 6.5 dB under its active level at 40 ms and 1.2 dB over at 600 ms, smoothly; the compensation follows that curve at about 85%
  if (ms <= COMP[0][0]) return COMP[0][1];
  for (let i = 1; i < COMP.length; i++) if (ms <= COMP[i][0]) { const [x0, y0] = COMP[i - 1], [x1, y1] = COMP[i]; return Math.round((y0 + (y1 - y0) * (ms - x0) / (x1 - x0)) * 10) / 10; }
  return COMP[COMP.length - 1][1];
};
