// node dev/audio-proto/chain.mjs
// Revision 2 of docs/AUDIO.md, section 3.2 and 2.2. Renders every variant of the prototype (with the trims of trims.json) in headless Chrome and reports
//   1. the tier gaps AFTER the master chain: the rev-1 chain (glue threshold -22 dB) and the rev-2 chain (loud +2 dB, threshold -16 dB, makeup measured for it), at master 100 and 70;
//   2. the compressor's own makeup gain at both thresholds;
//   3. the share of each sound's energy above 250 Hz, and which variants of the refusal and loss family fall under 40%;
//   4. how long the tiny sounds are (the buckets of the duration compensation).
// Voices start at 0.6 s: a fresh context's compressor needs about 100 ms to settle and costs a sound that starts sooner up to 6 dB (docs/AUDIO.md 3.7).
// Needs headless Chrome (scripts/cdp.mjs). Writes nothing in the repo; the full rows go to $AUDIO_CHAIN_OUT when set.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
const { launch, open } = await import(new URL('../../scripts/cdp.mjs', import.meta.url).href);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json' };
const PORT = 8793, CDP = 9363;
const srv = createServer(async (q, r) => { try { const p = q.url.split('?')[0]; const f = join(here, p === '/' ? 'audition.html' : p); const b = await readFile(f); r.writeHead(200, { 'content-type': types[extname(f)] || 'text/plain', 'cache-control': 'no-store' }); r.end(b); } catch { r.writeHead(404); r.end(); } }).listen(PORT, '127.0.0.1');
const FAMILY = ['ui.refuse#r', 'world.locked#l', 'sale.reject#nofit', 'sale.reject#fake', 'sale.scam#s', 'sale.herd#h', 'acad.teach#wrong', 'bid.rival#out', 'bid.hammer#lost', 'deal.result#bad', 'pitch.fit#down', 'audit.result#fail',
  'repair.stop#miss', 'repair.done#rough', 'ship.trouble#damage', 'haggle.close#walk', 'alert.insolvent#i', 'bank.draw#b', 'cash.out#s', 'cash.out#m', 'cash.out#l'];
