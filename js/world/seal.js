// Sealing: the one pixel pass the world runs on a baked bitmap (a ground chunk, a sprite) so no hairline crack is left where two filled shapes meet. Pure: typed arrays in, typed arrays out, nothing here touches a canvas.
// Owner: T5 RASTER QUALITY (docs/RENDER_PLAN.md section 5, DIAGNOSIS S1 and C5).
//
// WHY. Two shapes that share an edge are each anti-aliased on it. A pixel on the shared edge that is half inside each gets coverage 0.5 from the first shape and 0.5 from the second, and "source over" gives it
// 1 - 0.5 x 0.5 = 0.75, not 1: a quarter of whatever is under the bitmap shows through. On a ground chunk that is the sea, on a sprite the ground, as a faint line along every edge of every face and every tile.
// Stroking the shapes wider hides it only where the stroke is a device pixel or more (zoom and density decide), which is why the old tile loop cracked below zoom 0.9 and at density 1 to 1.5 and not above.
//
// WHAT. Every pixel that is not opaque (alpha under 250) and has opaque pixels on BOTH sides of it along a row or a column, within two pixels, is a gap between two filled regions and takes their alpha (the lower of the two).
// A gap one or two pixels wide is filled, anything wider is left alone, and the coast, a soft tail and a corner are not touched (they have opaque pixels on one side only). That is a closing of the alpha plane by a line
// of three pixels along each axis, done twice so that the pixel where two cracks cross is filled too. Colour is never touched except where a filled pixel had none (alpha 0): it takes its neighbour's. `data` is straight
// (non-premultiplied) RGBA, what getImageData gives and putImageData takes, so a half-covered pixel keeps the right blend of the two colours and only its alpha rises.
//
// COST. One pass over the alpha plane to find the 16 x 16 blocks that hold both opaque and not-opaque pixels (a block that is all land or all sea has no gap in it), then the two row and column tests on the not-opaque pixels
// of those blocks only: 0.2 to 0.5 ms for a 386 x 386 chunk in the browser. It runs once, when a bitmap is baked, never in a frame's drawing.

/** Alpha above this is "opaque" for the counters below. */
export const OPAQUE = 250;

/**
 * Close the gaps in the alpha plane of straight RGBA `data` (w x h): see the head of this file. `o.scratch` may hand in a Uint8Array of w x h as `a` to be reused between calls. The one pixel ring at the bitmap's edge is never
 * written (a chunk keeps a bleed there). Returns how many pixels were raised.
 */
const BLOCK = 16;
export function closeAlpha(data, w, h, o = {}) {
  const n = w * h; if (!(w > 4 && h > 4) || data.length < n * 4) return 0;
  const A = o.scratch?.a?.length >= n ? o.scratch.a : new Uint8Array(n), bw = Math.ceil(w / BLOCK), bh = Math.ceil(h / BLOCK), flags = o.scratch?.flags?.length >= bw * bh ? o.scratch.flags : new Uint8Array(bw * bh);
  flags.fill(0, 0, bw * bh);
  // one pass: the alpha plane, and for each block whether it holds an opaque pixel (1) and a not-opaque one (2)
  for (let y = 0; y < h; y++) {
    const r = y * w, fb = (y >> 4) * bw;
    for (let x = 0; x < w; x++) { const v = data[(r + x) * 4 + 3]; A[r + x] = v; flags[fb + (x >> 4)] |= v >= OPAQUE ? 1 : 2; }
  }
  let changed = 0;
  for (let pass = 0; pass < 2; pass++) {
    let any = 0;
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      if (flags[by * bw + bx] !== 3) continue; // all opaque or all not: no gap inside
      const x0 = Math.max(bx * BLOCK, 2), x1 = Math.min(bx * BLOCK + BLOCK, w - 2), y0 = Math.max(by * BLOCK, 2), y1 = Math.min(by * BLOCK + BLOCK, h - 2);
      for (let y = y0; y < y1; y++) {
        const r = y * w;
        for (let x = x0; x < x1; x++) {
          const i = r + x; if (A[i] >= OPAQUE) continue;
          let v = 0, src = -1;
          const l1 = A[i - 1], r1 = A[i + 1], u1 = A[i - w], d1 = A[i + w];
          if (l1 >= OPAQUE) { if (r1 >= OPAQUE) { v = l1 < r1 ? l1 : r1; src = i - 1; } else { const r2 = A[i + 2]; if (r2 >= OPAQUE) { v = l1 < r2 ? l1 : r2; src = i - 1; } } }
          else if (r1 >= OPAQUE) { const l2 = A[i - 2]; if (l2 >= OPAQUE) { v = r1 < l2 ? r1 : l2; src = i + 1; } }
          if (u1 >= OPAQUE) { if (d1 >= OPAQUE) { const m = u1 < d1 ? u1 : d1; if (m > v) { v = m; src = i - w; } } else { const d2 = A[i + 2 * w]; if (d2 >= OPAQUE) { const m = u1 < d2 ? u1 : d2; if (m > v) { v = m; src = i - w; } } } }
          else if (d1 >= OPAQUE) { const u2 = A[i - 2 * w]; if (u2 >= OPAQUE) { const m = d1 < u2 ? d1 : u2; if (m > v) { v = m; src = i + w; } } }
          if (v > A[i]) {
            if (A[i] === 0 && src >= 0) { data[i * 4] = data[src * 4]; data[i * 4 + 1] = data[src * 4 + 1]; data[i * 4 + 2] = data[src * 4 + 2]; } // a hole has no colour of its own: borrow a neighbour's
            A[i] = v; data[i * 4 + 3] = v; changed++; any++;
          }
        }
      }
    }
    if (!any) break;
  }
  return changed;
}

