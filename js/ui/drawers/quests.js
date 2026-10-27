// Quests drawer: the progression game. Level, streak and reputation, the three skills, the quest chain, daily bounties and achievement badges
// (docs/V2_DESIGN.md sections 8 and 12). Contract: see the header of ../shell.js. Quest, bounty and badge data come from ctx.progress (js/meta/progress.js);
// with no progress tracker (tests) the sections that need it are left out. State kept on the shared UI object U:
//   U.quests  { ach: 'all' | 'earned' | 'todo', achAll: boolean, doneOpen: boolean }   the badge filter, the long list and the folded "done" list
// Every control is a real button with a stable data-fid, so the shell can give back focus after it redraws the drawer.
import { SKILLS, SKILL_MAX, PERKS, ZONES, xpForLevel } from '../../config.js';
import { esc } from '../common.js';
import { fmtMoney as money, restoreQuality } from '../../market.js';
import { QUEST_BY_ID } from '../../meta/progress.js';
import { goToDistrict, keepScroll } from './travel.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const pctN = (x) => Math.round(x * 100);
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const lvlBase = xpForLevel; // the engine's level curve (config.js)
const MONEY_SUMS = new Set(['amount', 'net', 'price', 'surplus', 'total', 'gain', 'cost']);
const fmtN = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(x < 10 ? 1 : 0));
const fmtX = (x) => (x >= 10 ? String(Math.round(x)) : String(Math.round(x * 10) / 10));
const RARITY = { common: ['●', 'Common'], rare: ['◆', 'Rare'], epic: ['★', 'Epic'] };
const ACH_SHOWN = 12;

const Q = (ctx) => ctx.U.quests || {};
/** "3 / 5" for a goal; money for the goals that add up dollars. */
function progText(goal, p) {
  const f = goal.sum && MONEY_SUMS.has(goal.sum) ? money : fmtN;
  return `${f(Math.min(p, goal.count))} / ${f(goal.count)}`;
}
const barPct = (p, n) => Math.round(clamp(n ? p / n : 0, 0, 1) * 100);
function bar(label, p, n, cls = 'green') {
  const v = barPct(p, n);
  return `<span class="bar ${cls}" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}"><i style="width:${v}%"></i></span>`;
}
const xpOf = (ctx, xp) => Math.round(xp * (ctx.g().P.xpMult ?? 1));
function rewardChips(ctx, r = {}) {
  return `${r.xp ? `<span class="chip info">+${xpOf(ctx, r.xp)} XP</span>` : ''}${r.points ? `<span class="chip good">+${plural(r.points, 'skill point')}</span>` : ''}`;
}

// ------------------------------------------------------------------ skills: what each level does, from the engine's own formulas
const EFFECTS = {
  ops: [
    ['Repair bill', (l) => `${fmtX(100 * 0.42 ** (l - 1))}% of list`],
    ['Repairs restore', (l) => `${pctN(restoreQuality(l))}% quality`],
    ['Damage risk in freight', (l) => `${pctN(clamp(0.3 - 0.05 * l, 0.03, 0.3))}% a trip`],
  ],
  growth: [
    ['Buyers arriving', (l) => `+${pctN(0.15 * (l - 1))}%`],
    ['Pitch prices', (l) => `+${pctN(0.04 * (l - 1))}%`],
    ['Manager cycles', (l) => `+${pctN(0.15 * (l - 1))}% faster`],
  ],
  fintech: [
    ['Trading fees', (l) => `-${pctN(1 - Math.max(0.5, 1 - 0.06 * (l - 1)))}%`],
    ['Loan interest', (l) => `-${pctN(1 - Math.max(0.45, 1 - 0.07 * (l - 1)))}%`],
    ['Early warning of shocks', (l) => (l >= 5 ? '7 days' : l >= 3 ? '3 days' : '12 hours')],
  ],
};
const DEAL = {
  ops: 'In the Deal Room: more Inspect probes, sharper reads and a wider sweet spot when you repair.',
  growth: 'In the Deal Room: more hints about what a buyer wants and a clearer read on their limit.',
  fintech: 'At auctions: a sharper estimate of what a lot is really worth.',
};
const BONUS_KEY = { ops: 'opsBonus', growth: 'growthBonus', fintech: 'fintechBonus' };

