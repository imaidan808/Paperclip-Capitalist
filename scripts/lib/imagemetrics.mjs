// Pure image measurements for the world's picture. Every function takes an image as { width, height, data } (data: RGBA bytes, row by row) and returns plain numbers; nothing here reads a file,
// starts Chrome or knows the game. scripts/world-metrics.mjs runs them over a folder of shots; tests/world-metrics.test.mjs proves each one catches the fault it is named for and ignores a clean picture.
//
//   waterMask(img)               which pixels are water (a colour classification: blue to turquoise, not grey)
//   seamScan(img, {region})      one or two pixel wide lines that differ from both neighbours although the neighbours match (the hairline between two tiles that should meet), grouped into segments
//   coastJag(img, {dsf})         the staircase along the land and water boundary: corners per 1000 css px and the run between them (a smooth shore has few; a coast of diamond tiles has many)
//   bandPattern(img, mask, ...)  how much the water varies at three scales (RMS of the difference between a box mean and the mean of a box twice as wide): a flat gradient scores about 0
//   palette(img)                 hue histogram, mean saturation and brightness of the water, the land and the whole frame
//   diffImages(a, b, {exclude})  mean absolute difference and the share of pixels that differ by more than a threshold (the visible-difference score between two shots)
//   anchorScore(a, b, shift)     whether the water moved with the camera: how well B's water matches A's, displaced by the camera's move, against not displaced
//   driftScore(a, b, shift, max) the same with the clock running: B's water matches A's displaced by the camera's move plus a residual of at most `max` pixels (the water's own drift)
//   scaleScore(a, b, map)        whether the water scaled with the camera: B's water against A's mapped through the zoom (x' = k x + tx), the detail compared at matching world scales
//   unpainted(img, o)            pixels the picture never painted (black, or transparent): a sea that ends where its bitmap ends leaves them
//   fnv1a(data)                  a hash of the pixels, to say two shots are the same picture
// Colours are compared as the largest difference in any of R, G, B (0 to 255), the same number a person would call "a 12 out of 255 difference".

const abs = Math.abs;

/** FNV-1a of a byte array as an 8 digit hex string. */
export function fnv1a(data) { let h = 0x811c9dc5; for (let i = 0; i < data.length; i++) { h ^= data[i]; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); }

/** Hue (0 to 360), saturation and value (0 to 1) of a colour. */
export function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d > 0) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx / 255];
}

/**
 * Colours that count as water: hue from blue-green to blue-violet, a real colour (saturation of 0.3 or more, so the blue-grey of tarmac, fog and shadow is not water) and not black.
 * Lowering `satMin` lets in the grey-blue of fog; raising `hueLo` drops turquoise.
 */
export const WATER = { hueLo: 165, hueHi: 258, satMin: 0.3, valMin: 0.06 };
export function isWater(r, g, b, p = WATER) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (mx < 255 * p.valMin || d < mx * p.satMin) return false;
  let h; if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360;
  return h >= p.hueLo && h <= p.hueHi;
}
/**
 * A byte per pixel, 1 where the picture is water. Blue things that are not the sea (a sign, a barrel, a lamp, a speech bubble) are dropped: a patch of water has to be at least
 * `minArea` of the picture (a share, default 0.2%, about 100 by 100 px at 2880 by 1800) to count.
 */