/**
 * Count the crack pixels in straight RGBA `data`: pixels whose alpha is under `below` (default 225: a tenth of what is underneath shows) that sit in an opaque field, meaning there are opaque pixels on BOTH sides of
 * them along one of the four axes within `reach` pixels (default 3). The coast, the edge of a chunk and a soft shadow's tail are not cracks: they have opaque pixels on one side only. This is what scripts/diag/seams.mjs
 * counted with an integral image, as a pure function the tests can call.
 */
export function countCracks(data, w, h, below = 225, reach = 3) {
  let n = 0; const A = (x, y) => data[(y * w + x) * 4 + 3];
  for (let y = reach; y < h - reach; y++) {
    for (let x = reach; x < w - reach; x++) {
      const a = A(x, y); if (a === 0 || a >= below) continue;
      let l = false, r = false, u = false, d = false, ul = false, dr = false, ur = false, dl = false;
      for (let k = 1; k <= reach; k++) {
        if (!l && A(x - k, y) >= OPAQUE) l = true; if (!r && A(x + k, y) >= OPAQUE) r = true; if (!u && A(x, y - k) >= OPAQUE) u = true; if (!d && A(x, y + k) >= OPAQUE) d = true;
        if (!ul && A(x - k, y - k) >= OPAQUE) ul = true; if (!dr && A(x + k, y + k) >= OPAQUE) dr = true; if (!ur && A(x + k, y - k) >= OPAQUE) ur = true; if (!dl && A(x - k, y + k) >= OPAQUE) dl = true;
      }
      if ((l && r) || (u && d) || (ul && dr) || (ur && dl)) n++;
    }
  }
  return n;
}

/**
 * Edge jaggedness of a coverage mask: how much of a silhouette's boundary is a hard stair (a boundary pixel whose alpha is 0 or 255 with an opposite neighbour, i.e. an edge the anti-aliasing did not touch) against the pixels
 * that carry a partial alpha. A smooth anti-aliased edge has a high share of partial pixels; a pixel-snapped hard edge a low one. Returns { edge, partial, share } over the pixels that touch the boundary.
 */
export function edgeSoftness(data, w, h) {
  let edge = 0, partial = 0; const A = (x, y) => data[(y * w + x) * 4 + 3];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const a = A(x, y), l = A(x - 1, y), r = A(x + 1, y), u = A(x, y - 1), d = A(x, y + 1);
    const lo = Math.min(a, l, r, u, d), hi = Math.max(a, l, r, u, d);
    if (hi - lo < 16) continue; // inside a flat region
    edge++; if (a > 8 && a < 247) partial++;
  }
  return { edge, partial, share: edge ? partial / edge : 1 };
}

/** The fraction of the alpha plane's non-zero pixels that a closing changed: for tests that hold the pass to "fills cracks, moves no silhouette". */
export function sealReport(before, after, w, h) {
  let raised = 0, grown = 0, opaqueBefore = 0;
  for (let i = 0, j = 3; i < w * h; i++, j += 4) { const a = before[j], b = after[j]; if (a >= OPAQUE) opaqueBefore++; if (b > a) { raised++; if (a === 0) grown++; } }
  return { raised, grown, opaqueBefore };
}