function skillCard(ctx, k) {
  const g = ctx.g(), s = g.s, K = SKILLS[k], base = s.skills[k], eff = g.lvl(k), bonus = g.P[BONUS_KEY[k]] || 0, maxed = base >= SKILL_MAX;
  const from = s.perks.map((id) => [PERKS[id]?.name, PERKS[id]?.mods?.[BONUS_KEY[k]]]).filter(([n, v]) => n && v);
  const nextEff = Math.min(SKILL_MAX + 2, eff + 1);
  const pips = Array.from({ length: SKILL_MAX }, (_, i) => `<span class="qs-pip${i < base ? ' on' : ''}"></span>`).join('')
    + (bonus > 0 ? Array.from({ length: bonus }, () => '<span class="qs-pip bonus"></span>').join('') : '');
  const rows = EFFECTS[k].map(([label, f]) => {
    const now = f(eff), nx = f(nextEff);
    return `<li><span class="lb">${esc(label)}</span><span class="now">${esc(now)}</span>${!maxed && nx !== now ? `<span class="nx"><span class="sr">At the next level: </span><span aria-hidden="true">→ </span>${esc(nx)}</span>` : ''}</li>`;
  }).join('');
  const can = !maxed && s.points >= 1;
  const label = maxed ? 'Mastered' : s.points >= 1 ? `Spend a point: level ${base} → ${base + 1}` : `Level ${base} → ${base + 1} needs a skill point`;
  return `<article class="qs-skill${can ? ' ready' : ''}" data-skill="${k}">
    <header><h4>${esc(K.name)}</h4>${s.specialty === k ? '<span class="chip warn">★ Specialty</span>' : ''}</header>
    <div class="qs-pips" role="img" aria-label="Level ${base} of ${SKILL_MAX}${bonus ? `, ${bonus > 0 ? 'plus' : 'minus'} ${Math.abs(bonus)} from your Backgrounds, effective level ${eff}` : ''}">${pips}</div>
    <p class="small qs-lv">Level <b>${base}</b>${bonus ? ` ${bonus > 0 ? '+' : '-'} <b>${Math.abs(bonus)}</b> from ${esc(from.map(([n]) => n).join(' and ') || 'your Backgrounds')} = effective level <b>${eff}</b>` : ''}${maxed ? '. Mastery reached.' : ''}</p>
    <ul class="qs-fx" aria-label="What this skill does at your level">${rows}</ul>
    <p class="tiny mute">${esc(K.blurb)} ${esc(DEAL[k])}</p>
    <button class="btn${can ? '' : ' ghost'}" data-act="quests-spend" data-k="${k}" data-fid="qs-sp-${k}"${can ? '' : ' aria-disabled="true"'}>${esc(label)}</button>
  </article>`;
}

// ------------------------------------------------------------------ hero: level, points, streak, reputation
const REP_WORDS = [[80, 'Trusted'], [60, 'Respected'], [40, 'Known'], [20, 'Shaky'], [0, 'Doubtful']];
function heroHTML(ctx) {
  const g = ctx.g(), s = g.s, lv = g.level(), lo = lvlBase(lv), hi = lvlBase(lv + 1), into = Math.max(0, s.xp - lo), need = hi - lo;
  const p = Math.round(clamp(into / need, 0, 1) * 100), xm = g.P.xpMult ?? 1, rep = Math.round(clamp(s.rep, 0, 100));
  const word = REP_WORDS.find(([min]) => rep >= min)[1], flow = 0.85 + 0.003 * rep;
  const streakLine = s.streak > 0
    ? `Your next win earns <b>+${5 * (s.streak + 1)} bonus XP</b>. A trade with no gain ends the streak.`
    : 'Win a trade to start a streak. Every win in a row adds more bonus XP to the next one.';
  return `<section class="qs-hero" aria-label="Your progress">
    <div class="qs-lvl"><div class="qs-ring" style="--p:${p}%" role="img" aria-label="Level ${lv}, ${p} percent of the way to level ${lv + 1}"><b>${lv}</b></div>
      <div class="qs-lvtx"><h3>Level ${lv}</h3>${bar(`XP toward level ${lv + 1}`, into, need, 'gold')}
        <p class="small"><b>${into}</b> / ${need} XP. <b>${Math.max(0, need - into)}</b> to level ${lv + 1}, which earns a skill point.</p>
        ${xm !== 1 ? `<p class="tiny mute">Your Backgrounds: all XP ${xm > 1 ? '+' : '-'}${pctN(Math.abs(xm - 1))}%.</p>` : ''}</div></div>
    <div class="qs-stats">
      <div class="qs-stat pts${s.points ? ' on' : ''}"><span aria-hidden="true">🎓</span><div><b>${s.points}</b> skill point${s.points === 1 ? '' : 's'} to spend<small>${s.points ? 'Spend them on a skill below.' : 'Every level you earn gives one.'}</small></div></div>
      <div class="qs-stat"><span aria-hidden="true">🔥</span><div>Win streak <b>${s.streak}</b> <span class="mute">(best ${s.bestStreak})</span><small>${streakLine}</small></div></div>
    </div>
    <div class="qs-rep"><div class="qs-reprow"><span>Reputation: <b>${word}</b></span><span class="mono">${rep} / 100</span></div>
      <div class="qs-meter" role="meter" aria-label="Reputation" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${rep}" aria-valuetext="${rep} of 100, ${word}"><i style="width:${rep}%"></i></div>
      <p class="tiny mute">Buyers arrive at <b>${flow.toFixed(2)}x</b> speed at this reputation. Each win adds 1. A rejected pitch costs 10.</p></div>
  </section>`;
}