export function waterMask(img, p = WATER, o = {}) {
  const { width: w, height: h, data } = img, m = new Uint8Array(w * h), minArea = Math.max(1, Math.round((o.minArea ?? 0.002) * w * h));
  for (let i = 0, k = 0; i < m.length; i++, k += 4) m[i] = isWater(data[k], data[k + 1], data[k + 2], p) ? 1 : 0;
  if (minArea <= 1) return m;
  const queue = new Int32Array(w * h); let used = 0; // each patch is a stretch of the queue: 1 = not looked at, 2 = in the patch being filled, 3 = kept
  for (let s = 0; s < m.length; s++) {
    if (m[s] !== 1) continue;
    const from = used; queue[used++] = s; m[s] = 2;
    for (let q = from; q < used; q++) {
      const i = queue[q], x = i % w;
      if (x > 0 && m[i - 1] === 1) { m[i - 1] = 2; queue[used++] = i - 1; }
      if (x < w - 1 && m[i + 1] === 1) { m[i + 1] = 2; queue[used++] = i + 1; }
      if (i >= w && m[i - w] === 1) { m[i - w] = 2; queue[used++] = i - w; }
      if (i + w < m.length && m[i + w] === 1) { m[i + w] = 2; queue[used++] = i + w; }
    }
    const keep = used - from >= minArea; for (let q = from; q < used; q++) m[queue[q]] = keep ? 3 : 0;
  }
  for (let i = 0; i < m.length; i++) m[i] = m[i] === 3 ? 1 : 0;
  return m;
}

// ------------------------------------------------------------------------------------------------------------------------------- seams
/**
 * Thin lines that should not be there: a run of 1 or 2 pixels (across a row or down a column) whose colour differs by `minDiff` from both neighbours although the two neighbours
 * match each other within `tolSame`. Such a run is the gap or overlap between two tiles of the same colour (or a stray outline), seen from both directions so a diagonal edge is found too.
 * The marked pixels are joined (8 neighbours) into segments, and only segments of `minLen` pixels or more count (an isolated speck is dust, not a seam).
 * `flat` (default 0) asks that the surface on each side stays one colour for that many pixels, so a lone line through a plain tile counts and a run of stripes (a hatched ramp, a fence, text) does not.
 * `region` (a byte per pixel, 1 = look here) limits the scan, for instance to the land. Returns { pixels, segments, perMpx, worst: [{ x, y, w, h, size }] }.
 * A textured surface (neighbours that differ from each other) cannot show a seam by this test: it is a measure for the flat-shaded tiles of the ground.
 */
export function seamScan(img, o = {}) {
  const { width: w, height: h, data } = img, tolSame = o.tolSame ?? 14, minDiff = o.minDiff ?? 18, maxWidth = o.maxWidth ?? 2, minLen = o.minLen ?? 8, flat = o.flat ?? 0, region = o.region || null;
  const mark = new Uint8Array(w * h);
  const dist = (i, j) => { const a = abs(data[i] - data[j]), b = abs(data[i + 1] - data[j + 1]), c = abs(data[i + 2] - data[j + 2]); return a > b ? (a > c ? a : c) : (b > c ? b : c); };
  const scan = (n0, n1, at) => { // n0 lines, each of n1 pixels; at(line, k) is the pixel index of the k-th pixel of a line
    for (let l = 0; l < n0; l++) {
      for (let k = 1; k < n1 - 1 - maxWidth; k++) {
        const L = at(l, k - 1) * 4, A = at(l, k) * 4;
        if (dist(A, L) < minDiff) continue;
        for (let run = 1; run <= maxWidth; run++) {
          const Z = at(l, k + run - 1) * 4, R = at(l, k + run) * 4;
          if (run > 1 && dist(A, Z) > tolSame) break;
          if (dist(L, R) <= tolSame && dist(Z, R) >= minDiff) {
            let level = k - flat >= 0 && k + run + flat <= n1; // both sides flat for `flat` pixels: a lone line on a plain surface, not one of a run of stripes (a hatched step, a fence, text)
            for (let j = 2; level && j <= flat; j++) if (dist(at(l, k - j) * 4, L) > tolSame || dist(at(l, k + run + j - 1) * 4, R) > tolSame) level = false;
            if (!level) break;
            for (let j = 0; j < run; j++) { const p = at(l, k + j); if (!region || region[p]) mark[p] = 1; }
            break;
          }
        }
      }
    }
  };
  scan(h, w, (y, x) => y * w + x); // along each row
  scan(w, h, (x, y) => y * w + x); // down each column
  // join the marked pixels into segments
  const seen = new Uint8Array(w * h), stack = new Int32Array(w * h), worst = []; let pixels = 0, segments = 0;
  for (let s = 0; s < mark.length; s++) {
    if (!mark[s] || seen[s]) continue;
    let sp = 0, size = 0, x0 = w, y0 = h, x1 = 0, y1 = 0; stack[sp++] = s; seen[s] = 1;
    while (sp) {
      const p = stack[--sp], x = p % w, y = (p - x) / w; size++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx; if (mark[n] && !seen[n]) { seen[n] = 1; stack[sp++] = n; }
      }
    }
    if (size >= minLen) { pixels += size; segments++; worst.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, size }); }
  }
  worst.sort((a, b) => b.size - a.size);
  return { pixels, segments, perMpx: +(pixels / (w * h / 1e6)).toFixed(2), worst: worst.slice(0, 5) };
}

