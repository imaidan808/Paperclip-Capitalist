// node scripts/audio-lessons.mjs   (PORT, CDP as audio-check.mjs)
// Mounts each of the ten Academy lessons in headless Chrome with the sound layer wired and fails if one does not start or the page throws. The sound layer must never stop a lesson: lessons 6, 7 and 9
// (the sandbox player is already walking when the first frame is drawn) used to throw from the footstep poll into render() and never mounted (docs/AUDIO.md Appendix D, browser A1).
import { createServer } from 'node:http';
import { handler } from '../server/static.mjs';
import { launch, open } from './cdp.mjs';
const PORT = +process.env.PORT || 8401, CDP = +process.env.CDP || 9901;
const ids = ['m01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10'];
const srv = createServer(handler).listen(PORT, '127.0.0.1');
const b = await launch(CDP);
const fails = [];
try {
  for (let i = 0; i < ids.length; i++) {
    const slot = 'al' + (Date.now() % 1e6) + i;
    const p = await open(b, `http://127.0.0.1:${PORT}/?slot=${slot}`);
    await p.eval(`localStorage.setItem('pc.academy.${slot}', ${JSON.stringify(JSON.stringify(ids.slice(0, i)))})`);
    await p.clickSel('[data-act="academy"]'); await p.sleep(500);
    await p.clickSel('[data-act="ac-start"]'); await p.sleep(2500);
    const st = await p.eval(`({ stage: !!document.querySelector('#stage'), coach: !!document.querySelector('.ac-coach') })`);
    const errs = p.logs.filter((l) => /^(error|EXC)/.test(l));
    console.log(ids[i], JSON.stringify(st), errs.length ? 'ERR ' + errs.map((e) => e.split('\n')[0]).join(' ; ') : 'ok');
    if (!st.stage || !st.coach) fails.push(`${ids[i]}: the lesson did not start (${JSON.stringify(st)})`);
    for (const e of errs) fails.push(`${ids[i]}: ${e.split('\n')[0]}`);
    await p.close();
  }
} catch (e) { fails.push('script: ' + (e.stack || e.message)); } finally { b.close(); srv.close(); }
if (fails.length) { console.log('\n' + fails.length + ' problems:'); for (const f of fails) console.log(' -', f); process.exitCode = 1; } else console.log('\nall ten lessons start');