// ------------------------------------------------------------------ quests
function questCard(ctx, v, kind, full = true) {
  const d = v.def, Z = ZONES[d.zone], open = ctx.g().s.zones.includes(d.zone);
  const where = `${Z?.icon || ''} ${esc(Z?.name || '')}`;
  if (kind === 'active') {
    const here = ctx.U.zone === d.zone, shut = !open && Z ? `Open ${Z.name} first: it needs ${money(Z.gate)} net worth (${money(Math.max(0, Z.gate - ctx.g().netWorth()))} to go).` : '';
    return `<article class="qs-q active"><header><span class="qs-ic" aria-hidden="true">${esc(d.icon)}</span><div><h4>${esc(d.title)}</h4><small>${where}</small></div></header>
      <p class="small">${esc(d.desc)}</p>${shut ? `<p class="tiny qs-need">${esc(shut)}</p>` : ''}
      <div class="qs-prog">${bar(`${d.title} progress`, v.p, v.n)}<b class="mono">${progText(d.goal, v.p)}</b></div>
      <div class="qs-rw"><span class="mute">Reward</span> ${rewardChips(ctx, d.reward)}${here || !open ? '' : `<button class="btn sm ghost" data-act="quests-go" data-dist="${d.zone}" data-fid="qs-go-${d.id}">Go to ${esc(Z?.short || 'district')}</button>`}</div></article>`;
  }
  const need = d.after && QUEST_BY_ID[d.after] ? `Unlocks after “${QUEST_BY_ID[d.after].title}”.` : '';
  const gate = !open && Z ? `Open ${Z.name} first: it needs ${money(Z.gate)} net worth.` : '';
  return `<article class="qs-q locked"><header><span class="qs-ic" aria-hidden="true">🔒</span><div><h4>${esc(d.title)}</h4><small>${where}</small></div></header>
    ${full ? `<p class="small">${esc(d.desc)}</p>` : ''}<p class="tiny qs-need">${esc([need, gate].filter(Boolean).join(' '))}</p>
    <div class="qs-rw"><span class="mute">Reward</span> ${rewardChips(ctx, d.reward)}</div></article>`;
}
function distHead(id, extra = '') {
  const Z = ZONES[id];
  return `<h4 class="qs-dist"><span aria-hidden="true">${Z?.icon || ''}</span> ${esc(Z?.name || 'District')}${extra ? ` <small>${esc(extra)}</small>` : ''}</h4>`;
}
function questsHTML(ctx) {
  const pr = ctx.progress, s = ctx.g().s, all = pr.quests(), reach = Math.max(...s.zones) + 1;
  const done = all.filter((v) => v.state === 'done');
  const now = all.filter((v) => v.state === 'active' && v.def.zone <= reach); // the same reach the Goal card in the HUD uses
  const later = all.filter((v) => v.state !== 'done' && !now.includes(v) && v.def.zone <= reach);
  const byDist = (list) => { const m = new Map(); for (const v of list) { if (!m.has(v.def.zone)) m.set(v.def.zone, []); m.get(v.def.zone).push(v); } return [...m.entries()].sort((a, b) => a[0] - b[0]); };
  const doneOpen = !!Q(ctx).doneOpen, preview = new Set(later.slice(0, 2).map((v) => v.def.id)); // only the next two upcoming quests spell out their goal
  const nowHTML = now.length ? `<div class="qs-grp"><h4 class="qs-lab">Now</h4>${now.map((v) => questCard(ctx, v, 'active')).join('')}</div>`
    : (all.length === done.length ? '<div class="callout good"><b>Every quest is done.</b> You walked the whole road.</div>' : '<div class="callout">No quest is waiting on you right now. The next one unlocks as you open more districts.</div>');
  const laterHTML = later.length ? `<div class="qs-grp"><h4 class="qs-lab">Coming up</h4>${byDist(later).map(([z, l]) => `<div class="qs-dgrp">${distHead(z)}${l.map((v) => questCard(ctx, v, 'locked', preview.has(v.def.id))).join('')}</div>`).join('')}</div>` : '';
  const doneHTML = done.length ? `<div class="qs-grp"><button class="btn sm ghost qs-fold" data-act="quests-done" data-fid="qs-fold" aria-expanded="${doneOpen}">${doneOpen ? 'Hide' : 'Show'} completed quests (${done.length})</button>
    ${doneOpen ? byDist(done).map(([z, l]) => `<div class="qs-dgrp">${distHead(z, `${l.length} done`)}<ul class="qs-donel">${l.map((v) => `<li><span aria-hidden="true">✓</span> <span class="sr">Done: </span>${esc(v.def.title)} <small>+${xpOf(ctx, v.def.reward.xp)} XP${v.def.reward.points ? ` and ${plural(v.def.reward.points, 'point')}` : ''}</small></li>`).join('')}</ul></div>`).join('') : ''}</div>` : '';
  return `<section class="sect" data-qsect="quests"><h3 tabindex="-1"><span>Quests</span><span>${done.length} of ${all.length} done</span></h3>${nowHTML}${laterHTML}${doneHTML}</section>`;
}