// ------------------------------------------------------------------------------------------------------------------------------- coast
const NB8 = (w) => [1, w, -1, -w, w + 1, w - 1, -w - 1, -w + 1]; // the four straight neighbours first, then the diagonals
/**
 * The staircase along the land and water boundary. The boundary is the water pixels that touch land; it is walked into chains (following its heading, so a coast stays one chain), and along each
 * chain a corner is a place where the heading turns by `angle` degrees or more between the stretch before and the stretch after (each `span` css px long) and nowhere else within a span.
 * A coast of diamond tiles turns by 50 to 130 degrees every tile edge; a smooth shore hardly turns. Returns { coastCssPx, chains, corners, per1000 (corners per 1000 css px of coast),
 * meanRun, medianRun (css px between corners) }, or per1000 null when less than `minCoast` css px of coast is in the picture.
 * `water` is a mask from waterMask (made here when not given); `dsf` is the device pixels per css pixel the picture was taken at.
 */
export function coastJag(img, o = {}) {
  const { width: w, height: h } = img, dsf = o.dsf || 1, water = o.water || waterMask(img, o.waterParams), span = Math.max(4, Math.round((o.span ?? 5) * dsf)), angle = o.angle ?? 35, minChain = Math.round((o.minChain ?? 40) * dsf), minCoast = o.minCoast ?? 100;
  const bd = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1, i = y * w + 1; x < w - 1; x++, i++) if (water[i] && (!water[i - 1] || !water[i + 1] || !water[i - w] || !water[i + w])) bd[i] = 1;
  const vis = new Uint8Array(w * h), off = NB8(w), chains = [];
  const walk = (from, out) => { // append to `out` the boundary pixels reached from `from`, always taking the unvisited neighbour that best continues the heading
    let cur = from;
    for (;;) {
      const back = out.length >= 6 ? out[out.length - 6] : (out.length ? out[0] : cur); let hx = (cur % w) - (back % w), hy = Math.floor(cur / w) - Math.floor(back / w); const hl = Math.hypot(hx, hy) || 1; hx /= hl; hy /= hl;
      let best = -1, score = -2;
      for (let k = 0; k < 8; k++) {
        const n = cur + off[k]; if (n < 0 || n >= bd.length || !bd[n] || vis[n]) continue;
        const dx = (n % w) - (cur % w), dy = Math.floor(n / w) - Math.floor(cur / w); if (abs(dx) > 1 || abs(dy) > 1) continue;
        const sc = (dx * hx + dy * hy) / Math.hypot(dx, dy) - (k >= 4 ? 0.01 : 0);
        if (sc > score) { score = sc; best = n; }
      }
      if (best < 0) break; vis[best] = 1; out.push(best); cur = best;
    }
  };
  for (let s = 0; s < bd.length; s++) {
    if (!bd[s] || vis[s]) continue;
    vis[s] = 1; const fwd = [], bwd = []; walk(s, fwd); walk(s, bwd);
    const chain = bwd.reverse(); chain.push(s); for (const p of fwd) chain.push(p);
    if (chain.length >= minChain) chains.push(chain);
  }
  let length = 0, corners = 0; const runs = [];
  for (const c of chains) {
    const n = c.length, X = new Float32Array(n), Y = new Float32Array(n);
    for (let i = 0; i < n; i++) { X[i] = c[i] % w; Y[i] = Math.floor(c[i] / w); }
    const arc = new Float32Array(n); for (let i = 1; i < n; i++) arc[i] = arc[i - 1] + Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]);
    length += arc[n - 1];
    const turn = new Float32Array(n);
    for (let i = span; i < n - span; i++) {
      const a = Math.atan2(Y[i + span] - Y[i], X[i + span] - X[i]), b = Math.atan2(Y[i] - Y[i - span], X[i] - X[i - span]); let t = abs(a - b); if (t > Math.PI) t = 2 * Math.PI - t; turn[i] = t * 180 / Math.PI;
    }
    let lastAt = -1;
    for (let i = span; i < n - span; i++) {
      if (turn[i] < angle) continue;
      let top = true; for (let j = Math.max(span, i - span); j <= Math.min(n - span - 1, i + span); j++) if (turn[j] > turn[i] || (turn[j] === turn[i] && j < i)) { top = false; break; }
      if (!top) continue;
      corners++; if (lastAt >= 0) runs.push((arc[i] - arc[lastAt]) / dsf); lastAt = i;
    }
  }
  const cssLen = length / dsf; runs.sort((a, b) => a - b);
  return {
    coastCssPx: Math.round(cssLen), chains: chains.length, corners, per1000: cssLen >= minCoast ? +(corners / (cssLen / 1000)).toFixed(2) : null,
    meanRun: runs.length ? +(runs.reduce((a, b) => a + b, 0) / runs.length).toFixed(1) : null, medianRun: runs.length ? +runs[runs.length >> 1].toFixed(1) : null,
  };
}

