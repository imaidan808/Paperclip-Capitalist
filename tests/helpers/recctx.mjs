// A recording 2D context for the world's pure drawing helpers (solids, shadows, layers). Every call is logged with the state it was made in, and the audit lists the art direction's
// rules need are collected as it goes: the width of every stroke, the size of every fillRect, the alpha and style of every fill, and whether save and restore balance.
// No canvas is needed: gradients are inert objects and measureText answers a fixed width.
export function recCtx() {
  const log = { calls: [], strokes: [], fills: [], rects: [], depth: 0, minDepth: 0, clips: 0, images: 0 };
  const stack = [];
  const state = { fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, globalAlpha: 1, lineCap: 'butt', lineJoin: 'miter', font: '10px sans-serif', globalCompositeOperation: 'source-over' };
  const grad = () => ({ addColorStop() {} });
  const ctx = new Proxy(state, {
    get(o, k) {
      if (k in o) return o[k];
      if (typeof k === 'symbol') return undefined;
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return grad;
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (k === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      return (...args) => {
        log.calls.push([k, ...args]);
        if (k === 'save') { log.depth++; stack.push({ ...o }); }
        else if (k === 'restore') { log.depth--; log.minDepth = Math.min(log.minDepth, log.depth); Object.assign(o, stack.pop() || {}); }
        else if (k === 'stroke') log.strokes.push({ lw: o.lineWidth, style: o.strokeStyle, alpha: o.globalAlpha });
        else if (k === 'fill') log.fills.push({ style: o.fillStyle, alpha: o.globalAlpha });
        else if (k === 'fillRect') { log.rects.push({ x: args[0], y: args[1], w: args[2], h: args[3] }); log.fills.push({ style: o.fillStyle, alpha: o.globalAlpha }); }
        else if (k === 'clip') log.clips++;
        else if (k === 'drawImage') log.images++;
      };
    },
    set(o, k, v) { o[k] = v; return true; },
  });
  return { ctx, log, state };
}
/** The thinnest stroke a recording saw (Infinity when it saw none). */
export const thinnestStroke = (log) => log.strokes.reduce((m, s) => Math.min(m, s.lw), Infinity);
/** The names of the calls a recording saw, in order. */
export const callNames = (log) => log.calls.map((c) => c[0]);
