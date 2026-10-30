// What the audition page (dev/sounds.html) groups by: meaning, not by the first word of an id. The groups are the grammar of docs/AUDIO.md 2.2 (gain, loss, neutral, warning, refusal, size, progress, rarity),
// then the sounds of each part of the game. An item is an id (every variant of it) or `id#variant`. A sound may stand in more than one group; every sound stands in at least one (tests/audio-repair.test.mjs).
export const SECTIONS = [
  { id: 'gain', title: 'Gains: it went up', blurb: 'Rising notes and bright coins; the last note is higher than the first. Spending is the mirror, in the next group.',
    items: ['cash.in', 'sale.win', 'sale.pioneer', 'streak', 'pitch.fit#up', 'deal.verify#ok', 'audit.result#pass', 'bank.repay', 'repair.done#great', 'repair.done#ok', 'bid.hammer#won', 'haggle.close#accept', 'hire.manager', 'crew.build', 'crew.client', 'swap.done', 'pool.sell', 'perk.bailout', 'skill.up'] },
  { id: 'loss', title: 'Losses: it went down', blurb: 'The twin of a gain: lower, darker and a little softer (never louder than the gain it mirrors); it still has a body above 250 Hz so a laptop plays it.',
    items: ['cash.out', 'sale.herd#h', 'sale.scam', 'sale.reject', 'ui.toggle#off', 'bank.draw', 'audit.result#fail', 'bid.hammer#lost', 'repair.done#rough', 'pitch.fit#down', 'repair.stop#miss', 'ship.trouble', 'bid.rival#out'] },
  { id: 'neutral', title: 'Neutral: I heard you, something happened', blurb: 'Taps, panels, the camera and the clock. They carry no good or bad news.',
    items: ['ui.tick', 'ui.toggle#on', 'ui.select', 'ui.crate', 'ui.slider', 'ui.drawer-open', 'ui.drawer-close', 'ui.dialog-open', 'ui.dialog-close', 'ui.ok', 'ui.count-up', 'clock', 'cam', 'world.hover', 'world.step', 'zone.enter', 'day.turn', 'buyer.arrive', 'buyer.urgent', 'ship.arrive', 'mentor.tip', 'manager.cycle', 'codex.unlock', 'daily.done', 'reward.also'] },
  { id: 'warning', title: 'Warnings: look again', blurb: 'The falling minor third (A4 F#4) in different weights: a question, a nudge, a macro alert, an audit letter.',
    items: ['ui.nudge', 'ui.ask', 'alert.advance', 'alert.shock', 'audit.notice', 'read.suspect', 'alert.margin-call', 'alert.insolvent', 'deal.verify#bad', 'haggle.tell'] },
  { id: 'refusal', title: 'Refusals: no', blurb: 'Short, low and soft, never a buzzer, and no louder than a confirmation. A repeat inside 2 s is 4 dB down, a third is silent.',
    items: ['ui.refuse', 'world.locked', 'acad.teach#wrong'] },
  { id: 'ladders', title: 'Size and severity: bigger is brighter and longer', blurb: 'Money by size; alerts by level; the rarity of an achievement; a district by tier; levels by weight; milestones by number.',
    items: ['cash.in', 'cash.out', 'alert.advance', 'achievement', 'zone.open', 'level.up', 'milestone', 'ui.drawer-open'] },
  { id: 'progress', title: 'Progress and rarity: you moved forward', blurb: 'Rewards play one full sentence at a time (the collector), then a small tick for the rest.',
    items: ['level.up', 'quest.complete', 'achievement', 'milestone', 'zone.open', 'acad.step', 'acad.teach', 'acad.win', 'acad.graduate', 'draft.pick', 'draft.begin', 'run.end', 'inst.cue'] },
  { id: 'deal', title: 'The Deal Room: each move has a voice', blurb: 'Read, pitch, haggle, bid, repair. A move that can fail sounds at the click; the outcome is a sound of its own.',
    items: ['deal.open', 'deal.stage-done', 'deal.quick', 'deal.verify', 'deal.result', 'read.probe', 'pitch.angle', 'haggle.anchor', 'haggle.move', 'haggle.leverage', 'haggle.close', 'bid.raise', 'bid.rival', 'bid.drop', 'repair.stop', 'repair.done'] },
  { id: 'money', title: 'Money and trade', blurb: 'What a sale, a purchase and a pool sale sound like, with their coins.',
    items: ['sale.win', 'sale.pioneer', 'sale.herd', 'sale.flat', 'sale.reject', 'sale.scam', 'buy.lot', 'pool.sell', 'cash.in', 'cash.out', 'streak', 'manager.cycle'] },
  { id: 'crew', title: 'Crew, freight, bank and audits', blurb: 'Hiring, building, contracts, trucks, loans and the audit.',
    items: ['hire.manager', 'crew.build', 'crew.client', 'ship.depart', 'ship.arrive', 'ship.trouble', 'bank.draw', 'bank.repay', 'audit.notice', 'audit.result', 'swap.offer-in', 'swap.done'] },
];
/** Gain and loss side by side (A then B): the audition page plays each pair with a gap, so the difference is heard, not read. */
export const PAIRS = [['cash.in#m', 'cash.out#m'], ['cash.in#l', 'cash.out#l'], ['sale.win#w', 'sale.herd#h'], ['sale.win#w', 'sale.reject#nofit'], ['sale.win#w', 'sale.scam#s'], ['ui.toggle#on', 'ui.toggle#off'], ['pitch.fit#up', 'pitch.fit#down'],
  ['deal.result#good', 'deal.result#bad'], ['audit.result#pass', 'audit.result#fail'], ['bid.hammer#won', 'bid.hammer#lost'], ['repair.done#great', 'repair.done#rough'], ['bank.repay#full', 'bank.draw#b'], ['cam#in', 'cam#out'], ['clock#resume', 'clock#pause'], ['ui.ok#o', 'ui.refuse#r']];