// ------------------------------------------------------------------------------------------------------------------------------- water pattern
/** Integral image of a Float64 source (w by h): ii[(y + 1) * (w + 1) + x + 1] is the sum of everything above and left of (x, y), inclusive. */
function integral(src, w, h) {
  const W = w + 1, ii = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += src[y * w + x]; ii[(y + 1) * W + x + 1] = ii[y * W + x + 1] + row; } }
  return ii;
}
const boxSum = (ii, W, x0, y0, x1, y1) => ii[(y1 + 1) * W + x1 + 1] - ii[y0 * W + x1 + 1] - ii[(y1 + 1) * W + x0] + ii[y0 * W + x0]; // inclusive corners
const luma = (data, i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

/**
 * How much the water varies, at three scales. For a scale s the picture's luminance is averaged in a box s pixels wide and in one 2s wide around the same point, and the band is the
 * difference of the two (only over places where the larger box is at least `fill` water): its RMS is the pattern's strength at that scale. Flat colour and any smooth gradient give about
 * 0 at every scale; waves, foam and glints give a few levels. `scales` are in device pixels (the caller multiplies by its density). Returns { scales: [{ px, rms, samples }], total, waterShare }.
 */
export function bandPattern(img, mask, scales = [2, 8, 32], fill = 0.85) {
  const { width: w, height: h, data } = img, m = mask || waterMask(img), W = w + 1;
  const L = new Float64Array(w * h), M = new Float64Array(w * h); let n = 0;
  for (let i = 0, o = 0; i < m.length; i++, o += 4) if (m[i]) { M[i] = 1; L[i] = luma(data, o); n++; }
  const iL = integral(L, w, h), iM = integral(M, w, h), out = [];
  for (const s of scales) {
    const r1 = Math.max(1, s >> 1), r2 = Math.max(r1 + 1, s), stride = Math.max(1, s >> 1); let sum = 0, cnt = 0;
    for (let y = r2; y < h - r2; y += stride) for (let x = r2; x < w - r2; x += stride) {
      const big = boxSum(iM, W, x - r2, y - r2, x + r2, y + r2), area2 = (2 * r2 + 1) * (2 * r2 + 1); if (big < fill * area2) continue;
      const small = boxSum(iM, W, x - r1, y - r1, x + r1, y + r1); if (!small) continue;
      const band = boxSum(iL, W, x - r1, y - r1, x + r1, y + r1) / small - boxSum(iL, W, x - r2, y - r2, x + r2, y + r2) / big;
      sum += band * band; cnt++;
    }
    out.push({ px: s, rms: cnt ? +Math.sqrt(sum / cnt).toFixed(3) : null, samples: cnt });
  }
  const have = out.filter((s) => s.rms != null);
  return { scales: out, total: have.length ? +Math.sqrt(have.reduce((a, s) => a + s.rms * s.rms, 0)).toFixed(3) : null, waterShare: +(n / (w * h)).toFixed(4) };
}

// ------------------------------------------------------------------------------------------------------------------------------- palette
const BINS = 12;
function describe(img, pick) {
  const { width: w, height: h, data } = img, hue = new Float64Array(BINS); let n = 0, sS = 0, sV = 0, sR = 0, sG = 0, sB = 0, grey = 0, chroma = 0;
  for (let i = 0, o = 0; i < w * h; i++, o += 4) {
    if (!pick(i)) continue;
    const r = data[o], g = data[o + 1], b = data[o + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, s = mx ? d / mx : 0; n++; sS += s; sV += mx / 255; sR += r; sG += g; sB += b;
    if (s < 0.12 || mx < 26) { grey++; continue; }
    let hh; if (mx === r) hh = ((g - b) / d) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4; hh *= 60; if (hh < 0) hh += 360;
    hue[Math.min(BINS - 1, Math.floor(hh / (360 / BINS)))] += s * (mx / 255); chroma++;
  }
  if (!n) return { share: 0 };
  const tot = hue.reduce((a, b) => a + b, 0) || 1, hist = Array.from(hue, (v) => +(v / tot).toFixed(3));
  const top = hist.map((v, k) => [v, k]).sort((a, b) => b[0] - a[0]).slice(0, 3).filter((t) => t[0] > 0).map((t) => ({ hue: t[1] * (360 / BINS), share: t[0] }));
  return { share: +(n / (w * h)).toFixed(4), saturation: +(sS / n).toFixed(3), brightness: +(sV / n).toFixed(3), rgb: [Math.round(sR / n), Math.round(sG / n), Math.round(sB / n)], greyShare: +(grey / n).toFixed(3), hueHist: hist, dominant: top };
}
/** Hue histogram (12 bins of 30 degrees from red, weighted by saturation and brightness so a grey pixel does not vote), mean saturation, brightness and colour of the water, the land (everything that is not water) and the frame. */
export function palette(img, mask) {
  const m = mask || waterMask(img);
  return { frame: describe(img, () => true), water: describe(img, (i) => m[i] === 1), land: describe(img, (i) => m[i] === 0) };
}

// ------------------------------------------------------------------------------------------------------------------------------- difference
/**
 * How different two pictures of the same size are. `exclude` is a list of [x0, y0, x1, y1] rectangles in pixels left out (a HUD, say). Returns { counted, meanAbs (the mean over the
 * counted pixels of the mean absolute difference of R, G and B, 0 to 255), share (the share of counted pixels where some channel differs by more than `threshold`), identical }.
 */
export function diffImages(a, b, o = {}) {
  if (a.width !== b.width || a.height !== b.height) return { error: `size ${a.width}x${a.height} against ${b.width}x${b.height}` };
  const { width: w, height: h } = a, thr = o.threshold ?? 12, skip = new Uint8Array(w * h);
  for (const [x0, y0, x1, y1] of o.exclude || []) for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) skip[y * w + x] = 1;
  let counted = 0, sum = 0, over = 0, same = true;
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    if (skip[i]) continue;
    const dr = abs(a.data[p] - b.data[p]), dg = abs(a.data[p + 1] - b.data[p + 1]), db = abs(a.data[p + 2] - b.data[p + 2]);
    counted++; sum += dr + dg + db; if (dr || dg || db) same = false;
    if (dr > thr || dg > thr || db > thr) over++;
  }
  return { counted, meanAbs: counted ? +(sum / counted / 3).toFixed(3) : 0, share: counted ? +(over / counted).toFixed(4) : 0, identical: same };
}

