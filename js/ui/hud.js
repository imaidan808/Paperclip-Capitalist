// The overlay on top of the world: player card, the three numbers that matter, the clock, the mission tracker and the news ticker.
// Pure builders: (ctx) -> HTML. Interaction is data-act attributes handled in shell.js.
import { PERKS, TOTAL_DAYS, xpForLevel } from '../config.js';
import { fmtMoney as money } from '../market.js';
import { esc, settings } from './common.js';
import { audio, speakerState, audioDefaults } from '../audio/index.js';

const lvlBase = xpForLevel; // the engine's level curve (config.js)

export function playerCard(ctx) {
  const g = ctx.g(), s = g.s, lv = g.level(), lo = lvlBase(lv), hi = lvlBase(lv + 1), p = Math.max(0, Math.min(1, (s.xp - lo) / (hi - lo)));
  const icons = s.perks.map((id) => `<i title="${esc(PERKS[id].name)}">${PERKS[id].icon}</i>`).join('') || '<i>📎</i>';
  if (g.sandbox) { // a lesson is a rehearsal in a game of its own: the XP, the level and the skill points it adds up are not the player's, so none is shown (the reward screen pays the real ones)
    return `<button class="pcard" data-anchor="player-card" data-act="dock" data-d="quests" aria-label="${esc(s.handle)}, practicing a lesson. Open quests and skills.">
    <span class="ring" style="--p:0%"><span class="av">${icons}</span></span>
    <span class="who"><b>${esc(s.handle)}</b><small>Practice, nothing here is saved</small></span></button>`;
  }
  return `<button class="pcard" data-anchor="player-card" data-act="dock" data-d="quests" aria-label="${esc(s.handle)}, level ${lv}, ${s.points} skill point${s.points === 1 ? '' : 's'}. Open quests and skills.">
    <span class="ring" style="--p:${(p * 100).toFixed(1)}%"><span class="av">${icons}</span><b class="lv">${lv}</b>${s.points ? '<i class="pip" aria-hidden="true"></i>' : ''}</span>
    <span class="who"><b>${esc(s.handle)}</b><small>${s.xp - lo} / ${hi - lo} XP${s.points ? ` <span class="pt">${s.points} point${s.points === 1 ? '' : 's'} to spend</span>` : ''}</small></span></button>`;
}

// The speaker button (docs/AUDIO.md 7.3): pressed means sound is ON, so its name is always "Sound" and a screen reader says "Sound, toggle button, pressed". Left out where Web Audio does not exist.
const SPEAKER = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor"/>';
const SPEAKER_ON = SPEAKER + '<path d="M11 5.5a3.5 3.5 0 010 5M12.5 3.5a6 6 0 010 9" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
const SPEAKER_OFF = SPEAKER + '<path d="M11.5 6l3.5 4M15 6l-3.5 4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
export function speakerHTML() {
  if (!audio.supported) return '';
  const { on, title } = speakerState(settings.audio || audioDefaults()); // pressed only when something can be heard: at volume 0 the speaker is not "on"
  return `<button class="ibtn" data-act="sound" data-fid="hud-sound" aria-pressed="${on}" aria-label="Sound" title="${title}">${on ? SPEAKER_ON : SPEAKER_OFF}</button>`;
}