// ------------------------------------------------------------------ daily bounties
function dailiesHTML(ctx) {
  const list = ctx.progress.dailies() || [], n = list.filter((d) => d.done).length;
  const body = list.length ? `<div class="qs-days">${list.map((d) => `<article class="qs-day${d.done ? ' done' : ''}"><span class="qs-ic" aria-hidden="true">${d.done ? '✓' : esc(d.icon)}</span>
      <div><h4>${esc(d.title)}${d.done ? ' <span class="chip good">Done</span>' : ''}</h4><p class="small">${esc(d.desc)}</p>
      <div class="qs-prog">${bar(`${d.title} progress`, d.done ? d.goal.count : d.p, d.goal.count, d.done ? 'green' : 'gold')}<b class="mono">${progText(d.goal, d.done ? d.goal.count : d.p)}</b></div>
      <div class="qs-rw"><span class="mute">Reward</span> ${rewardChips(ctx, d.reward)}</div></div></article>`).join('')}</div>`
    : '<p class="small mute">Three fresh bounties arrive with every new day. Check back soon.</p>';
  return `<section class="sect" data-qsect="daily"><h3 tabindex="-1"><span>Daily bounties</span><span>${n} of ${list.length || 3} today</span></h3>${body}</section>`;
}

// ------------------------------------------------------------------ achievements
function achievementsHTML(ctx) {
  const all = ctx.progress.achievements(), q = Q(ctx), filt = q.ach === 'earned' || q.ach === 'todo' ? q.ach : 'all';
  const earned = all.filter((a) => a.done).length;
  const rar = (r) => { const l = all.filter((a) => a.def.rarity === r); return `<span class="qs-rarity ${r}"><span aria-hidden="true">${RARITY[r][0]}</span> ${RARITY[r][1]} ${l.filter((a) => a.done).length}/${l.length}</span>`; };
  const ratio = (a) => (a.n ? a.p / a.n : 0);
  let list = all.filter((a) => (filt === 'earned' ? a.done : filt === 'todo' ? !a.done : true));
  list = [...list].sort((a, b) => (b.done - a.done) || (a.hidden - b.hidden) || (ratio(b) - ratio(a))); // earned first, then the nearest to done, secrets last
  const shown = q.achAll ? list : list.slice(0, ACH_SHOWN);
  const chip = (k, label) => `<button class="btn sm ${filt === k ? '' : 'ghost'}" data-act="quests-ach" data-k="${k}" data-fid="qs-af-${k}" aria-pressed="${filt === k}">${label}</button>`;
  const tile = (a) => {
    const d = a.def, [shape, word] = RARITY[d.rarity] || RARITY.common;
    const cls = a.done ? 'earned' : a.hidden ? 'secret' : 'todo';
    const body = a.hidden ? '<p class="tiny mute">A secret badge. Keep playing and it will show itself.</p>'
      : `<p class="tiny">${esc(d.desc)}</p>${a.done ? '<p class="tiny qs-got"><b>✓ Earned</b></p>' : `<div class="qs-prog">${bar(`${d.title} progress`, a.p, a.n, 'gold')}<b class="mono tiny">${progText(d.goal, a.p)}</b></div>`}`;
    return `<li class="qs-ach ${d.rarity} ${cls}"><span class="qs-ic" aria-hidden="true">${a.hidden ? '?' : esc(d.icon)}</span>
      <div><h4>${a.hidden ? 'Secret badge' : esc(d.title)}</h4><span class="qs-rarity ${d.rarity}"><span aria-hidden="true">${shape}</span> ${word}${a.hidden ? ' · secret' : ''}</span>${body}
      ${a.done ? '' : `<div class="qs-rw">${rewardChips(ctx, d.reward)}</div>`}</div></li>`;
  };
  const more = list.length > ACH_SHOWN ? `<button class="btn sm ghost" data-act="quests-ach-all" data-fid="qs-ach-all" aria-expanded="${!!q.achAll}">${q.achAll ? 'Show fewer badges' : `Show all ${list.length} badges`}</button>` : '';
  return `<section class="sect" data-qsect="badges"><h3 tabindex="-1"><span>Achievements</span><span>${earned} of ${all.length} earned</span></h3>
    <p class="qs-rars">${rar('common')} ${rar('rare')} ${rar('epic')}</p>
    <div class="dtabs qs-filter" role="group" aria-label="Show badges">${chip('all', 'All')}${chip('earned', 'Earned')}${chip('todo', 'To earn')}</div>
    ${shown.length ? `<ul class="qs-achs">${shown.map(tile).join('')}</ul>` : '<p class="small mute">Nothing here yet. Badges you earn will hang in this case.</p>'}${more}</section>`;
}