// ------------------------------------------------------------------------------------------------------------------------------- anchoring
/**
 * Did the water move with the world? A is a picture from one camera and B from another; a point of the world that stands at (x + dx, y + dy) in A stands at (x, y) in B (`shift` is the camera's
 * move in device pixels). Only the fine detail is compared (the luminance minus its mean over a box `r` wide, so the screen-space tints and vignettes cancel), over the pixels that are water in
 * both. Returns the correlation of B with A moved by the shift (`shifted`) and with A not moved (`still`), the detail's strength (`energy`, RMS in levels) and a verdict:
 * `anchored` when the shifted match is good and clearly better than the still one, `inconclusive` when the water has too little detail to tell, else the water stayed on the screen.
 */
export function anchorScore(a, b, shift, o = {}) {
  const P = anchorPrep(a, b, o); if (P.error) return P;
  return anchorAt(P, shift[0], shift[1]);
}
/** What anchorScore works out once for a pair of pictures (the water in both, away from the shore, and the detail of each), so a search over many shifts does it once. */
function anchorPrep(a, b, o = {}) {
  if (a.width !== b.width || a.height !== b.height) return { error: 'size mismatch' };
  const { width: w, height: h } = a, r = o.r ?? 6, stride = o.stride ?? 2, minEnergy = o.minEnergy ?? 0.6, W = w + 1;
  const inner = (m) => { // the water at least r + 2 px from anything that is not water (a shore, a pier, a boat moves with the world whatever the water does: it must not decide the verdict)
    const dry = new Float64Array(w * h); for (let i = 0; i < dry.length; i++) dry[i] = m[i] ? 0 : 1;
    const ii = integral(dry, w, h), k = r + 2, out = new Uint8Array(w * h);
    for (let y = k; y < h - k; y++) for (let x = k; x < w - k; x++) if (m[y * w + x] && boxSum(ii, W, x - k, y - k, x + k, y + k) === 0) out[y * w + x] = 1;
    return out;
  };
  const ma = inner(o.maskA || waterMask(a)), mb = inner(o.maskB || waterMask(b));
  const hp = (img) => { // luminance minus its box mean
    const L = new Float64Array(w * h); for (let i = 0, p = 0; i < L.length; i++, p += 4) L[i] = luma(img.data, p);
    const ii = integral(L, w, h), out = new Float32Array(w * h);
    for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) out[y * w + x] = L[y * w + x] - boxSum(ii, W, x - r, y - r, x + r, y + r) / ((2 * r + 1) * (2 * r + 1));
    return out;
  };
  return { w, h, r, stride, minEnergy, ma, mb, ha: hp(a), hb: hp(b) };
}
/** The verdict of anchorScore for one shift (dx, dy) of a prepared pair. */
function anchorAt(P, dx, dy) {
  const { w, h, r, stride, minEnergy, ma, mb, ha, hb } = P;
  let sab = 0, saa = 0, sbb = 0, sas = 0, sss = 0, n = 0;
  for (let y = r; y < h - r; y += stride) for (let x = r; x < w - r; x += stride) {
    const xs = x + dx, ys = y + dy; if (xs < r || ys < r || xs >= w - r || ys >= h - r) continue;
    const i = y * w + x, j = ys * w + xs; if (!mb[i] || !ma[j] || !ma[i]) continue;
    const vb = hb[i], vs = ha[j], v0 = ha[i]; sab += vb * vs; sbb += vb * vb; saa += vs * vs; sas += vb * v0; sss += v0 * v0; n++;
  }
  if (n < 400) return { samples: n, inconclusive: true, anchored: false, reason: 'not enough water in both pictures' };
  const energy = Math.sqrt(sbb / n), shifted = sab / Math.sqrt(saa * sbb || 1), still = sas / Math.sqrt(sss * sbb || 1);
  const inconclusive = energy < minEnergy, anchored = !inconclusive && shifted >= 0.5 && shifted > still + 0.15;
  return { samples: n, energy: +energy.toFixed(3), shifted: +shifted.toFixed(3), still: +still.toFixed(3), anchored, inconclusive };
}

