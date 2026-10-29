// Map mode: the routes between districts, the district cards and region names, and the minimap.
// Owner: T5 RASTER QUALITY (docs/RENDER_PLAN.md).
import { sx, sy, clamp, roundRect } from './iso.js';
import { LAYOUT, DIST, PLOTS, EDGES, GW, GH, BW, REGIONS, zAt } from './layout.js';
import { mono, sans } from './gfx.js';
import { money, compact, PIP_ZOOM } from './common.js';

const NAME_STEPS = [0, 24, -24, 48, -48, 72], NAME_SHIFT = [0, -120, 120, -240, 240]; // where a region's name may move on the map to clear a card
export const mapMethods = {
  /** The overworld: every road as a route line between district nodes (gold as far as you have opened, grey and dashed beyond, blue for the ferry), and the four regions named. */
  drawMapRoute(ctx) {
    const g = this.g; if (!g) return;
    const proj = (x, y) => this.w2s(sx(x, y), sy(x, y, zAt(x, y)) - 4);
    const trace = (e) => { ctx.beginPath(); e.pts.forEach(([x, y], i) => { const [X, Y] = proj(x, y); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke(); };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash([]); ctx.strokeStyle = 'rgba(8,12,20,.6)'; ctx.lineWidth = 9;
    for (const e of EDGES) if (!e.path) trace(e);
    for (const e of EDGES) {
      const open = this.unlocked.has(e.gate);
      if (e.path) { ctx.strokeStyle = 'rgba(230,220,190,.55)'; ctx.lineWidth = 2; ctx.setLineDash([2, 6]); }
      else if (e.ferry) { ctx.strokeStyle = open ? '#7be3ff' : 'rgba(123,227,255,.45)'; ctx.lineWidth = 3; ctx.setLineDash([8, 8]); }
      else if (open) { ctx.strokeStyle = 'rgba(255,211,110,.95)'; ctx.lineWidth = 4; ctx.setLineDash([]); }
      else { ctx.strokeStyle = 'rgba(163,179,201,.75)'; ctx.lineWidth = 3; ctx.setLineDash([4, 8]); }
      trace(e);
    }
    ctx.setLineDash([]);
    ctx.restore();
    const D1 = DIST[1], D16 = DIST[16], [x1, y1] = proj(D1.ox - 3, D1.cy), [x2, y2] = proj(D16.ox + BW / 2, D16.oy - 4);
    this.chip(ctx, x1, y1 - 16, 'START', '#ffd36e', 1.05); this.chip(ctx, x2, y2 - 12, 'THE TOP', this.unlocked.has(16) ? '#ffd36e' : '#a3b3c9', 1.05);
  },

  /**
   * The map's district cards and the four region names. The cards are label sprites (crisp at any pixel density). A region's name is written first and
   * moved to the nearest free spot if a card or another name would sit on it, so nothing is printed over anything; a card that still lands on a name covers it.
   */
  drawMapLabels(ctx) {
    const g = this.g; if (!g) return; const s = g.s, compact = this.W < 760, cards = this.mapCards || (this.mapCards = []), cnt = this.mapCount || (this.mapCount = {});
    this.hitsLabel = {}; cards.length = 0; this.labels.setDpr(this.dpr);
    for (const a of s.assets) cnt[a.zone] = (cnt[a.zone] || 0) + 1;
    for (const id of LAYOUT.ids) {
      const D = DIST[id], open = this.unlocked.has(id), cur = id === this.api.ui.zone, hov = this.hover?.id === id && this.hover.kind === 'zone';
      const [cx, cy] = this.w2s(sx(D.cx, D.cy), sy(D.cx, D.cy, D.z) - 6);
      const stock = cnt[id] || 0, leads = (s.leads[id] || []).length;
      const l1 = `${open ? '' : '\u{1F512} '}${id}  ${compact ? D.short : D.name}`, l2 = open ? `${leads} buyers  ${stock} crates` : `opens at ${money(D.gate)}`;
      const sp = this.labels.card(D, l1, l2, compact, open, cur, hov);
      let w, h;
      if (sp) { w = sp.cw; h = sp.ch; } else { ctx.font = '800 12px ui-monospace, Menlo, monospace'; const w1 = ctx.measureText(l1).width; ctx.font = '600 10px ui-monospace, Menlo, monospace'; const w2 = ctx.measureText(l2).width; w = Math.max(w1, compact ? 0 : w2) + 34; h = compact ? 24 : 38; }
      const x = clamp(cx - w / 2, this.inset.l + 4, this.W - this.inset.r - w - 4), y = clamp(cy - h / 2, 4, this.H - h - 4);
      cards.push({ D, sp, l1, l2, open, cur, hov, x, y, w, h, cx, cy });
    }
    for (const k in cnt) cnt[k] = 0;
    this.spreadCards(cards); for (const c of cards) this.hitsLabel[c.D.id] = [c.x, c.y, c.w, c.h];
    // the four regions of the journey, written under the cards at the nearest free spot
    ctx.save(); ctx.textAlign = 'center'; ctx.font = mono(800, 17); ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(8,12,20,.8)';
    const placed = this.mapNames || (this.mapNames = []); placed.length = 0;
    for (const R of REGIONS) {
      let X = 0, Y = -1e9, n = 0; for (const i of R.ids) { const D = DIST[i], [px, py] = this.w2s(sx(D.cx, D.cy), sy(D.cx, D.cy, D.z)); X += px; Y = Math.max(Y, py); n++; }
      X /= n; const text = `${R.id}  ${R.name.toUpperCase()}`, w = ctx.measureText(text).width, h = 20;
      let bx = X, by = Y + 54, best = 1e9, free = false;
      search: for (const dy of NAME_STEPS) for (const dx of NAME_SHIFT) {
        const x = clamp(X + dx, this.inset.l + w / 2 + 6, this.W - this.inset.r - w / 2 - 6), y = clamp(Y + 54 + dy, 24, this.H - 20), r0 = x - w / 2, r1 = x + w / 2, c0 = y - 16, c1 = y + 6;
        let hit = 0; for (const c of cards) if (r0 < c.x + c.w + 6 && r1 > c.x - 6 && c0 < c.y + c.h + 4 && c1 > c.y - 4) hit++;
        for (const q of placed) if (r0 < q[2] + 8 && r1 > q[0] - 8 && c0 < q[3] && c1 > q[1]) hit++;
        if (hit < best) { best = hit; bx = x; by = y; } if (!hit) { free = true; break search; }
      }
      if (best >= 1e9) { bx = X; by = Y + 54; }
      placed.push([bx - w / 2, by - 16, bx + w / 2, by + 6]);
      ctx.globalAlpha = free ? 1 : 0.7; ctx.strokeText(text, bx, by); ctx.fillStyle = R.tint; ctx.fillText(text, bx, by); void h;
    }
    ctx.restore();
    // a card pushed away from its district keeps a thin leader line to it
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.38)'; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; ctx.beginPath();
    for (const c of cards) { const mx = c.x + c.w / 2, my = c.y + c.h / 2; if (Math.hypot(mx - c.cx, my - c.cy) > 30) { ctx.moveTo(mx, my); ctx.lineTo(c.cx, c.cy); } }
    ctx.stroke(); for (const c of cards) { const mx = c.x + c.w / 2, my = c.y + c.h / 2; if (Math.hypot(mx - c.cx, my - c.cy) > 30) ctx.fillRect(c.cx - 1.5, c.cy - 1.5, 3, 3); }
    ctx.restore();
    for (const c of cards) {
      if (c.sp) { this.labels.blit(ctx, c.sp, c.x, c.y, 0, 0); continue; }
      const { D, l1, l2, open, cur, hov, x, y, w, h } = c;
      ctx.globalAlpha = open ? 1 : 0.88;
      roundRect(ctx, x, y, w, h, 7); ctx.fillStyle = 'rgba(16,20,28,.94)'; ctx.fill(); ctx.strokeStyle = cur || hov ? '#ffd36e' : open ? D.pal[1] : '#5b6b85'; ctx.lineWidth = cur || hov ? 3 : 1.6; ctx.stroke();
      ctx.fillStyle = D.pal[1]; ctx.fillRect(x + 1, y + 6, 4, h - 12);
      ctx.font = '16px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(D.icon, x + 10, y + h / 2 + 1);
      ctx.font = '800 12px ui-monospace, Menlo, monospace'; ctx.fillStyle = open ? '#ffd36e' : '#a3b3c9'; ctx.fillText(l1, x + 30, y + (compact ? h / 2 + 1 : 13));
      if (!compact) { ctx.font = '600 10px ui-monospace, Menlo, monospace'; ctx.fillStyle = open ? '#e8eef6' : '#a3b3c9'; ctx.fillText(l2, x + 30, y + 27); }
      ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;
    }
    if (this.cam.z < PIP_ZOOM) { // the pipeline pips go under their card, but only where no other card stands (on a phone the cards are packed, and a pip peeping out from under a neighbour reads as a stray mark)
      this.zonePips();
      for (const c of cards) {
        const n = this.zpip[c.D.id * 3] + this.zpip[c.D.id * 3 + 1] + this.zpip[c.D.id * 3 + 2]; if (!n) continue;
        const x0 = c.x + c.w / 2 - (n * 10 + 8) / 2, x1 = x0 + n * 10 + 8, y0 = c.y + c.h, y1 = y0 + 12; let free = true;
        for (const o of cards) if (o !== c && x0 < o.x + o.w && x1 > o.x && y0 < o.y + o.h && y1 > o.y) { free = false; break; }
        if (free) this.pips(ctx, c.D.id, c.x + c.w / 2, c.y + c.h + 6);
      }
    }
  },

  /** Cards that would overlap are pushed apart in a few passes (mostly sideways-neutral, preferring up and down), so a small screen still shows every district's name. */
  spreadCards(cards) {
    const W = this.W, H = this.H, L = this.inset.l, Rt = this.inset.r;
    for (let it = 0; it < 24; it++) {
      let moved = false;
      for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i], b = cards[j], ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + 4, oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + 3;
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (oy <= ox * 1.6) { const d = oy / 2, up = a.y + a.h / 2 <= b.y + b.h / 2 ? -1 : 1; a.y += up * d; b.y -= up * d; }
        else { const d = ox / 2, left = a.x + a.w / 2 <= b.x + b.w / 2 ? -1 : 1; a.x += left * d; b.x -= left * d; }
      }
      for (const c of cards) { c.x = clamp(c.x, L + 4, W - Rt - c.w - 4); c.y = clamp(c.y, 4, H - c.h - 4); }
      if (!moved) break;
    }
  },

  /** The island's land, painted once into a small canvas (the minimap's backdrop). */
  miniBase() {
    if (this.mb) return this.mb;
    const c = document.createElement('canvas'); c.width = 150; c.height = 96; const g = c.getContext('2d'), b = this.bounds();
    g.fillStyle = '#10203a'; g.fillRect(0, 0, 150, 96);
    for (let j = 0; j < GH; j += 2) for (let i = 0; i < GW; i += 2) { const k = j * GW + i; if (!LAYOUT.land[k]) continue; g.fillStyle = LAYOUT.tcol[k] || '#4b7a4e'; g.fillRect((((i - j) * 32 - b.x0) / (b.x1 - b.x0)) * 150, (((i + j) * 16 - LAYOUT.ZV[j * LAYOUT.VW + i] - b.y0) / (b.y1 - b.y0)) * 96, 2.2, 1.6); }
    return (this.mb = c);
  },

  drawMini() {
    const m = this.mini, c = this.mctx, W = 150, H = 96, b = this.bounds();
    if (m.offsetParent === null) return; // hidden on phones: do not paint it
    c.clearRect(0, 0, W, H); c.drawImage(this.miniBase(), 0, 0);
    const px = (x) => (x - b.x0) / (b.x1 - b.x0) * W, py = (y) => (y - b.y0) / (b.y1 - b.y0) * H;
    for (const id of LAYOUT.ids) { const D = DIST[id], F = D.fp, pts = [[F[0], F[1]], [F[0] + F[2], F[1]], [F[0] + F[2], F[1] + F[3]], [F[0], F[1] + F[3]]].map(([gx, gy]) => [px(sx(gx, gy)), py(sy(gx, gy, D.z))]); c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fillStyle = this.unlocked?.has(id) ? D.cols.ground : 'rgba(20,26,40,.85)'; c.fill(); if (id === this.api.ui.zone) { c.strokeStyle = '#ffd36e'; c.lineWidth = 1.5; c.stroke(); } }
    for (const e of this.ents.values()) { if (e.type === 'lead' && !e.leaving) { c.fillStyle = e.lead?.need ? '#ffd36e' : '#e8eef6'; c.fillRect(px(sx(e.x, e.y)) - 1, py(sy(e.x, e.y, zAt(e.x, e.y))) - 1, 2, 2); } else if (e.type === 'pipe') { const pl = PLOTS[e.zone][e.plot % PLOTS[e.zone].length]; c.fillStyle = '#46e38e'; c.fillRect(px(sx(pl[0] + 1.5, pl[1] + 1.5)) - 2, py(sy(pl[0] + 1.5, pl[1] + 1.5, DIST[e.zone].z)) - 2, 4, 4); } }
    const pl = this.player; c.fillStyle = '#ffd36e'; c.fillRect(px(sx(pl.x, pl.y)) - 2, py(sy(pl.x, pl.y, zAt(pl.x, pl.y))) - 2, 4, 4);
    if (this.view) { c.strokeStyle = '#ffffff'; c.lineWidth = 1; c.strokeRect(px(this.cam.x - this.W / 2 / this.cam.z), py(this.cam.y - this.H / 2 / this.cam.z), (this.W / this.cam.z) / (b.x1 - b.x0) * W, (this.H / this.cam.z) / (b.y1 - b.y0) * H); }
  },
};
