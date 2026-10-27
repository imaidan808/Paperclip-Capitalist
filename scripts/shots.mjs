// node scripts/shots.mjs <outdir> [days=0] [perkA,perkB] [serverUrl]  -> screenshots of the real app (headless Chrome over the DevTools protocol).
// Starts a game through the real draft screen, lets the heuristic bot play `days` virtual days, then photographs the world and every open panel.
import { launch, open } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
const [out = '/tmp/pc-shots', days = '0', perks = 'trades,pro', base = 'http://localhost:8090'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const b = await launch(9444);
try {
  const p = await open(b, `${base}/?slot=shots${Date.now() % 1e5}`, { w: 1440, h: 900 });
  await p.eval(`localStorage.setItem('pc.academyDone.' + new URLSearchParams(location.search).get('slot'), 'true')`);
  await p.eval(`(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)); [...document.querySelectorAll('button')].find(b=>/Play solo/i.test(b.textContent)).click(); await wait(500);
    const want=${JSON.stringify(perks.split(','))}; for (const id of want) { const cb=[...document.querySelectorAll('input[type=checkbox]')].find(c=>c.value===id||c.closest('label,article,div')?.textContent.toLowerCase().includes(id)); cb?.click(); await wait(100); }
    [...document.querySelectorAll('button')].find(b=>/^Begin/i.test(b.textContent.trim())).click(); await wait(1500); return document.title; })()`);
  if (+days) await p.eval(`(async()=>{const {run}=await import('/tests/bot.mjs'); run(pc.S.game,{days:${+days}}); pc.S.emit('change'); await new Promise(r=>setTimeout(r,800)); return pc.S.game.s.zones.length; })()`);
  // the bot's days queue alerts and celebrations; let them pass so the pictures show the game
  await p.eval(`(async()=>{const d=document.querySelector('dialog#dlg'); for (let i=0;i<14;i++){ if(d.open) d.close(); await new Promise(r=>setTimeout(r,200)); } await new Promise(r=>setTimeout(r,3500)); })()`);
  const snap = async (name) => { await p.eval('pc.world && pc.world.draw && pc.world.draw()'); await p.sleep(300); await p.shot(`${out}/${name}.png`); };
  await snap('world');
  for (const id of ['stock', 'market', 'crew', 'bank', 'travel', 'codex', 'quests']) {
    const ok = await p.eval(`(()=>{const b=document.querySelector('[data-anchor="dock-${id}"]'); if(!b) return false; b.click(); return true})()`);
    if (ok) { await p.sleep(500); await snap('drawer-' + id); }
  }
  console.log(JSON.stringify({ logs: p.logs.filter((l) => /error|EXC|warn/i.test(l)).slice(0, 12) }));
} finally { b.close(); }
