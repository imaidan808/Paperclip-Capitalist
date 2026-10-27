// Level 0: "The Zero-Dollar Hustle". Ungraded, about 90 seconds, high-feedback. Teaches asset valuation,
// buyer personas and the arbitrage loop, then hands over an automated broker to show working-capital velocity.
import { $, esc, setHTML, delegate, dlg, toast, announce, sfx, burst, reduced, money } from './common.js';
import { utilityScore } from '../market.js';
import { P, box, cyl, shadow, person, diamond, ellipse, tone, windows } from '../world/iso.js';

const LEVEL_XP = 300;
const level = (xp) => 1 + Math.floor(xp / LEVEL_XP);

// ---------------------------------------------------------------- isometric scenes (same primitives as the game world)
const dirt = (x, y) => ((x * 7 + y * 13) % 5 === 0 ? '#7a7566' : (x + y) % 2 ? '#705f45' : '#675840');
function floor(g, col) { for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) diamond(g, x, y, 1, 1, col(x, y), 'rgba(0,0,0,.14)', 0, 0.8); }
function npc(g, gx, gy, look, t, s = 1.25, moving = false) { const [x, y] = P(gx, gy); person(g, x, y, s, look, t, moving); }
function isoScene(g, kind, t) {
  const calm = reduced(), tt = calm ? 0 : t, k = 0.5 + 0.5 * Math.sin(tt / 400);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const sky = g.createLinearGradient(0, 0, 0, 360);
  const pal = { yard: ['#243a55', '#3b5a6e'], cafe: ['#3a2a22', '#5a4636'], office: ['#1f2a3d', '#3a4e6e'], shop: ['#20302a', '#2f4a3c'] }[kind];
  sky.addColorStop(0, pal[0]); sky.addColorStop(1, pal[1]); g.fillStyle = sky; g.fillRect(0, 0, 640, 360);
  const fit = { yard: [50, 0.9], cafe: [58, 0.9], office: [104, 0.8], shop: [54, 0.9] }[kind];
  g.save(); g.translate(320, fit[0]); g.scale(fit[1], fit[1]);
  const draws = [];
  const add = (key, fn) => draws.push([key, fn]);
  if (kind === 'yard') {
    floor(g, dirt);
    for (let i = 0; i < 10; i++) { const a = P(i, 0), b = P(0, i); g.fillStyle = '#6b5a45'; g.fillRect(a[0] - 1.5, a[1] - 22, 3, 22); g.fillRect(b[0] - 1.5, b[1] - 22, 3, 22); }
    add(3, () => { for (let i = 0; i < 5; i++) box(g, 1.2 + (i % 3) * 0.7, 1.3 + Math.floor(i / 3) * 0.8, 0.6, 0.6, 14 + i * 5, tone(['#7a7f88', '#8c4a2f', '#5b6573', '#a07a3a', '#6b5a4a'][i])); });
    add(2.5, () => { shadow(g, 6, 0.8, 2.4, 1.3, 22); box(g, 6, 0.8, 2.4, 1.3, 9, tone('#8c4a2f'), { z: 4 }); box(g, 6.6, 0.95, 1.2, 1, 9, tone('#7a3f27'), { z: 13 }); });
    add(7, () => { shadow(g, 0.4, 6.4, 2.6, 2.2, 40); const f = box(g, 0.4, 6.4, 2.6, 2.2, 40, tone('#7d6a55')); windows(g, f.left, 2, 1, '#1d2740'); });
    add(4, () => { cyl(g, 8.4, 2.2, 0.32, 22, tone('#b0493a')); cyl(g, 9, 2.8, 0.32, 22, tone('#3d6fb0')); });
    add(5.6 + 4.5, () => npc(g, 5.6, 4.6, { shirt: '#2f80ed', hair: '#7a3b12' }, tt, 1.3));
    add(7.4 + 6.2, () => npc(g, 7.6, 6.2, { shirt: '#f2994a', hair: '#555', pants: '#3b3b3b' }, tt, 1.3));
    add(3 + 5.6, () => { const [x, y] = P(3, 5.6); ellipse(g, x, y + 1, 18 + 3 * k, 8 + k, `rgba(255,211,110,${0.3 + 0.2 * k})`, '#ffd36e', 2); npc(g, 3, 5.6, { shirt: '#c0392b', hair: '#222' }, tt, 1.5); });
  } else if (kind === 'cafe') {
    floor(g, (x, y) => ((x + y) % 2 ? '#8a6a45' : '#7a5c3b'));
    add(1, () => { box(g, 1, 0.5, 8, 1, 20, tone('#5a4636')); for (let i = 0; i < 4; i++) box(g, 1.6 + i * 1.8, 0.7, 0.6, 0.5, 8, tone(['#c0392b', '#f2c94c', '#27ae60', '#2f80ed'][i]), { z: 20 }); });
    for (const [gx, gy, shirt, hair] of [[2.4, 4.4, '#27ae60', '#2b1b10'], [5.4, 4.4, '#1d2b53', '#111'], [8.4, 4.4, '#9b51e0', '#999']]) {
      add(gx + gy, () => { box(g, gx - 0.6, gy - 0.4, 1.2, 1.2, 4, tone('#6b4a2c'), { z: 8 }); cyl(g, gx, gy + 0.2, 0.12, 8, tone('#6b4a2c')); npc(g, gx, gy - 0.9, { shirt, hair }, tt, 1.25); });
    }
    add(8.8 + 4.5, () => box(g, 8.1, 4.2, 0.7, 0.5, 3, tone('#9b51e0'), { z: 11 }));
    add(4.4 + 6.5, () => { const [x, y] = P(4.4, 6.6); ellipse(g, x, y + 1, 18 + 3 * k, 8 + k, `rgba(255,211,110,${0.3 + 0.2 * k})`, '#ffd36e', 2); npc(g, 4.4, 6.6, { shirt: '#c0392b', hair: '#222' }, tt, 1.5); });
  } else if (kind === 'office') {
    floor(g, (x, y) => (y > 6 ? '#3a4a66' : y === 5 || y === 6 ? '#2f3644' : '#4d586c'));
    for (const [gx, gy, w, h, c] of [[0.5, 0.5, 2.4, 70, '#5a6fb0'], [3.4, 0.4, 2.2, 110, '#4a8fb0'], [6.2, 0.6, 3, 90, '#7a6fc0']]) add(gx + gy + w, () => { shadow(g, gx, gy, w, w, h); const f = box(g, gx, gy, w, w, h, tone(c)); windows(g, f.left, 3, Math.round(h / 12), '#16264a', 0.5, 0.06); windows(g, f.right, 3, Math.round(h / 12), '#10203f', 0.5, 0.06); });
    add(7 + 7, () => { shadow(g, 6.6, 6.8, 2.2, 1.1, 20); box(g, 6.6, 6.8, 2.2, 1.1, 10, tone('#d9d2c0'), { z: 4 }); box(g, 7.2, 6.9, 1, 0.9, 9, tone('#c9c2ae'), { z: 14 }); });
    add(5 + 5, () => npc(g, 5.4, 5.4, { shirt: '#1d2b53', hair: '#111' }, tt, 1.3));
    add(3 + 6.4, () => { const [x, y] = P(3, 6.4); ellipse(g, x, y + 1, 18 + 3 * k, 8 + k, `rgba(255,211,110,${0.3 + 0.2 * k})`, '#ffd36e', 2); npc(g, 3, 6.4, { shirt: '#c0392b', hair: '#222' }, tt, 1.5); });
  } else {
    floor(g, (x, y) => ((x + y) % 2 ? '#3d4a43' : '#35413b'));
    add(2, () => { box(g, 1, 1, 8, 1.2, 10, tone('#3b3b3b')); for (let i = 0; i < 3; i++) { const h = 14 + (calm ? 8 : 8 + 8 * Math.sin(tt / 350 + i * 2)); box(g, 2 + i * 2.4, 1.3, 1.6, 0.6, h, tone(['#5fd38d', '#ffc247', '#5cd6ff'][i]), { z: 10 }); } });
    add(5 + 5, () => npc(g, 5, 4.4, { shirt: '#c9a227', hair: '#2b1b10' }, tt, 1.3));
    add(3 + 5.6, () => { const [x, y] = P(3, 5.6); ellipse(g, x, y + 1, 18 + 3 * k, 8 + k, `rgba(255,211,110,${0.3 + 0.2 * k})`, '#ffd36e', 2); npc(g, 3, 5.6, { shirt: '#c0392b', hair: '#222' }, tt, 1.5); });
  }
  draws.sort((a, b) => a[0] - b[0]).forEach(([, fn]) => fn());
  g.restore();
}

