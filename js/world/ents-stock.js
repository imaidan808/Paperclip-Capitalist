// Crates: lots for sale on their pallets and the stock the player holds. LEGACY drawers.
// Owner: T4 PROPS, NATURE AND CHARACTERS (docs/RENDER_PLAN.md).
import { ASSETS } from '../config.js';
import { P, box, shadow, ellipse, tone, shade, mix, clamp, facePoint } from './iso.js';
import { zAt } from './layout.js';
import { stampGlow } from './gfx.js';
import { money } from './common.js';
import './stock.js'; // the V2 drawers of the lot and asset layers register themselves (stack.js registerLayer) and are used while those flags are v2

const TAG_COLOR = { tool: '#a0a6ad', office: '#d9d2c0', prestige: '#7a5fb0', paper: '#e8e2cc', retro: '#b07a3a', electronics: '#4a8fb0', vehicle: '#b0493a', consumer: '#c45f7a', trend: '#ff3da8', scrap: '#6b5a4a', industrial: '#8a7a62', training: '#46a06a', digital: '#7be3ff', b2b: '#5a6fb0', franchise: '#e8cd6a', infra: '#6a5fa0',
  food: '#d98a3a', farm: '#8aa84a', bulk: '#9a8a6a', marine: '#3a8ab0', collectible: '#c9a227', luxury: '#b88adf', fashion: '#e06aa0', ip: '#9b6dff', media: '#d04aa8', realty: '#c47a5a', finance: '#4aa87a', energy: '#e0c030', medical: '#e0e8f0', home: '#b09070', outdoor: '#5a9a5a', gem: '#7ae0d0' };
const classColor = (cls) => TAG_COLOR[ASSETS[cls]?.tags[0]] || '#a07a45';
export const stockMethods = {
  drawLot(ctx, e) {
    const [gx, gy] = this.posOf(e), z = zAt(gx, gy), l = e.lot, [x, y0] = P(gx, gy, z), y = y0 - e.drop;
    const col = classColor(l.cls), hov = this.hover?.eid === e.id, auction = l.mode === 'auction';
    const lift = (hov ? 2.5 : 0) + (auction && !this.reduced() ? Math.sin(this.vt / 700 + gx * 3) * 0.9 : 0); // a crate under the pointer lifts a little; an auction lot breathes
    ellipse(ctx, x, y0 + 2, 17 - lift * 0.5, 8 - lift * 0.25, `rgba(8,10,20,${0.3 - lift * 0.02})`);
    ctx.save(); ctx.translate(0, -z - e.drop - lift);
    box(ctx, gx - 0.4, gy - 0.4, 0.8, 0.8, 4, tone('#8a6a45'));
    const f = box(ctx, gx - 0.34, gy - 0.34, 0.68, 0.68, 15, tone(l.cond === 'broken' ? shade(col, 0.7) : col), { z: 4, line: hov ? '#ffffff' : auction ? '#ffd36e' : 'rgba(0,0,0,.25)' });
    if (l.cond === 'broken') { ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.4; const a = facePoint(f.left, 0.2, 0.9), b = facePoint(f.left, 0.55, 0.25), c = facePoint(f.left, 0.8, 0.6); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.stroke(); }
    ctx.restore();
    this.hits.push({ eid: e.id, kind: 'lot', id: e.id.slice(4), zone: e.zone, label: `${ASSETS[l.cls].name}${l.cond === 'broken' ? ' (broken)' : ''}${auction ? ' at auction' : ' for sale'}`, polys: [[[x - 18, y - 26], [x + 18, y - 26], [x + 18, y + 4], [x - 18, y + 4]]], lot: l });
    if (this.cam.z > 0.5) this.overlay.push({ k: 'tag', n: 6, wx: x, wy: y - 32, draw: (g, px, py, s) => this.tag(g, px, py, s, auction ? '🔨' : ASSETS[l.cls].icon, money(l.price), auction ? '#ffd36e' : '#46e38e', hov) });
  },

  drawAsset(ctx, e) {
    const [gx, gy] = this.posOf(e), z = zAt(gx, gy), a = e.asset, [x, y0] = P(gx, gy, z), y = y0 - e.drop;
    const sel = this.api.ui.sel.has(a.id), col = classColor(a.cls), hov = this.hover?.eid === e.id, bob = sel && !this.reduced() ? Math.sin(this.vt / 220) * 2 : 0;
    ellipse(ctx, x, y0 + 2, 15, 7, 'rgba(8,10,20,.3)');
    if (sel) { // the chosen crate stands in a pool of gold light with a crisp ring (the glow is a stamped sprite, not a shadow blur)
      const k = 0.5 + 0.5 * Math.sin(this.vt / 250);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; const lit = stampGlow(ctx, '255,211,110', x, y0 + 1, 40 + 4 * k, 0.55, 0.5); ctx.restore();
      ellipse(ctx, x, y0 + 1, 22 + 2 * k, 11 + k, lit ? 'rgba(255,211,110,.16)' : 'rgba(255,211,110,.5)', '#ffd36e', 2);
    }
    ctx.save(); ctx.translate(0, -z - e.drop - bob);
    const wear = clamp(a.wear, 0.4, 1), c = a.cond === 'broken' ? shade(col, 0.65) : mix('#6a6f7c', col, wear);
    const f = box(ctx, gx - 0.36, gy - 0.36, 0.72, 0.72, 17, tone(c), { line: hov ? '#fff' : 'rgba(0,0,0,.3)' });
    if (a.cond === 'broken') { ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.4; const p1 = facePoint(f.left, 0.15, 0.85), p2 = facePoint(f.left, 0.5, 0.3), p3 = facePoint(f.left, 0.85, 0.7); ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.stroke(); if (!this.reduced() && !this.far) { const [sx0, sy0] = P(gx, gy, 18); for (let i = 0; i < 2; i++) { const k = ((this.vt / 900) + i / 2) % 1; ctx.fillStyle = `rgba(200,200,210,${0.4 * (1 - k)})`; ctx.beginPath(); ctx.arc(sx0 + k * 6, sy0 - k * 16, 2 + k * 4, 0, 7); ctx.fill(); } } }
    ctx.restore();
    this.hits.push({ eid: e.id, kind: 'asset', id: a.id, zone: e.zone, label: `${ASSETS[a.cls].name}${a.cond === 'broken' ? ' (broken)' : ''}, in your stock`, polys: [[[x - 16, y - 32 - bob], [x + 16, y - 32 - bob], [x + 16, y + 4], [x - 16, y + 4]]], asset: a });
    if (this.cam.z > 0.6 || sel || hov) this.overlay.push({ k: 'icon', n: 0, wx: x, wy: y - 36 - bob, draw: (g, px, py, s) => this.icon(g, px, py, s, ASSETS[a.cls].icon, sel) });
  },
};