export function hudHTML(ctx) {
  const { S, U } = ctx, g = ctx.g(), s = g.s, nw = g.netWorth(), prev = U.prev || {};
  const fl = (k, v) => (prev[k] == null || Math.abs(v - prev[k]) < 0.005 ? '' : v > prev[k] ? ' up' : ' down');
  U.prev = { cash: s.cash, nw };
  const clock = S.canSetClock()
    ? `<button class="ibtn" data-anchor="hud-clock" data-act="pause" aria-pressed="${S.clock.paused}" aria-label="${S.clock.paused ? 'Resume the clock' : 'Pause the clock'}">${S.clock.paused ? '▶' : '⏸'}</button>
       <label class="sr" for="spd">Game speed</label><select id="spd" data-change="speed" data-fid="spd">${[0.25, 1, 4, 16, 64].map((v) => `<option value="${v}" ${S.clock.speed === v ? 'selected' : ''}>${v}x</option>`).join('')}</select>`
    : `<span class="chip info">Class clock ${S.clock.paused ? 'paused' : S.clock.speed + 'x'}</span>`;
  const refused = S.room?.state === 'refused';
  const room = S.roomInfo ? `<span class="chip ${S.room?.state === 'open' ? 'good' : 'warn'}"${refused ? ' title="The relay refused this device: its Founder ID is in use in this room by another connection."' : ''}>Room ${esc(S.roomInfo.code)}${refused ? ' (not joined)' : ''}</span>` : '';
  return `${playerCard(ctx)}
    <div class="res" role="group" aria-label="Your numbers">
      <button class="rs${fl('cash', s.cash)}" data-anchor="hud-cash" data-act="breakdown" data-k="cash" data-fid="r-cash"><small>Cash</small><b class="mono gold">${money(s.cash)}</b></button>
      <button class="rs${fl('nw', nw)}${s.insolvent ? ' neg' : ''}" data-anchor="hud-networth" data-act="breakdown" data-k="nw" data-fid="r-nw"><small>Net worth</small><b class="mono">${money(nw)}</b></button>
      <button class="rs" data-anchor="hud-day" data-act="breakdown" data-k="day" data-fid="r-day"><small>Day</small><b class="mono">${g.day}<span class="mute">/${TOTAL_DAYS}</span></b><span class="bar" role="progressbar" aria-label="Game progress" aria-valuemin="0" aria-valuemax="${TOTAL_DAYS}" aria-valuenow="${g.day}"><i data-bar="day"></i></span></button>
    </div>
    <div class="ctl">${room}${clock}${speakerHTML()}<button class="ibtn" data-act="help" aria-label="Help">?</button><button class="ibtn" data-act="menu" aria-label="Menu">☰</button></div>`;
}

/** The current objective: an Academy mission while the player is learning, otherwise the lowest-district active quest. */
export function trackerHTML(ctx) {
  const t = ctx.U.tracker?.(ctx) ?? (() => { const q = ctx.progress?.current(); return q ? { title: q.def.title, desc: q.def.desc, icon: q.def.icon, p: q.p, n: q.n, drawer: 'quests' } : null; })();
  if (!t) return '';
  const f = t.n ? Math.max(0, Math.min(1, t.p / t.n)) : 0;
  // Reading order is Goal, title, words, count; the stylesheet lays the count at the top right and, on a small screen, shows only title and bar (the rest is read out).
  return `<button class="tracker" data-anchor="tracker" data-act="dock" data-d="${t.drawer || 'quests'}"><small class="tk-lb">Goal</small><b>${t.icon || '🎯'} ${esc(t.title)}</b><span class="tk-ds">${esc(t.desc || '')}</span>${t.n ? `<span class="bar green" role="progressbar" aria-valuemin="0" aria-valuemax="${t.n}" aria-valuenow="${Math.min(t.p, t.n)}" aria-label="Goal progress"><i style="width:${f * 100}%"></i></span><small class="mono tk-ct">${Math.min(+t.p.toFixed(1), t.n)} / ${t.n}</small>` : ''}</button>`;
}

export function tickerHTML(ctx) {
  const all = ctx.g().s.news, list = ctx.g().sandbox ? all.filter((x) => typeof x.level !== 'number') : all; // a lesson's pretend level-up (the engine's note carries the new level as a number) is not news
  const n = list.find((x) => x.level !== 'info' || x.milestone) || list[0];
  if (!n) return '';
  const idx = all.indexOf(n);
  return `<button class="tick ${n.level}" data-anchor="ticker" data-act="${n.alert ? 'alert' : 'dock'}" data-i="${idx}" data-d="quests"><small>Day ${Math.floor(n.h / 24) + 1}</small> <span class="tk-t">${esc(n.text)}</span></button>`;
}
