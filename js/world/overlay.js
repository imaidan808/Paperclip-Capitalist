// The labels over the world: price tags, buyer bubbles, crate icons, "+ Hire", progress bars, the district name tags and the pips under them, placed so they do not sit on one another.
// Owner: T5 RASTER QUALITY (docs/RENDER_PLAN.md). The label sprites themselves are labels.js.
import { sx, sy, clamp, roundRect } from './iso.js';
import { LAYOUT, DIST } from './layout.js';
import { qs } from './labels.js';
import { snap, sans } from './gfx.js';
import { money, PIP_ZOOM } from './common.js';

const TAG_SHIFT = [[0, 0], [0, -19], [0, 19], [-34, 0], [34, 0], [-34, -19], [34, -19], [-34, 19], [34, 19], [0, -38], [0, 38], [-34, -38], [34, -38], [-34, 38], [34, 38], [-68, 0], [68, 0], [-68, -19], [68, -19], [-68, 19], [68, 19]], TAG_PULL = 3, TAG_SHORT = 0.03; // where a name tag may stand off its district (x, y in px) to clear another tag (a tag is 18px high), and what a px of that costs against the area it would cover
const NARROW = 500, CROWD = 4;                                 // a screen narrower than this (a phone) has no room for passing notes once this many name tags are on it (the whole-island view: sixteen)
/** Does the rectangle touch any of the first `n` occupied rectangles in `R` (x0, y0, x1, y1 each)? */
function hitsAny(R, n, x0, y0, x1, y1) { for (let r = 0; r < n; r++) if (x0 < R[r * 4 + 2] && x1 > R[r * 4] && y0 < R[r * 4 + 3] && y1 > R[r * 4 + 1]) return true; return false; }
/**
 * The place for a rectangle `hw` either side of `x` and from 9 above `y` to `below` under it, among TAG_SHIFT's, that the occupied rectangles in `R` (first `n`) cover least,
 * its x held between `out.lo` and `out.hi`: its index into TAG_SHIFT and the area covered go into `out`. A place costs the area it would cover, plus TAG_PULL for each px it
 * is off the rectangle's own place; the cheapest wins (so a clear place a long way off loses to a small overlap beside it).
 */