// ------------------------------------------------------------------ the drawer
function html(ctx) {
  const g = ctx.g(), s = g.s, has = !!ctx.progress;
  const nav = `<nav class="qs-nav" aria-label="Jump to a section"><button class="btn sm ghost" data-act="quests-jump" data-to="skills" data-fid="qs-j-skills">Skills${s.points ? ` (${s.points})` : ''}</button>${has ? `<button class="btn sm ghost" data-act="quests-jump" data-to="quests" data-fid="qs-j-quests">Quests</button><button class="btn sm ghost" data-act="quests-jump" data-to="daily" data-fid="qs-j-daily">Daily</button><button class="btn sm ghost" data-act="quests-jump" data-to="badges" data-fid="qs-j-badges">Badges</button>` : ''}</nav>`;
  const skills = `<section class="sect" data-qsect="skills"><h3 tabindex="-1"><span>Skills</span><span>${plural(s.points, 'point')} to spend</span></h3><div class="qs-skills">${Object.keys(SKILLS).map((k) => skillCard(ctx, k)).join('')}</div></section>`;
  return `<div class="qs">${nav}${heroHTML(ctx)}${skills}${has ? `${questsHTML(ctx)}${dailiesHTML(ctx)}${achievementsHTML(ctx)}` : ''}</div>`;
}

function acts(ctx) {
  const set = (patch) => { ctx.U.quests = { ...(ctx.U.quests || {}), ...patch }; ctx.render(); };
  keepScroll(ctx, ['quests']);
  return {
    'quests-spend'(el) {
      if (!Object.prototype.hasOwnProperty.call(SKILLS, el.dataset.k)) return; // only the three skills, never a name that lives on the prototype
      const r = ctx.say(ctx.g().spendPoint(el.dataset.k));
      if (r.ok) { ctx.sfx?.level?.(); ctx.burst?.({ power: 0.8 }); }
      ctx.render();
    },
    'quests-go'(el) { goToDistrict(ctx, +el.dataset.dist); },
    'quests-done'() { set({ doneOpen: !Q(ctx).doneOpen }); },
    'quests-ach'(el) { set({ ach: ['earned', 'todo'].includes(el.dataset.k) ? el.dataset.k : 'all', achAll: false }); },
    'quests-ach-all'() { set({ achAll: !Q(ctx).achAll }); },
    'quests-jump'(el) {
      const sec = ctx.$?.(`[data-qsect="${el.dataset.to}"]`, ctx.el?.drawer);
      if (!sec) return;
      sec.scrollIntoView?.({ behavior: ctx.reduced?.() ? 'auto' : 'smooth', block: 'start' });
      sec.querySelector('h3')?.focus?.({ preventScroll: true });
    },
  };
}

export default {
  id: 'quests', icon: '🎯', label: 'Quests',
  visible: () => true,
  badge: (ctx) => (ctx.g().s.points > 0 ? ctx.g().s.points : null),
  html,
  acts,
};
