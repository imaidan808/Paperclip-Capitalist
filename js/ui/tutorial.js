// Level 0: "The Zero-Dollar Hustle". Ungraded, about 90 seconds, high-feedback. Teaches asset valuation,
// buyer personas and the arbitrage loop, then hands over an automated broker to show working-capital velocity.
import { $, esc, setHTML, delegate, dlg, toast, announce, sfx, burst, reduced, money } from './common.js';
import { utilityScore } from '../market.js';

const LEVEL_XP = 300;
const level = (xp) => 1 + Math.floor(xp / LEVEL_XP);

// ---------------------------------------------------------------- pixel scenes
function person(g, x, y, s, c) {
  g.fillStyle = c.hair || '#2b1b10'; g.fillRect(x + 2 * s, y, 4 * s, 2 * s);
  g.fillStyle = c.skin || '#f1c27d'; g.fillRect(x + 2 * s, y + 2 * s, 4 * s, 3 * s);
  g.fillStyle = c.shirt; g.fillRect(x + s, y + 5 * s, 6 * s, 5 * s);
  g.fillStyle = c.pants || '#27324a'; g.fillRect(x + 2 * s, y + 10 * s, 4 * s, 4 * s);
  g.fillStyle = '#000'; g.fillRect(x + 3 * s, y + 3 * s, s, s); g.fillRect(x + 5 * s, y + 3 * s, s, s);
}
function scene(g, kind, t) {
  const W = 320, H = 180, bob = Math.round(Math.sin(t / 380)) * 2;
  const sky = { yard: '#2b3d52', cafe: '#3a2a22', office: '#1f2a3d', shop: '#243528' }[kind];
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  g.fillStyle = kind === 'yard' ? '#3d4a2e' : '#4a3a2c'; g.fillRect(0, 120, W, 60);
  g.fillStyle = 'rgba(255,255,255,.05)';
  for (let x = 0; x < W; x += 16) g.fillRect(x, 120, 1, 60);
  for (let y = 120; y < H; y += 16) g.fillRect(0, y, W, 1);
  if (kind === 'yard') {
    g.fillStyle = '#5b5f66'; [[20, 95, 50, 30], [60, 105, 40, 20], [230, 88, 60, 38], [270, 100, 40, 26]].forEach(([x, y, w, h]) => g.fillRect(x, y, w, h));
    g.fillStyle = '#8a5a3a'; g.fillRect(100, 108, 36, 16); g.fillStyle = '#a0a6ad'; g.fillRect(104, 100, 28, 8);
    g.fillStyle = '#6b4a2c'; for (let x = 0; x < W; x += 20) g.fillRect(x, 80, 3, 40); g.fillRect(0, 88, W, 3);
    person(g, 150, 98 + bob, 4, { shirt: '#c0392b', hair: '#222' });          // you, left-center
    person(g, 214, 98 + (bob ? 0 : 2), 3, { shirt: '#2f80ed', hair: '#7a3b12' }); // student
    person(g, 256, 100, 3, { shirt: '#f2994a', pants: '#3b3b3b', hair: '#555' });  // mechanic
  } else if (kind === 'cafe') {
    g.fillStyle = '#6b4a2c'; [[30, 108], [130, 108], [230, 108]].forEach(([x, y]) => { g.fillRect(x, y, 56, 6); g.fillRect(x + 24, y + 6, 8, 20); });
    person(g, 44, 80 + bob, 3, { shirt: '#27ae60' });   // barista
    person(g, 144, 80 + (bob ? 0 : 2), 3, { shirt: '#1d2b53', hair: '#111' }); // recruiter
    person(g, 244, 80 + bob, 3, { shirt: '#9b51e0', hair: '#999' }); // freelancer
    g.fillStyle = '#9b51e0'; g.fillRect(238, 100, 24, 8);
  } else if (kind === 'office') {
    g.fillStyle = '#2a3f5f'; g.fillRect(40, 70, 70, 50); g.fillRect(210, 60, 70, 60);
    g.fillStyle = '#ffd36e'; for (let i = 0; i < 6; i++) { g.fillRect(48 + (i % 3) * 20, 78 + Math.floor(i / 3) * 20, 10, 10); g.fillRect(218 + (i % 3) * 20, 68 + Math.floor(i / 3) * 20, 10, 10); }
    person(g, 150, 98 + bob, 4, { shirt: '#c0392b', hair: '#222' });
    g.fillStyle = '#d9d2c0'; g.fillRect(196, 112, 40, 14); g.fillRect(200, 108, 12, 6);
  } else {
    g.fillStyle = '#3b3b3b'; g.fillRect(40, 96, 240, 28);
    for (let i = 0; i < 3; i++) { g.fillStyle = ['#5fd38d', '#ffc247', '#5cd6ff'][i]; g.fillRect(70 + i * 70, 84 + Math.round(Math.sin(t / 250 + i)) * 2, 40, 12); }
    person(g, 20, 96 + bob, 4, { shirt: '#c0392b' });
  }
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
    el.innerHTML = `${header()}<div class="main gap"><section class="panel" aria-label="Scene"><canvas id="sc" class="scene" width="320" height="180" role="img" aria-label="${{ yard: 'A pixel-art scrap yard with a student and a mechanic', cafe: 'A pixel-art coffee shop with three customers', office: 'A pixel-art office district', shop: 'A pixel-art trading floor' }[sceneKind()]}"></canvas></section><section class="panel" aria-live="polite">${body()}</section></div>`;
    startScene();
    if (S.phase === 'run') startBroker();
  }

  function startScene() {
    cancelAnimationFrame(raf);
    const c = $('#sc', el); if (!c) return;
    const g = c.getContext('2d'), kind = sceneKind();
    if (reduced()) { scene(g, kind, 0); return; }
    const loop = (t) => { scene(g, kind, t); raf = requestAnimationFrame(loop); };
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