function bestSlot(R, n, x, y, hw, below, out) {
  const lo = out.lo, hi = out.hi; let cost = 1e18; out.k = 0; out.over = 0;
  for (let k = 0; k < TAG_SHIFT.length; k++) {
    const dy = TAG_SHIFT[k][1], xc = clamp(x + TAG_SHIFT[k][0], lo, hi), x0 = xc - hw, x1 = xc + hw, y0 = y + dy - 9, y1 = y + dy + below; let over = 0;
    for (let r = 0; r < n; r++) { const w = Math.min(x1, R[r * 4 + 2]) - Math.max(x0, R[r * 4]), h = Math.min(y1, R[r * 4 + 3]) - Math.max(y0, R[r * 4 + 1]); if (w > 0 && h > 0) over += w * h; }
    const c = over + (Math.abs(dy) + Math.abs(xc - x) * 0.5) * TAG_PULL;
    if (c < cost) { cost = c; out.k = k; out.over = over; }
    if (cost === 0) break;                                                                    // its own place, nothing on it: nothing can beat that
  }
}
export const overlayMethods = {
  /**
   * The labels over the world, placed so they do not sit on one another. Three tiers, highest first:
   *   1. the district name tags that show when zoomed out. They say where everything is, so they are placed first, stand over their district (a couple of rows
   *      or a tag's width off it at most, and only to clear another tag; drawn short when that is not enough) and are never left out; every other label works round them (`planZoneTags`).
   *   2. the labels you act on: price tags, buyer bubbles, crate icons, "+ Hire", progress bars. Working from the nearest back, a price tag that would land on a
   *      label already placed is nudged up until it clears (at most 66px: three tags' height), so a pile of lots stays readable.
   *   3. the passing notes (`lo`: "Opens at ...", "You"). They give way to a name tag, and on a phone with a crowd of tags in view (the whole island: sixteen)
   *      they are not shown at all (the tag carries the lock, and the tag of the district you are in carries a dot for "You"). Close in on one district a note shows again.
   * Sizes are worked out from the text's length: close enough to keep two labels apart, and free of any measuring.
   */
  drawOverlay(ctx) {
    const { W, H } = this, cam = this.cam, z = cam.z, s = qs(clamp(z, 0.75, 1.25)), org = this.origin(), ox = org[0], oy = org[1], kz = this.renderScale() / this.dpr, ov = this.overlay, R = this.ovRects || (this.ovRects = new Float64Array(4 * 320));
    this.labels.setDpr(this.dpr);
    const tags = this.mode === 'world' && z < 0.8;
    let nr = tags ? this.planZoneTags(R) : (this.tagN = 0); const nt = nr, quiet = W < NARROW && nt >= CROWD; // the first `nt` rectangles are the name tags
    for (let i = ov.length - 1; i >= 0; i--) {
      const o = ov[i]; o.px = o.wx * kz + ox; o.py = o.wy * kz + oy; o.on = !(o.px < -80 || o.px > W + 80 || o.py < -40 || o.py > H + 40);
      if (!o.on) continue;
      const wd = (o.k === 'chip' ? o.n * 6.7 + 14 : o.k === 'tag' ? o.n * 6.8 + 30 : o.k === 'bub' ? o.n * 6.8 + 32 : o.k === 'icon' ? 24 : 58) * s, ht = (o.k === 'bub' ? 28 : o.k === 'icon' ? 24 : o.k === 'tag' ? 20 : o.k === 'bar' ? 11 : 18) * s;
      if (o.lo && tags && (quiet || hitsAny(R, nt, o.px - wd / 2, o.py - ht / 2, o.px + wd / 2, o.py + ht / 2))) { o.on = false; continue; } // a passing note never covers a name tag
      let nudged = 0;
      for (;;) {
        const x0 = o.px - wd / 2, x1 = o.px + wd / 2, y0 = o.k === 'bub' ? o.py - ht : o.py - ht / 2, y1 = o.k === 'bub' ? o.py : o.py + ht / 2;
        let hitTop = 1e9; for (let r = 0; r < nr; r++) if (x0 < R[r * 4 + 2] && x1 > R[r * 4] && y0 < R[r * 4 + 3] && y1 > R[r * 4 + 1]) hitTop = Math.min(hitTop, R[r * 4 + 1]);
        if (hitTop < 1e9 && o.k === 'tag' && nudged < 66 * s) { const d = Math.min(y1 - hitTop + 2, 66 * s - nudged); o.py -= d; nudged += d; if (d > 0.5) continue; }
        if (nr < 320) { R[nr * 4] = x0; R[nr * 4 + 1] = y0; R[nr * 4 + 2] = x1; R[nr * 4 + 3] = y1; nr++; }
        break;
      }
    }
    this.ovN = nr;
    for (let i = 0; i < ov.length; i++) { const o = ov[i]; if (o.on) o.draw(ctx, o.px, o.py, s); }
    if (tags) this.drawZoneTags(ctx);
  },

  /**
   * Where each district's name tag (and the pips row under it) stands this frame, written to `tagPlan` (`tagN` of them) and into `R` as occupied rectangles; answers how many
   * were written. The tag of the district you are in is placed first, then the one chosen in the list, then open districts, then locked ones. A tag stands exactly over its
   * district unless another tag is already there: it then takes whichever of a few places (`TAG_SHIFT`: a row up or down, a little to either side) leaves it least covered,
   * with a small pull back towards its own place. When even that would still cover a good part of it, it is drawn short (the lock and the number: "12" for "12  Creative")
   * and looked for again, so a crowded island keeps every district's tag, readable, instead of losing some. A tag is never left out.  The tag of the district the player stands in carries a
   * marker (a dot): where the "You" note has no room it is the only sign of where you are.
   */
  planZoneTags(R) {
    const plan = this.tagPlan || (this.tagPlan = Array.from({ length: LAYOUT.ids.length }, () => ({ id: 0, x: 0, y: 0, text: '', color: '', pips: false, k: 0, over: 0, px: 0, py: 0 }))); // reused every frame
    const order = this.tagOrder || (this.tagOrder = LAYOUT.ids.slice()), pick = this.tagPick || (this.tagPick = { k: 0, over: 0, lo: 0, hi: 0 });
    const { W, H } = this, zp = this.zpip, pips = this.cam.z < PIP_ZOOM, at = this.player.zone, chosen = this.api.ui?.zone, openOf = (id) => this.unlocked?.has(id) ?? true;
    const rank = (id) => (id === at ? 0 : id === chosen ? 1 : openOf(id) ? 2 : 3) * 64 + id;
    if (pips) this.zonePips();
    order.sort((a, b) => rank(a) - rank(b));
    let nr = 0, m = 0;
    for (const id of order) {
      const D = DIST[id], [px, py] = this.w2s(sx(D.cx, D.cy), sy(D.cx, D.cy, D.z) - 70);
      if (px < -120 || px > W + 120 || py < -30 || py > H + 30) continue;
      const open = openOf(id), mark = `${id === at ? '\u25CF ' : ''}${open ? '' : '\u{1F512} '}`, n = pips ? zp[id * 3] + zp[id * 3 + 1] + zp[id * 3 + 2] : 0;
      const below = n ? 20 : 9, pw = Math.min(n, 6) * 10 + 8;                                    // the footprint reaches below the tag when it carries a pips row
      let text = `${mark}${id}  ${D.short}`, hw = Math.max(text.length * 6.7 + 14, pw) / 2;
      this.tagSpan(px, hw, pick); bestSlot(R, nr, px, py, hw, below, pick);
      if (pick.over > hw * 2 * 18 * TAG_SHORT) {                                                  // still covers a good part of it: try the short form
        const t2 = `${mark}${id}`, hw2 = Math.max(t2.length * 6.7 + 14, pw) / 2, k1 = pick.k, o1 = pick.over, lo1 = pick.lo, hi1 = pick.hi;
        this.tagSpan(px, hw2, pick); bestSlot(R, nr, px, py, hw2, below, pick);
        if (pick.over < o1) { text = t2; hw = hw2; } else { pick.k = k1; pick.over = o1; pick.lo = lo1; pick.hi = hi1; }
      }
      const tx = clamp(px + TAG_SHIFT[pick.k][0], pick.lo, pick.hi), ty = py + TAG_SHIFT[pick.k][1];
      if (nr < 320) { R[nr * 4] = tx - hw; R[nr * 4 + 1] = ty - 9; R[nr * 4 + 2] = tx + hw; R[nr * 4 + 3] = ty + below; nr++; }
      const t = plan[m++]; t.id = id; t.x = tx; t.y = ty; t.text = text; t.color = open ? D.pal[1] : '#a3b3c9'; t.pips = n > 0; t.k = pick.k; t.over = pick.over; t.px = px; t.py = py;
    }
    this.tagN = m;
    return nr;
  },

  /** The span (written into `out.lo` and `out.hi`) a tag `hw` either side of its centre may stand in: inside the free part of the screen, with a margin, when its district's own x is on it (a tag is never cut by the screen's edge), else anywhere. */
  tagSpan(px, hw, out) { const I = this.inset, lo = I.l + hw + 4, hi = this.W - I.r - hw - 4, on = px >= 0 && px <= this.W && lo < hi; out.lo = on ? lo : -1e9; out.hi = on ? hi : 1e9; }, // (a tag keeps clear of the camera buttons too: `inset`)

  /** Name tags over each visible district while zoomed out, so you always know where you are: draws what `planZoneTags` worked out. */
  drawZoneTags(ctx) {
    const plan = this.tagPlan; if (!plan) return;
    for (let i = (this.tagN || 0) - 1; i >= 0; i--) { const t = plan[i]; this.chip(ctx, t.x, t.y, t.text, t.color, 1); if (t.pips) this.pips(ctx, t.id, t.x, t.y + 15); } // the first placed is drawn last, so where two still touch the more important one is on top
  },

  /** Count each district's pipelines by what they are doing (running, paused or under audit, starved) into `zpip`; read-only, the same states the building bars show. */
  zonePips() {
    const n = this.zpip; n.fill(0);
    for (const e of this.ents.values()) { if (e.type !== 'pipe' || e.gone || !e.pipe) continue; const p = e.pipe, k = e.zone * 3 + (p.status === 'paused' || p.status === 'audit' ? 1 : p.starved ? 2 : 0); if (k < n.length) n[k]++; }
  },

  /**
   * The whole-island view's pipeline pips: at this zoom a building's bar is a few pixels, so each district shows one small mark per pipeline under its own name
   * (amber while it runs, red when starved, grey when paused), where it can never lie on another label. `x, y` is the centre of the row.
   */
  pips(g, id, x, y) {
    const n = this.zpip, k = id * 3, run = n[k], off = n[k + 1], starved = n[k + 2]; if (!(run | off | starved)) return;
    const sp = this.labels.pips(run, off, starved); if (sp) { this.labels.blit(g, sp, x, y); return; }
    let px = x - ((run + off + starved) * 10 - 2) / 2; // no sprites here: the same row drawn directly
    for (const [c, m] of [['#ffc247', run], ['#ff7d75', starved], ['#7a7f88', off]]) for (let i = 0; i < m; i++) { g.fillStyle = c; g.fillRect(px, y - 1.5, 8, 3); px += 10; }
  },

  chip(g, x, y, text, color = '#ffd36e', s = 1) {
    const sp = this.labels.chip(text, color, qs(s)); if (sp) { this.labels.blit(g, sp, x, y); return; } // a crisp sprite where there are offscreen surfaces; the direct drawing below otherwise
    g.font = `700 ${Math.round(11 * s)}px ui-monospace, Menlo, monospace`; const w = g.measureText(text).width + 14 * s, h = 18 * s;
    roundRect(g, x - w / 2, y - h / 2, w, h, 5 * s); g.fillStyle = 'rgba(16,20,28,.9)'; g.fill(); g.strokeStyle = color; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y + 0.5); g.textBaseline = 'alphabetic';
  },

  icon(g, x, y, s, icon, sel) {
    const sp = this.labels.icon(icon, sel, qs(s)); if (sp) { this.labels.blit(g, sp, x, y); return; }
    const r = 12 * s; g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = sel ? '#ffd36e' : 'rgba(16,20,28,.9)'; g.fill(); g.strokeStyle = sel ? '#ffffff' : '#5b6b85'; g.lineWidth = 1.5; g.stroke();
    g.font = `${Math.round(14 * s)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(icon, x, y + 1); g.textBaseline = 'alphabetic';
  },

  tag(g, x, y, s, icon, text, color, hov) {
    const sp = this.labels.tag(icon, text, color, hov, qs(s)); if (sp) { this.labels.blit(g, sp, x, y); return; }
    g.font = `800 ${Math.round(11 * s)}px ui-monospace, Menlo, monospace`; const w = g.measureText(text).width + 30 * s, h = 20 * s;
    roundRect(g, x - w / 2, y - h / 2, w, h, 6 * s); g.fillStyle = 'rgba(16,20,28,.92)'; g.fill(); g.strokeStyle = hov ? '#ffffff' : color; g.lineWidth = 1.5; g.stroke();
    g.font = `${Math.round(13 * s)}px system-ui, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(icon, x - w / 2 + 5 * s, y + 1);
    g.font = `800 ${Math.round(11 * s)}px ui-monospace, Menlo, monospace`; g.fillStyle = color; g.fillText(text, x - w / 2 + 22 * s, y + 1); g.textBaseline = 'alphabetic';
  },

  leadBubble(g, x, y, s, B, l, hov) {
    const text = money(l.budget), urgent = !!l.need, bob = this.reduced() ? 0 : Math.sin(this.vt / 500 + l.born) * 1.5;
    const sp = this.labels.bubble(B.icon, text, urgent, hov, qs(s)); if (sp) { this.labels.blit(g, sp, x, y + bob); return; }
    g.font = `800 ${Math.round(11 * s)}px ui-monospace, Menlo, monospace`; const w = g.measureText(text).width + 32 * s, h = 22 * s;
    roundRect(g, x - w / 2, y - h + bob, w, h, 7 * s); g.fillStyle = 'rgba(16,20,28,.94)'; g.fill(); g.strokeStyle = urgent ? '#ffd36e' : hov ? '#ffffff' : '#5b6b85'; g.lineWidth = urgent ? 2 : 1.5; g.stroke();
    g.beginPath(); g.moveTo(x - 4 * s, y + bob); g.lineTo(x + 4 * s, y + bob); g.lineTo(x, y + 6 * s + bob); g.fill();
    g.font = `${Math.round(14 * s)}px system-ui, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(B.icon, x - w / 2 + 5 * s, y - h / 2 + 1 + bob);
    g.font = `800 ${Math.round(11 * s)}px ui-monospace, Menlo, monospace`; g.fillStyle = urgent ? '#ffd36e' : '#e8eef6'; g.fillText(text, x - w / 2 + 23 * s, y - h / 2 + 1 + bob);
    if (urgent) { g.fillStyle = '#ffd36e'; g.beginPath(); g.arc(x + w / 2 - 2, y - h + 2 + bob, 7 * s, 0, 7); g.fill(); g.fillStyle = '#1a1303'; g.font = `900 ${Math.round(11 * s)}px ui-monospace, Menlo, monospace`; g.textAlign = 'center'; g.fillText('!', x + w / 2 - 2, y - h + 3 + bob); }
    g.textBaseline = 'alphabetic';
  },

  /** A building's progress bar over its roof. Zoomed out, where three plots stand close together, it shrinks to a slim line so they do not pile up into black pills. */
  progress(g, x, y, s, frac, p, off) {
    const slim = this.cam.z < 0.72, d = this.dpr, w = (slim ? 30 : 54) * s, h = (slim ? 4 : 7) * s;
    const x0 = snap(x - w / 2, d), y0 = snap(y - h / 2, d);
    g.fillStyle = 'rgba(16,20,28,.92)'; roundRect(g, x0 - 2, y0 - 2, w + 4, h + 4, 3); g.fill();
    g.fillStyle = off ? '#7a7f88' : p.starved ? '#ff7d75' : '#ffc247'; g.fillRect(x0, y0, w * frac, h);
    g.font = sans(12 * s); g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText(p.status === 'audit' ? '\u{1F4CB}' : p.status === 'paused' ? '\u23F8' : p.starved ? '\u2757' : '', x, y - 8 * s);
  },
};