/**
 * Did the water move with the world while the clock ran? As anchorScore, but B's water is allowed to have drifted from where the camera's move alone puts it: the best match is searched within
 * `max` device pixels of the shifted place and a margin beyond it (one pixel steps), and the water is anchored when that best match is good (0.5), clearly better than no move at all, and no further than `max` away.
 * The art direction allows the sea a drift of 0.1 tile (4.5 world pixels) a second: `max` is that times the time between the shots, the zoom and the density, and a pixel or two for the raster.
 * Returns { samples, energy, shifted (the best correlation), still, residual [dx, dy], anchored, inconclusive }.
 */
export function driftScore(a, b, shift, max, o = {}) {
  const P = anchorPrep(a, b, o); if (P.error) return P;
  const reach = Math.ceil(max) + (o.margin ?? 6); // the search goes a few pixels past the allowance, so a drift that is too big is FOUND too big and not mistaken for the best match inside the allowance
  let best = null, still = null;
  for (let ey = -reach; ey <= reach; ey++) for (let ex = -reach; ex <= reach; ex++) {
    const r = anchorAt(P, shift[0] + ex, shift[1] + ey);
    if (r.inconclusive) { if (!best) best = { ...r, residual: [ex, ey] }; continue; }
    if (!best || best.inconclusive || r.shifted > best.shifted) best = { ...r, residual: [ex, ey] };
    still = r.still;
  }
  if (!best) return { samples: 0, inconclusive: true, anchored: false, reason: 'no search window' };
  if (best.inconclusive) return best;
  const within = Math.hypot(best.residual[0], best.residual[1]) <= max + 1e-9, anchored = best.shifted >= 0.5 && best.shifted > (still ?? best.still) + 0.15 && within;
  return { samples: best.samples, energy: best.energy, shifted: best.shifted, still: +(still ?? best.still).toFixed(3), residual: best.residual, withinAllowance: within, anchored, inconclusive: false };
}