// ---------------------------------------------------------------- the lesson script
export function mountTutorial(root, { onDone, onSkip }) {
  const S = { phase: 'p1', xp: 0, cash: 0.05, inv: [{ name: 'Rusty Paperclip', icon: '📎', val: 0.05 }], tried: {}, cycles: 0, earned: 0, t0: performance.now(), lock: false };
  const el = document.createElement('div');
  root.replaceChildren(el);
  let raf = 0, timer = 0, barTimer = 0;
  const sceneKind = () => ({ p1: 'yard', p2: 'cafe', p3: 'office', run: 'shop', done: 'shop' }[S.phase] || 'yard');

  const header = () => `
    <header class="panel row" style="justify-content:space-between">
      <div><h1 style="margin:0;font-size:1.25rem">Level 0: The Zero-Dollar Hustle</h1><span class="mute small">Ungraded warm-up. Nothing here counts toward your score.</span></div>
      <div class="row">
        <div style="min-width:12rem"><div class="small mono">Level ${level(S.xp)} &middot; <span class="gold">${S.xp} XP</span></div><div class="bar gold xp" role="progressbar" aria-label="Experience" aria-valuemin="0" aria-valuemax="${LEVEL_XP}" aria-valuenow="${S.xp % LEVEL_XP}"><i style="width:${(S.xp % LEVEL_XP) / LEVEL_XP * 100}%"></i></div></div>
        <button class="btn ghost sm" data-act="skip">Skip to the game</button>
      </div>
    </header>`;
  const inv = () => `<div class="card"><h3>Your assets</h3><div class="row"><span class="mono">Cash ${money(S.cash)}</span>${S.inv.map((a) => `<span class="chip info"><span aria-hidden="true">${a.icon}</span> ${esc(a.name)} ${money(a.val)}</span>`).join('')}</div></div>`;

  function body() {
    if (S.phase === 'p1') return `
      <pre class="ascii" aria-label="Notification">NOTIFICATION: YOU HAVE REGISTERED AS AN UNSETTLED BOOTSTRAPPER
[!] Current Capital: $0.05 cash &amp; 1x Shiny Metal Paperclip.</pre>
      <p class="gap"><em>"Welcome to the bottom, Founder. You have a single paperclip and a dream. A local high schooler walking past the yard is frantically tearing through their backpack looking for a tool to eject a jammed SIM card tray. Next to them, a mechanic is eating lunch."</em></p>
      <h2>Phase 1: The first swap</h2>
      <p class="mute small">Objective: trade up to an asset worth more than $5.00. Who needs a paperclip?</p>
      <div class="grid">
        <button class="btn ghost pick card" data-act="p1" data-c="A" ${S.tried.A ? 'aria-disabled="true"' : ''}><b>Option A.</b> Offer the paperclip to the Mechanic.</button>
        <button class="btn ghost pick card" data-act="p1" data-c="B"><b>Option B.</b> Pitch the paperclip to the Student as a "Premium Micro-Ejector Tool".</button>
      </div>${inv()}`;
    if (S.phase === 'p2') return `
      <p><em>"Boom! You just turned a nickel into twelve bucks. How? You mastered the <b>Asset Utility Score</b>. Let's break down the underlying mechanics before you lose your shirt in the next zone."</em></p>
      <pre class="ascii" aria-label="Arbitrage matrix">ARBITRAGE MATRIX BREAKDOWN
(Scarcity [9/10] x Local Demand [10/10]) - Depreciation [1/10] = Utility Score: ${utilityScore(9, 10, 1)}/100</pre>
      <div class="callout"><b>Why it worked:</b> the student's demand for a thin metal tool was 10 out of 10 right then, and a pen is scarce (9/10). Price follows <i>utility</i>, not what you paid.</div>
      <h2>Phase 2: Pick the buyer</h2>
      <p>You walk into the Metro Coffee Shop holding your Vintage Fountain Pen. Three buyer personas sit at separate tables. Who do you pitch to maximize your utility matrix?</p>
      <div class="grid g3">
        ${[['barista', '☕', 'The Barista', 'Needs cheap writing tools for quick, messy syrup orders.'], ['recruiter', '👔', 'The Corporate Recruiter', 'Conducting interviews; wants to project a highly professional, elite aesthetic.'], ['freelancer', '💻', 'The Tech Freelancer', 'Works exclusively on a high-end touchscreen tablet.']]
          .map(([id, ic, n, d]) => `<button class="card pick btn ghost" style="text-transform:none;letter-spacing:0;text-align:left" data-act="p2" data-c="${id}"><span class="ic" aria-hidden="true">${ic}</span><b>${n}</b><br><span class="small mute">${d}</span></button>`).join('')}
      </div>${inv()}`;
    if (S.phase === 'p3') return `
      <p><em>"You've got a vehicle contract, but your Operational Engineering (Ops) stat is too low to fix the engine yourself. If you try to fix it, it will cost you $1,200 in mistakes. It's time to scale up. Let's hire your first automated manager."</em></p>
      <pre class="ascii" aria-label="Management slot">NEW MANAGEMENT SLOT UNLOCKED: "THE TRADE BROKER"
[Cost: 10% Trade Royalty] --> Automatically flips low-tier commercial inventory while you sleep.</pre>
      <h2>Phase 3: Unlocking automation</h2>
      <div class="grid">
        <button class="btn ghost pick card" data-act="p3" data-c="fix"><b>Fix the van yourself.</b> <span class="small mute">Ops 1: about $1,200 of mistakes.</span></button>
        <button class="btn pick card" style="text-transform:none" data-act="p3" data-c="hire"><b>Hire the Trade Broker.</b> <span class="small">10% royalty on every flip.</span></button>
      </div>${inv()}
      <p class="small mute">In the real game managers work in Zone 2 and above (the Scrap Yard is hands-on only). This is a taste.</p>`;
    if (S.phase === 'run') {
      const ready = S.cycles >= 3;
      return `
      <h2>The broker is working</h2>
      <div class="card"><div class="row"><span class="ic" aria-hidden="true">🤝</span><div class="grow"><b>Trade Broker</b> <span class="mute small">cycle: 5 seconds</span>
        <div class="bar gold tall" role="progressbar" aria-label="Broker cycle progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="cyc"><i style="width:0"></i></div></div>
        <div class="right mono"><div class="gold" style="font-size:1.4rem" id="earned">${money(S.earned)}</div><span class="small mute">cycles: <span id="ncyc">${S.cycles}</span>/3</span></div></div></div>
      <div id="pop" class="banner" aria-hidden="true" style="min-height:2rem"></div>
      ${ready ? `<div class="callout good popin"><b>Working Capital Management, live.</b> Holding the van is a static asset: it earns $0 a day and its value decays. Putting capital into a velocity loop earned ${money(S.earned)} in 15 seconds. <b>Automated velocity beats hoarded inventory</b> (as long as margins survive overhead, fees and the herd).</div>
      <div class="row gap"><button class="btn big" data-act="finish" autofocus>Start the real game</button></div>` : `<p class="mute small">Watch three cycles.</p>`}${inv()}`;
    }
    return '';
  }

  function render() {
    el.innerHTML = `${header()}<div class="main gap"><section class="panel" aria-label="Scene"><canvas id="sc" class="scene" width="640" height="360" role="img" aria-label="${{ yard: 'A pixel-art scrap yard with a student and a mechanic', cafe: 'A pixel-art coffee shop with three customers', office: 'A pixel-art office district', shop: 'A pixel-art trading floor' }[sceneKind()]}"></canvas></section><section class="panel" aria-live="polite">${body()}</section></div>`;
    startScene();
    if (S.phase === 'run') startBroker();
  }

  function startScene() {
    cancelAnimationFrame(raf);
    const c = $('#sc', el); if (!c) return;
    const g = c.getContext('2d'), kind = sceneKind();
    if (reduced()) { isoScene(g, kind, 0); return; }
    const loop = (t) => { isoScene(g, kind, t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
  }

  function popup(kind, title, lines, then) {
    const cls = kind === 'good' ? 'good' : kind === 'bad' ? 'bad' : 'warn';
    const icon = kind === 'good' ? '🟩' : kind === 'bad' ? '🟥' : '🟨';
    dlg.open(`<div class="result ${cls} popin"><div class="rtitle"><span aria-hidden="true">${icon}</span> ${esc(title)}</div>${lines.map((l) => `<p>${l}</p>`).join('')}<button class="btn big" data-close autofocus>Continue</button></div>`, { label: title, cls: kind === 'bad' ? 'alert' : '', onClose: then });
    dlg.el.querySelector('[data-close]').onclick = () => dlg.close();
    announce(title + '. ' + lines.join(' ').replace(/<[^>]+>/g, ''), kind === 'bad');
  }

  const acts = {
    skip() { cleanup(); onSkip(); },
    finish() { cleanup(); onDone(); },
    p1(b) {
      const c = b.dataset.c;
      if (c === 'A') {
        S.tried.A = true; sfx.buzz();
        popup('bad', 'TRADE REJECTED', ['The mechanic laughs. <em>"What am I going to do with that? Here\'s some advice: find someone who actually has a problem to solve."</em>', '<b>Result:</b> 0 XP. 0 cash. Asset retained.', '<span class="mute small">Persona alignment was low: he owns heavy tools, so a paperclip has zero utility to him.</span>'], render);
        return;
      }
      S.xp += 100; S.cash = 0.05; S.inv = [{ name: 'Vintage Matte-Black Fountain Pen', icon: '🖋️', val: 12.5 }];
      sfx.kaching(); burst();
      popup('good', 'SUCCESSFUL ARBITRAGE!', ['<b>+100 XP.</b> The student joyfully hands over a Vintage Matte-Black Fountain Pen (estimated market value $12.50).', '<div class="banner">+25,000% ASSET VALUATION GAIN</div>', '<span class="mute small">High persona alignment: scarce tool, urgent need.</span>'], () => { S.phase = 'p2'; render(); });
    },
    p2(b) {
      const c = b.dataset.c;
      if (c === 'barista') { sfx.buzz(); S.inv = [{ name: 'Old travel mug', icon: '🥤', val: 2 }]; render(); popup('warn', 'MARGIN COMPRESSION', ['The Barista offers an old $2.00 travel mug. <b>You lost asset value!</b>', '<span class="mute small">Low value fit: the pen is too fragile and expensive for a greasy, high-speed counter. Level 0 rewinds the trade so you can try again.</span>'], () => { S.inv = [{ name: 'Vintage Matte-Black Fountain Pen', icon: '🖋️', val: 12.5 }]; render(); }); return; }
      if (c === 'freelancer') { sfx.buzz(); popup('bad', 'FAIL STREAK', ['Pitch completely ignored. The Freelancer puts on noise-cancelling headphones.', '<span class="mute small">Zero utility: paper-and-ink tech has no place in a touchscreen workflow.</span>'], render); return; }
      S.xp += 250; S.inv = [{ name: 'Broken Fleet Van Contract', icon: '🚐', val: 2500 }];
      sfx.level(); burst({ power: 1.4 });
      popup('good', 'CRITICAL HIT!', ['Trade accepted! <b>+250 XP.</b> The Recruiter swaps a Broken Fleet Van Contract.', `<div class="banner">LEVEL UP: ${level(S.xp)}</div>`, '<span class="mute small">Perfect fit: high localized prestige demand aligns directly with the pen\'s utility.</span>'], () => { S.phase = 'p3'; render(); });
    },
    p3(b) {
      if (b.dataset.c === 'fix') { sfx.buzz(); popup('bad', 'NOT ENOUGH CASH', ['Repairs would cost about <b>$1,200</b> at Ops level 1 and the van would only recover half its value. You have $0.05.', '<span class="mute small">Specialisation matters: a high-Ops founder repairs this for about $20. Delegate, or trade it to someone who can.</span>'], null); return; }
      S.xp += 150; S.phase = 'run'; S.cycles = 0; S.earned = 0; sfx.blip(); render();
    },
  };

  function startBroker() {
    clearInterval(barTimer);
    let t0 = performance.now();
    barTimer = setInterval(() => {
      const f = Math.min(1, (performance.now() - t0) / 5000);
      const bar = $('#cyc', el);
      if (bar) { bar.firstElementChild.style.width = (f * 100) + '%'; bar.setAttribute('aria-valuenow', Math.round(f * 100)); }
      if (f >= 1) {
        t0 = performance.now(); S.cycles++; S.earned += 45; sfx.kaching();
        const pop = $('#pop', el); if (pop) pop.textContent = '+$45 Arbitrage Revenue Pool Generated!';
        $('#earned', el).textContent = money(S.earned); $('#ncyc', el).textContent = S.cycles;
        burst({ n: 40, color: '#ffc247', y: innerHeight / 3 });
        announce('Plus $45 arbitrage revenue pool generated. Total ' + money(S.earned));
        if (S.cycles >= 3) { clearInterval(barTimer); S.xp += 200; sfx.level(); render(); }
      }
    }, 100);
  }

  function cleanup() { cancelAnimationFrame(raf); clearInterval(barTimer); clearTimeout(timer); dlg.close(); }
  delegate(el, acts);
  render();
  el.querySelector('h1')?.focus();
  return cleanup;
}
