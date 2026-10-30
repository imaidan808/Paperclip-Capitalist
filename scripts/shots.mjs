// node scripts/shots.mjs '{"out":"/tmp/shots","days":25,"perks":"trades,pro","w":1440,"h":900,"base":"http://localhost:8090","cdp":9444}'
// Photographs the real app: the world (focus, whole island, map), every open panel, and a Deal Room. One JSON argument; every key is optional.
import { mkdirSync } from 'node:fs';
import { startApp, newGame, quiet, draw } from './boot.mjs';
const o = { out: '/tmp/pc-shots', days: 0, perks: 'trades,pro', w: 1440, h: 900, base: 'http://localhost:8090', cdp: 9444, dsf: 1, reduced: false, mobile: false, deal: true, ...JSON.parse(process.argv[2] || '{}') };
mkdirSync(o.out, { recursive: true });
const app = await startApp(o);
const { p } = app;
try {
  await newGame(p, o);
  const snap = async (name) => { await draw(p); await p.sleep(300); await p.shot(`${o.out}/${name}.png`); };
  await snap('world');
  await p.eval('pc.world.fit(false)'); await snap('island');
  await p.eval("pc.world.setMode('map'); pc.world.fit(false)"); await snap('map');
  await p.eval("pc.world.setMode('world'); pc.world.focusZone(pc.S.game.s.zones.at(-1), false)"); await snap('frontier');
  for (const id of ['stock', 'market', 'crew', 'bank', 'travel', 'codex', 'quests']) {
    const ok = await p.eval(`(()=>{const b=document.querySelector('[data-anchor="dock-${id}"]'); if(!b) return false; b.click(); return true})()`);
    if (ok) { await p.sleep(500); await snap('drawer-' + id); }
  }
  await p.eval(`document.querySelector('[data-anchor="drawer"]') && document.querySelector('[data-act="drawer-close"]')?.click()`);
  if (o.deal) {
    const opened = await p.eval(`(async()=>{ document.querySelector('[data-anchor="dock-market"]').click(); await new Promise(r=>setTimeout(r,400)); const b=[...document.querySelectorAll('#drawer button')].find(b=>/^Sell /.test(b.textContent.trim())); if(!b) return false; b.click(); await new Promise(r=>setTimeout(r,600)); return document.querySelector('dialog#dlg').open; })()`);
    if (opened) await snap('deal-room');
    await quiet(p);
  }
  console.log(JSON.stringify({ viewport: [o.w, o.h], logs: p.logs.filter((l) => /error|EXC|warn/i.test(l)).slice(0, 12) }));
} finally { app.close(); }
