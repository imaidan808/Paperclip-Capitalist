// Shared by the screenshot and performance drivers: open the app in headless Chrome, start a game through the real draft screen,
// optionally let the heuristic bot play some virtual days, and clear the alerts that queue up while it does.
import { launch, open } from './cdp.mjs';

export async function startApp({ base = 'http://localhost:8090', w = 1440, h = 900, cdp = 9444, dsf = 1, reduced = false, mobile = false } = {}) {
  const b = await launch(cdp);
  const slot = 'shot' + (Date.now() % 1e6);
  const p = await open(b, `${base}/?slot=${slot}`, { w, h, dsf, reduced, mobile });
  await p.eval(`localStorage.setItem('pc.academyDone.${slot}', 'true')`);
  return { b, p, close: () => b.close() };
}

export async function newGame(p, { perks = 'trades,pro', days = 0 } = {}) {
  await p.eval(`(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)); [...document.querySelectorAll('button')].find(b=>/Play solo/i.test(b.textContent)).click(); await wait(500);
    for (const id of ${JSON.stringify(perks.split(','))}) { const cb=[...document.querySelectorAll('input[type=checkbox]')].find(c=>c.value===id||c.closest('label,article,div')?.textContent.toLowerCase().includes(id)); cb?.click(); await wait(100); }
    [...document.querySelectorAll('button')].find(b=>/^Begin/i.test(b.textContent.trim())).click(); await wait(1500); })()`);
  if (+days) await p.eval(`(async()=>{const {run}=await import('/tests/bot.mjs'); run(pc.S.game,{days:${+days}}); pc.S.emit('change'); await new Promise(r=>setTimeout(r,800)); })()`);
  await quiet(p);
}

/** Close alerts and let celebrations and toasts pass, so a picture shows the game and not the news. */
export async function quiet(p) {
  await p.eval(`(async()=>{const d=document.querySelector('dialog#dlg'); for (let i=0;i<14;i++){ if(d.open) d.close(); await new Promise(r=>setTimeout(r,200)); } await new Promise(r=>setTimeout(r,3500)); })()`);
}

export const draw = (p) => p.eval('pc.world && pc.world.draw && pc.world.draw()');