/**
 * Did the water scale with the camera? A and B are pictures of the same world from two zooms: a point at (x, y) in A is at (k x + tx, k y + ty) in B (`map`). The fine detail is compared at matching WORLD
 * scales (B's luminance minus its mean over a box `r` wide, A's over a box `r / k` wide: a crest that is 10 pixels long in A is 10 k in B), over the pixels that are water in both, where A's value is read at the
 * point B's pixel maps back to. A sea painted in screen space does not scale: its detail stays one size at both zooms and the match is poor. Returns { samples, energy, scaled (the correlation with the
 * mapping), unscaled (the correlation with the pictures laid over each other, which a screen-fixed texture would win), anchored, inconclusive }.
 */
export function scaleScore(a, b, map, o = {}) {
  if (a.width !== b.width || a.height !== b.height) return { error: 'size mismatch' };
  const { width: w, height: h } = a, { k, tx, ty } = map, rB = o.r ?? 12, rA = Math.max(2, Math.round(rB / k)), stride = o.stride ?? 3, minEnergy = o.minEnergy ?? 0.5, W = w + 1;
  const inner = (m, r) => { const dry = new Float64Array(w * h); for (let i = 0; i < dry.length; i++) dry[i] = m[i] ? 0 : 1; const ii = integral(dry, w, h), q = r + 2, out = new Uint8Array(w * h); for (let y = q; y < h - q; y++) for (let x = q; x < w - q; x++) if (m[y * w + x] && boxSum(ii, W, x - q, y - q, x + q, y + q) === 0) out[y * w + x] = 1; return out; };
  const hp = (img, r) => { const L = new Float64Array(w * h); for (let i = 0, p = 0; i < L.length; i++, p += 4) L[i] = luma(img.data, p); const ii = integral(L, w, h), out = new Float32Array(w * h); for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) out[y * w + x] = L[y * w + x] - boxSum(ii, W, x - r, y - r, x + r, y + r) / ((2 * r + 1) * (2 * r + 1)); return out; };
  const ma = inner(o.maskA || waterMask(a), rA), mb = inner(o.maskB || waterMask(b), rB), ha = hp(a, rA), hb = hp(b, rB), hbA = hp(b, rA); // (hbA: B at A's box size, for the unscaled comparison of like with like)
  let sab = 0, saa = 0, sbb = 0, sas = 0, sss = 0, sbb2 = 0, n = 0;
  for (let y = rB; y < h - rB; y += stride) for (let x = rB; x < w - rB; x += stride) {
    const xa = Math.round((x - tx) / k), ya = Math.round((y - ty) / k); if (xa < rA || ya < rA || xa >= w - rA || ya >= h - rA) continue;
    const i = y * w + x, j = ya * w + xa; if (!mb[i] || !ma[j] || !ma[i]) continue;
    const vb = hb[i], va = ha[j], vs = ha[i], vb2 = hbA[i]; sab += vb * va; sbb += vb * vb; saa += va * va; sas += vb2 * vs; sss += vs * vs; sbb2 += vb2 * vb2; n++;
  }
  if (n < 400) return { samples: n, inconclusive: true, anchored: false, reason: 'not enough water in both pictures' };
  const energy = Math.sqrt(sbb / n), scaled = sab / Math.sqrt(saa * sbb || 1), unscaled = sas / Math.sqrt(sss * sbb2 || 1), inconclusive = energy < minEnergy, anchored = !inconclusive && scaled >= 0.5 && scaled > unscaled + 0.15;
  return { samples: n, energy: +energy.toFixed(3), scaled: +scaled.toFixed(3), unscaled: +unscaled.toFixed(3), anchored, inconclusive };
}

