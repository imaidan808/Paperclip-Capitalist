// Things that move: buyers, the player, freight trucks and the traffic on the roads. LEGACY drawers.
// Owner: T4 PROPS, NATURE AND CHARACTERS (docs/RENDER_PLAN.md).
import { BUYERS, ZONES } from '../config.js';
import { P, box, shadow, ellipse, person, tone, shade, clamp, strHash } from './iso.js';
import { LAYOUT, DIST, EDGES, zAt, polyAt, polyInfo } from './layout.js';
import './vehicles.js'; // the V2 drawers of the truck and car layers register themselves too
import './characters.js'; // the V2 drawers of the lead and player layers register themselves (stack.js registerLayer) and are used while those flags are v2

const SHIRTS = ['#c0392b', '#2f80ed', '#27ae60', '#9b51e0', '#f2994a', '#16a085', '#d35400', '#8e44ad', '#2980b9', '#c0762b'];
const HAIR = ['#2b1b10', '#7a3b12', '#c9a26a', '#555555', '#111111'];
export const lookOf = (id) => { const h = strHash(String(id)); return { shirt: SHIRTS[h % SHIRTS.length], hair: HAIR[(h >> 4) % HAIR.length], skin: ['#f1c27d', '#e0ac69', '#c68642', '#8d5524'][(h >> 8) % 4], pants: ['#27324a', '#3b3b3b', '#4a3b2c'][(h >> 12) % 3] }; };
export const CARS = 18;
const CAR_EDGES = EDGES.filter((e) => !e.path && !e.ferry);
export const actorMethods = {
  drawLead(ctx, e) {
    const z = zAt(e.x, e.y), [x, y] = P(e.x, e.y, z), B = BUYERS[e.seg], l = e.lead, calm = this.reduced();
    const hov = this.hover?.eid === e.id;
    if (e.leaving) ctx.globalAlpha = clamp(1 - (this.t - e.leaveAt) / 4200, 0.2, 1);
    if (this.far) { ctx.fillStyle = l?.need ? '#ffd36e' : e.look.shirt; ctx.fillRect(x - 2.5, y - 8, 5, 8); ctx.globalAlpha = 1; }
    else {
      if (l?.need && !e.leaving) { const k = 0.5 + 0.5 * Math.sin(this.vt / 300); ellipse(ctx, x, y + 1, 15 + 3 * k, 7 + 1.5 * k, `rgba(255,211,110,${0.28 + 0.2 * k})`); }
      person(ctx, x, y, hov ? 1.15 : 1, e.look, this.vt, e.moving, e.dir || 1);
      ctx.globalAlpha = 1;
    }
    void calm;
    if (!e.leaving && l) {
      this.hits.push({ eid: e.id, kind: 'lead', id: e.id.slice(5), zone: e.zone, label: `${B.name}${l.need ? ', urgent' : ''}`, circle: [x, y - 16, 20], lead: l });
      if (this.cam.z > 0.5 || hov) this.overlay.push({ k: 'bub', n: 6, wx: x, wy: y - 40, draw: (g, px, py, s) => this.leadBubble(g, px, py, s, B, l, hov) });
    }
  },

  drawPlayer(ctx) {
    const pl = this.player, z = zAt(pl.x, pl.y), [x, y] = P(pl.x, pl.y, z);
    const look = { shirt: '#c0392b', hair: '#222', skin: '#f1c27d', pants: '#27324a' };
    const k = 0.5 + 0.5 * Math.sin(this.vt / 400);
    ellipse(ctx, x, y + 1, 16, 7.5, `rgba(255,211,110,${0.3 + 0.15 * k})`, '#ffd36e', 1.5);
    person(ctx, x, y, 1.3, look, this.vt, pl.moving, pl.dir);
    this.overlay.push({ k: 'chip', lo: 1, n: 3, wx: x, wy: y - 48, draw: (g, px, py, s) => this.chip(g, px, py, 'You', '#ffd36e', s) });
  },

  /** Where a freight truck is now: it leaves its depot door, drives the avenue's right-hand lane and arrives at the other district's door. */
  truckPos(e) {
    const f = e.f, to = f.to, from = e.from;
    if (!e.route || e.route.key !== from + '>' + to) { const pts = LAYOUT.truckRoute(from, to, this.unlocked) || [DIST[from].door, DIST[to].door]; e.route = { key: from + '>' + to, info: polyInfo(pts) }; }
    const g = this.g, hops = Math.abs(to - from), dur = Math.max(2, Math.round(6 * Math.min(2.5, 1 + 0.1 * (hops - 1)) * (1 - (g?.P?.freightSpeed || 0))));
    let p = clamp((this.hourF() - (f.arrive - dur)) / dur, 0, f.checked && f.arrive > this.hourF() ? 0.97 : 1); // held at the border while customs looks
    p = Math.max(e.maxP || 0, p); e.maxP = p;
    const q = polyAt(e.route.info, p * e.route.info.len);
    e.dirY = Math.abs(q.dy) > Math.abs(q.dx); e.hd = Math.sign(e.dirY ? q.dy : q.dx) || 1;
    return [q.x, q.y];
  },

  drawTruck(ctx, e) {
    const [gx, gy] = this.truckPos(e), z = zAt(gx, gy), [x, y] = P(gx, gy, z), alongY = e.dirY, blocked = this.env.tariff, big = this.far ? 1.6 : 1;
    ctx.save(); ctx.translate(0, -z);
    const w = (alongY ? 0.8 : 1.7) * big, d = (alongY ? 1.7 : 0.8) * big;
    shadow(ctx, gx - w / 2, gy - d / 2, w, d, 16, 0.25);
    box(ctx, gx - w / 2, gy - d / 2, w, d, 16, tone('#e8eef6'), { z: 3 });
    const lead = e.hd < 0 ? -0.85 : 0.35;
    const cab = alongY ? [gx - 0.4 * big, gy + lead * big, 0.8 * big, 0.5 * big] : [gx + lead * big, gy - 0.4 * big, 0.5 * big, 0.8 * big];
    box(ctx, cab[0], cab[1], cab[2], cab[3], 12, tone('#2f80ed'), { z: 3 });
    if (!this.far) for (const [ox, oy] of [[-0.25, -0.6], [0.25, 0.6], [-0.25, 0.6], [0.25, -0.6]]) { const [wx, wy] = P(gx + (alongY ? ox : oy), gy + (alongY ? oy : ox), 0); ellipse(ctx, wx, wy - 2, 3.4, 3.4, '#10141c'); }
    ctx.restore();
    if (!this.reduced() && !blocked && !this.far) for (let i = 0; i < 2; i++) { const k = ((this.vt / 500) + i / 2) % 1; ctx.fillStyle = `rgba(210,215,225,${0.3 * (1 - k)})`; ctx.beginPath(); ctx.arc(x + (alongY ? e.hd : -e.hd) * (8 + k * 14), y - 6 - k * 6, 2 + k * 3, 0, 7); ctx.fill(); }
    this.hits.push({ eid: e.id, kind: 'truck', id: e.f.id, zone: 0, label: `Freight run to ${ZONES[e.f.to].short}`, circle: [x, y - 12, 20 * big] });
    this.overlay.push({ k: 'chip', n: 16, wx: x, wy: y - 40, draw: (g, px, py, s) => this.chip(g, px, py, `${e.f.items.length} crate${e.f.items.length > 1 ? 's' : ''} to ${ZONES[e.f.to].short}`, '#ffd36e', s) });
  },

  /** Traffic on the open roads between districts: cars shuttle along them in both lanes and fade in and out at the ends. */
  cars() {
    const out = this.carOut || (this.carOut = []); let n = 0;
    for (let i = 0; i < CARS; i++) {
      const e = CAR_EDGES[(i * 7) % CAR_EDGES.length]; if (this.unlocked && !this.unlocked.has(e.gate)) continue;
      const fwd = i % 2 === 0, u = (i * 0.137 + this.t * (0.00008 + (i % 5) * 0.00001)) % 1, s = fwd ? u * e.len : (1 - u) * e.len, a = polyAt(e, s), k = (fwd ? 0.5 : -0.5);
      const x = a.x - a.dy * k, y = a.y + a.dx * k, c = this.carList[n]; // the records are reused every frame
      c.gx = x; c.gy = y; c.i = i; c.key = x + y + 0.4; c.horiz = Math.abs(a.dx) > Math.abs(a.dy); c.fade = clamp(Math.min(s, e.len - s) / 6, 0, 1); out[n++] = c;
    }
    out.length = n; return out;
  },

  drawCar(ctx, c) {
    const z = zAt(c.gx, c.gy), cols = ['#c0392b', '#2f80ed', '#f2c94c', '#9b51e0', '#27ae60', '#e8eef6'], col = cols[c.i % 6], w = c.horiz ? 1.1 : 0.56, d = c.horiz ? 0.56 : 1.1;
    ctx.save(); ctx.translate(0, -z); ctx.globalAlpha = c.fade;
    box(ctx, c.gx - w / 2, c.gy - d / 2, w, d, 8, tone(col), { z: 2 });
    if (!this.far) box(ctx, c.gx - w * 0.22, c.gy - d * 0.22, w * 0.44, d * 0.44, 7, tone(shade(col, 0.9)), { z: 10 });
    if (this.night > 0.3 && !this.far) { const [x, y] = P(c.gx, c.gy, 6); this.lights.push({ wx: x, wy: y - z, r: 26, c: '255,240,190', a: 0.5 * this.night }); }
    ctx.restore(); ctx.globalAlpha = 1;
  },
};