/** Ladders played in sequence, smallest first. */
export const LADDERS = [['cash.in#s', 'cash.in#m', 'cash.in#l', 'cash.in#xl'], ['cash.out#s', 'cash.out#m', 'cash.out#l'], ['alert.advance#l1', 'alert.advance#l2', 'alert.advance#l3'], ['achievement#common', 'achievement#rare', 'achievement#epic'],
  ['zone.open#t1', 'zone.open#t4'], ['level.up#s', 'level.up#l', 'level.up#big'], ['milestone#m1', 'milestone#m2', 'milestone#m3'], ['haggle.tell#far', 'haggle.tell#reach', 'haggle.tell#near'], ['ui.slider#zero', 'ui.slider#mid', 'ui.slider#top']];
/** A minute of ordinary play, as events: [seconds, kind, payload]. Replayed through the real wiring tables (eventCalls, noteCalls, uiCalls, controlFor), so what is heard is what the game would say, with the engine's own gates. */
export const MINUTE = [
  [0.5, 'control', { act: 'dock', kind: 'click', id: 'market' }], [1.2, 'ui', { ui: 'hover', id: 'lead|L1' }], [2, 'ui', { ui: 'step' }], [2.4, 'ui', { ui: 'step' }], [2.8, 'ui', { ui: 'step' }], [3.2, 'ui', { ui: 'step' }],
  [4, 'ui', { ui: 'lead', ids: ['L7'] }], [5, 'control', { act: 'market-tab', kind: 'click', index: 1 }], [6.5, 'event', { type: 'pitch', outcome: 'win', price: 640, gain: 0.12, zone: 1 }], [6.5, 'event', { type: 'streak', n: 2 }], [6.5, 'event', { type: 'level', level: 3 }],
  [9, 'control', { act: 'drawer-close', kind: 'click' }], [10.5, 'control', { act: 'stock-pick', kind: 'change', count: 2 }], [12, 'event', { type: 'sell-pool', zone: 1, total: 1200, count: 2 }], [14, 'control', { act: 'tab', kind: 'click' }],
  [16, 'event', { type: 'cycle', zone: 1, net: 30 }], [17, 'event', { type: 'day', day: 2 }], [19, 'note', { text: 'Freight arrived in Harbor.' }], [21, 'event', { type: 'buy', zone: 1, price: 180, cond: 'ok' }],
  [24, 'control', { act: 'bank-draw', kind: 'click' }], [24.2, 'event', { type: 'draw', amount: 2500 }], [27, 'event', { type: 'shock', kind: 'tiktok' }], [27.2, 'note', { text: 'Macro warning: Fed rate hike, effective in 3 days.', alert: { level: 1 } }],
  [31, 'ui', { ui: 'locked', id: 'plot|P3' }], [31.6, 'ui', { ui: 'locked', id: 'plot|P3' }], [32, 'ui', { ui: 'locked', id: 'plot|P3' }], [35, 'event', { type: 'hire', kind: 'student', zone: 1 }], [38, 'event', { type: 'cycle', zone: 1, net: -12 }],
  [41, 'event', { type: 'pitch', outcome: 'pioneer', price: 2400, gain: 0.3, zone: 1 }], [41, 'event', { type: 'streak', n: 3 }], [41, 'event', { type: 'level', level: 5 }], [41, 'event', { type: 'milestone', n: 1 }],
  [46, 'ui', { ui: 'zone', id: 2 }], [49, 'ui', { ui: 'lead', ids: ['L9'], urgent: true }], [52, 'event', { type: 'pitch', outcome: 'herd', price: 300, gain: -0.1, zone: 1 }], [55, 'event', { type: 'day', day: 3 }], [57, 'event', { type: 'repay', amount: 500 }],
];