/**
 * Pixels a picture never painted: fully transparent, or black (all of R, G, B at or under `black`, 8 by default). An opaque canvas that is not painted all over shows black there, so a sea that ends where its
 * bitmap ends does it; the island's own palette has no pure black. Only a SOLID area counts: a black pixel is unpainted when a block of (2 r + 1) pixels square (r = 8, 17) of black stands on it, so the dark strokes
 * and the fat letters of a label drawn over the world (the map's region names) are not mistaken for a hole, and a band along a window's edge is (a block at the image's edge is judged by the part of it that is inside).
 * Returns { count, share, worst: { x0, y0, x1, y1 } | null (the bounding box of the unpainted pixels) }.
 */
export function unpainted(img, o = {}) {
  const { width: w, height: h, data } = img, black = o.black ?? 8, r = o.r ?? 8, W = w + 1, dark = new Float64Array(w * h);
  for (let i = 0, p = 0; i < dark.length; i++, p += 4) dark[i] = data[p + 3] === 0 || (data[p] <= black && data[p + 1] <= black && data[p + 2] <= black) ? 1 : 0;
  const ii = integral(dark, w, h), core = new Float64Array(w * h), full = (r + 1) * (r + 1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!dark[y * w + x]) continue;
    const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r), y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r), area = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (area >= full && boxSum(ii, W, x0, y0, x1, y1) === area) core[y * w + x] = 1;
  }
  const ic = integral(core, w, h); let count = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!dark[y * w + x] || !boxSum(ic, W, Math.max(0, x - r), Math.max(0, y - r), Math.min(w - 1, x + r), Math.min(h - 1, y + r))) continue;
    count++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { count, share: +(count / (w * h)).toFixed(6), worst: count ? { x0, y0, x1, y1 } : null };
}
