// A recording fake AudioContext for the sound layer's tests: every node, every connection and every automation call is kept, so a test can look at what a voice did without a browser.
class Param {
  constructor(v = 0) { this.value = v; this.calls = []; }
  setValueAtTime(v, t) { this.calls.push(['set', v, t]); this.value = v; return this; }
  linearRampToValueAtTime(v, t) { this.calls.push(['linear', v, t]); return this; }
  exponentialRampToValueAtTime(v, t) { this.calls.push(['exp', v, t]); return this; }
  setTargetAtTime(v, t, c) { this.calls.push(['target', v, t, c]); return this; }
  cancelScheduledValues(t) { this.calls.push(['cancel', t]); return this; }
}
export function fakeContext({ sampleRate = 8000, state = 'suspended', failResume = false } = {}) {
  const ctx = { sampleRate, currentTime: 0, state, nodes: [], resumes: 0, suspends: 0, closed: false };
  const mk = (kind, params = {}, extra = {}) => {
    const n = { kind, out: [], started: null, stopped: null, ...extra };
    n.params = {}; for (const [k, v] of Object.entries(params)) { n.params[k] = new Param(v); n[k] = n.params[k]; }
    n.connect = (d) => { n.out.push(d); return d; }; n.disconnect = () => { n.out = []; };
    n.start = (t = 0) => { n.started = t; }; n.stop = (t = 0) => { n.stopped = t; };
    ctx.nodes.push(n); return n;
  };
  ctx.createGain = () => mk('gain', { gain: 1 });
  ctx.createOscillator = () => mk('osc', { frequency: 440, detune: 0 }, { type: 'sine' });
  ctx.createBufferSource = () => mk('buf', {}, { loop: false, buffer: null });
  ctx.createBiquadFilter = () => mk('biquad', { frequency: 350, Q: 1 }, { type: 'lowpass' });
  ctx.createStereoPanner = () => mk('pan', { pan: 0 });
  ctx.createDynamicsCompressor = () => mk('comp', { threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.25 });
  ctx.createWaveShaper = () => mk('shaper', {}, { curve: null, oversample: 'none' });
  ctx.createDelay = () => mk('delay', { delayTime: 0 });
  ctx.createAnalyser = () => mk('analyzer', {}, { fftSize: 2048, getFloatTimeDomainData() {} });
  ctx.createBuffer = (ch, n, sr) => { const d = new Float32Array(n); return { numberOfChannels: ch, length: n, sampleRate: sr, getChannelData: () => d }; };
  ctx.destination = mk('dest'); ctx.nodes.length = 0; // the destination is not a node a voice made
  ctx.resume = () => { ctx.resumes++; if (failResume) return Promise.reject(new Error('blocked')); ctx.state = 'running'; return Promise.resolve(); };
  ctx.suspend = () => { ctx.suspends++; ctx.state = 'suspended'; return Promise.resolve(); };
  ctx.close = () => { ctx.closed = true; ctx.state = 'closed'; return Promise.resolve(); };
  ctx.count = (kind) => ctx.nodes.filter((n) => n.kind === kind).length;
  return ctx;
}
/** A clock the test moves, and timers it runs by hand. */
export function fakeClock() {
  const c = { t: 1000, timers: new Map(), id: 0 };
  c.now = () => c.t;
  c.timers_ = { set: (f, ms) => { const id = ++c.id; c.timers.set(id, { f, at: c.t + ms }); return id; }, clear: (id) => { c.timers.delete(id); } };
  c.advance = (ms) => { const end = c.t + ms; for (;;) { const due = [...c.timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!due) break; c.timers.delete(due[0]); c.t = Math.max(c.t, due[1].at); due[1].f(); } c.t = end; };
  c.flush = () => c.advance(0);
  c.pending = () => c.timers.size;
  return c;
}