const b = await launch(CDP);
try {
  const p = await open(b, `http://127.0.0.1:${PORT}/audition.html`);
  const rows = await p.eval(`(async()=>{
    const m = await import('/measure.js'), s = await import('/synth.js');
    const tr = await (await fetch('/trims.json')).json(), T = tr.sounds, MK = tr.makeup, SR = 48000, flat = (x) => x.flat(Infinity).filter(Boolean);
    async function makeupFor(thr) { const ctx = new OfflineAudioContext(1, SR, SR), o = ctx.createOscillator(), g = ctx.createGain(), c = ctx.createDynamicsCompressor(); for (const [k, v] of Object.entries(s.GLUE)) c[k].value = v; c.threshold.value = thr; o.frequency.value = 440; g.gain.value = 0.0316; o.connect(g); g.connect(c); c.connect(ctx.destination); o.start(); const x = (await ctx.startRendering()).getChannelData(0); let pk = 0; for (let i = SR / 2; i < SR; i++) pk = Math.max(pk, Math.abs(x[i])); return pk / 0.0316; }
    const MK22 = await makeupFor(-22), MK16 = await makeupFor(-16);
    async function chain(e, v, key, M, rev2) {
      const ctx = new OfflineAudioContext(2, SR * 6, SR), mm = s.master(ctx, { master: M, makeup: 1 / (rev2 ? MK16 : MK22) });
      if (rev2) mm.glue.threshold.value = -16;
      const trim = (T[key] || 0) + (rev2 && (e.variants[v].tier || e.tier) === 'loud' ? 2 : 0);
      s.voice(ctx, mm.buses[e.bus], flat(e.build(e.variants[v])), 0.6, { seed: 7, trim, noJitter: true, jitterCents: 0 });
      return m.analyze((await ctx.startRendering()).getChannelData(0).slice(Math.round(0.59 * SR)), e.dur + 0.01);
    }
    function fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } } for (let len = 2; len <= n; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, bb = i + k + len / 2, t1 = re[bb] * cr - im[bb] * ci, t2 = re[bb] * ci + im[bb] * cr; re[bb] = re[a] - t1; im[bb] = im[a] - t2; re[a] += t1; im[a] += t2; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } } }
    const out = [{ key: '__makeup', MK22, MK16 }];
    for (const { e, v, key, tier } of m.entries()) {
      const x = await m.renderLayers(flat(e.build(e.variants[v])), e.dur, { trim: T[key] || 0 }), pre = m.analyze(x, e.dur);
      let N = 1; while (N < x.length) N <<= 1;
      const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < x.length; i++) re[i] = x[i]; fft(re, im);
      let tot = 0, lo = 0; for (let k = 1; k < N / 2; k++) { const f = k * SR / N, pw = re[k] * re[k] + im[k] * im[k]; tot += pw; if (f < 250) lo += pw; }
      const row = { key, tier, bus: e.bus, ms: pre.ms, pre: pre.level, above250: 1 - lo / tot };
      for (const M of [1, 0.49]) { row['a' + M] = (await chain(e, v, key, M, false)).level; row['b' + M] = (await chain(e, v, key, M, true)).level; }
      out.push(row);
    }
    return out; })()`);
  const mk = rows.shift(), db = (x) => 20 * Math.log10(x), mean = (a) => a.reduce((x, y) => x + y, 0) / a.length, f1 = (x) => x.toFixed(1);
  console.log(`compressor makeup: ${mk.MK22.toFixed(3)} (${f1(db(mk.MK22))} dB) at threshold -22 dB, ${mk.MK16.toFixed(3)} (${f1(db(mk.MK16))} dB) at -16 dB`);
  console.log('\nmean active level of the game-bus variants, master gain taken out (dB):');
  const game = (t) => rows.filter((r) => r.tier === t && r.bus === 'game');
  const line = (name, g) => { const [a, bb, c] = ['tiny', 'medium', 'loud'].map(g); console.log(`${name.padEnd(46)} ${f1(a).padStart(6)} ${f1(bb).padStart(6)} ${f1(c).padStart(6)}   gaps ${f1(bb - a)} and ${f1(c - bb)}`); };
  console.log(`${''.padEnd(46)}   tiny medium   loud`);
  line('no chain (rev 1 trims)', (t) => mean(game(t).map((r) => r.pre)));
  for (const [name, k, M] of [['rev 1 chain, master 100', 'a', 1], ['rev 1 chain, master 70', 'a', 0.49], ['rev 2 chain, master 100', 'b', 1], ['rev 2 chain, master 70', 'b', 0.49]]) line(name, (t) => mean(game(t).map((r) => r[k + M] - db(M))));
  const fam = FAMILY.map((k) => rows.find((r) => r.key === k)).filter(Boolean);
  const under = fam.filter((r) => r.above250 < 0.4);
  console.log(`\nenergy above 250 Hz, refusal and loss family (${fam.length} variants): ${under.length} under 40%`);
  for (const r of fam) console.log(`  ${r.key.padEnd(22)} ${(r.above250 * 100).toFixed(0).padStart(3)}%${r.above250 < 0.4 ? '  <- under 40%' : ''}`);
  const tiny = rows.filter((r) => r.tier === 'tiny'), n = (f) => tiny.filter(f).length;
  console.log(`\ntiny variants by length: ${tiny.length} in all; under 60 ms ${n((r) => r.ms < 60)}, 60 to 119 ms ${n((r) => r.ms >= 60 && r.ms < 120)}, 120 to 500 ms ${n((r) => r.ms >= 120 && r.ms <= 500)}, over 500 ms ${n((r) => r.ms > 500)}`);
  if (process.env.AUDIO_CHAIN_OUT) await writeFile(process.env.AUDIO_CHAIN_OUT, JSON.stringify({ makeup: mk, rows }, null, 1));
} catch (e) { console.error('FAILED', e.message); process.exitCode = 1; } finally { b.close(); srv.close(); }
