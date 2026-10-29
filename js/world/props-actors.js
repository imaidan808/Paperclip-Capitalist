// Machines, vehicles and cargo: the crane and gantry, ships, junk cars, carts, tanks, silos, stacks, domes and dishes, the windmill, car rows and container stacks.
// Owner: T4 PROPS, NATURE AND CHARACTERS (docs/RENDER_PLAN.md).
import { P, box, quad, quadN, windows, shadow, blob, cyl, ellipse, tone, shade, snowA, sootA } from './iso.js';
import { solid } from './shading.js';
import { tint, body, glow, fp, lite, stroke, strip, smoke, DRAW, layer } from './props-common.js';

Object.assign(DRAW, {
  crane(ctx, p, env) {
    const [x, y] = P(p.gx, p.gy);
    blob(ctx, x, y + 2, 20, 8, 0.3);
    ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x - 6, y - 118); ctx.moveTo(x + 14, y); ctx.lineTo(x + 6, y - 118); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,180,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 15.2, y); ctx.lineTo(x - 7.2, y - 118); ctx.stroke(); // lit edge of the mast
    ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 2; for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x - 14 + i * 1.3, y - i * 20); ctx.lineTo(x + 14 - i * 1.3, y - i * 20 + 8); ctx.stroke(); }
    ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x - 70, y - 118); ctx.lineTo(x + 26, y - 118); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,180,.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 70, y - 120.5); ctx.lineTo(x + 26, y - 120.5); ctx.stroke();
    const trol = x - 40 + Math.sin(env.t / 2600) * 22, hook = 46 + Math.sin(env.t / 1700) * 12;
    ctx.strokeStyle = '#2b3342'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(trol, y - 118); ctx.lineTo(trol, y - 118 + hook); ctx.stroke();
    box(ctx, p.gx - 1.2 + (trol - x + 40) / 64 * 0.2, p.gy - 0.6, 0.5, 0.5, 8, tone(tint('#b0493a', env)), { z: 118 - hook - 8 });
    if (glow(env) > 0.2) ellipse(ctx, x - 70, y - 118, 3, 3, '#ff4d4d');
    return null;
  },
  gantry(ctx, p, env) {
    const [x0, y0] = P(p.gx, p.gy + p.d / 2), [x1, y1] = P(p.gx + p.w, p.gy + p.d / 2), H = p.h, c = tint(p.col, env);
    blob(ctx, (x0 + x1) / 2, (y0 + y1) / 2 + 2, Math.abs(x1 - x0) / 2 + 6, 7, 0.28);
    ctx.strokeStyle = c; ctx.lineWidth = 4; ctx.beginPath(); for (const [x, y] of [[x0, y0], [x1, y1]]) { ctx.moveTo(x - 6, y); ctx.lineTo(x - 3, y - H); ctx.moveTo(x + 6, y); ctx.lineTo(x + 3, y - H); } ctx.stroke();
    ctx.strokeStyle = snowA(0.3); ctx.lineWidth = 1; ctx.beginPath(); for (const [x, y] of [[x0, y0], [x1, y1]]) { ctx.moveTo(x - 7.4, y); ctx.lineTo(x - 4.4, y - H); } ctx.stroke(); // lit edge of each leg
    ctx.strokeStyle = c; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x0, y0 - H); ctx.lineTo(x1, y1 - H); ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = shade(p.col, 0.7); ctx.beginPath(); ctx.moveTo(x0, y0 - H * 0.5); ctx.lineTo(x1, y1 - H * 0.5); ctx.stroke();
    ctx.strokeStyle = snowA(0.32); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, y0 - H - 2.6); ctx.lineTo(x1, y1 - H - 2.6); ctx.stroke(); // the beam's lit top edge
    const f = 0.5 + 0.38 * Math.sin(env.t / 2800), tx = x0 + (x1 - x0) * f, ty = y0 + (y1 - y0) * f - H, hook = 18 + 10 * Math.sin(env.t / 1900 + 1);
    ctx.strokeStyle = '#2b3342'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, ty + hook); ctx.stroke();
    quad(ctx, [[tx - 7, ty + hook], [tx + 7, ty + hook + 3.5], [tx + 7, ty + hook + 10], [tx - 7, ty + hook + 6.5]], tint(['#c0392b', '#2f80ed', '#f2994a'][(p.gx | 0) % 3], env));
    return null;
  },
  ship(ctx, p, env) {
    const bob = env.t ? Math.sin(env.t / 900) * 1.2 : 0; ctx.save(); ctx.translate(0, bob);
    const f = solid(ctx, p.gx, p.gy, p.w, p.d, p.h, body(p.hull, env), { z: -2, mat: 'metal', lite: lite(env) }); strip(ctx, f, 'L', 0, 1, 0.55, 0.78, tint(p.acc, env)); strip(ctx, f, 'L', 0, 1, 0, 0.12, 'rgba(120,30,20,.5)'); // boot-topping at the waterline
    const n = Math.floor(p.w / 1.2); for (let i = 0; i < n - 1; i++) box(ctx, p.gx + 0.3 + i * 1.1, p.gy + 0.35, 0.95, p.d - 0.7, 7, body(['#c0392b', '#2f80ed', '#f2994a', '#27ae60'][i % 4], env), { z: p.h - 2 });
    const c = solid(ctx, p.gx + p.w - 1.2, p.gy + 0.3, 1.0, p.d - 0.6, 12, body('#e8eef6', env), { z: p.h - 2, lite: lite(env) }); windows(ctx, c.left, 2, 1, '#27304a', glow(env), 0.15);
    ctx.restore(); return null;
  },
  junkcar(ctx, p, env) {
    shadow(ctx, p.gx, p.gy, p.w, p.d, 22);
    solid(ctx, p.gx, p.gy, p.w, p.d, 9, body(p.color, env), { z: 4, mat: 'metal', lite: lite(env) });
    const f = solid(ctx, p.gx + p.w * 0.25, p.gy + 0.15, p.w * 0.5, p.d - 0.3, 9, body(shade(p.color, 0.9), env), { z: 13, lite: lite(env) });
    windows(ctx, f.left, 2, 1, '#27304a', 0, 0.15);
    for (const [wx, wy] of [[0.18, 0], [0.8, 0]]) { const [x, y] = P(p.gx + p.w * wx, p.gy + p.d, 0); ellipse(ctx, x, y - 2, 5, 5, '#111'); ellipse(ctx, x, y - 2, 2.2, 2.2, '#5b6573'); }
    return null;
  },
  cart(ctx, p, env) {
    shadow(ctx, p.gx, p.gy, p.w, p.d, 22, 0.18); solid(ctx, p.gx, p.gy, p.w, p.d, 8, body('#8a5a32', env), { z: 3, mat: 'boards', lite: lite(env) });
    const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2); ctx.fillStyle = '#5a4020'; ctx.fillRect(x - 1, y - 28, 2, 24);
    quad(ctx, [[x - 18, y - 20], [x + 18, y - 20], [x + 8, y - 30], [x - 8, y - 30]], tint(p.awn || '#e8503a', env)); quadN(ctx, x - 18, y - 20, x + 18, y - 20, x + 18, y - 18.4, x - 18, y - 18.4, sootA(0.25));
    for (const dx of [-18, 18]) { ellipse(ctx, x + dx, y + 1, 3.4, 3.4, '#222'); ellipse(ctx, x + dx, y + 1, 1.2, 1.2, '#8a8f98'); }
    return null;
  },
  tank(ctx, p, env) {
    const gx = p.gx + p.w / 2, gy = p.gy + p.d / 2, r = p.w * 0.45, [x, y] = P(gx, gy); blob(ctx, x + 5, y + 2, r * 62, r * 30, 0.28);
    cyl(ctx, gx, gy, r, p.h, body(p.col, env));
    for (const k of [0.3, 0.65]) { ctx.beginPath(); ctx.ellipse(x, y - p.h * k, r * 45, r * 22.6, 0, 0, Math.PI); stroke(ctx, tint(p.acc, env), 2); }
    ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(x - r * 45 * 0.4, y - p.h * 0.9, 1.6, p.h * 0.8); // ladder rail catches the sun
    return null;
  },
  silo(ctx, p, env) {
    const cx = p.gx + p.w / 2, cy = p.gy + p.d / 2, r = p.w * 0.42, [bx, by] = P(cx, cy); blob(ctx, bx + 5, by + 2, r * 62, r * 30, 0.28);
    cyl(ctx, cx, cy, r, p.h, body(p.col, env));
    const [x, y] = P(cx, cy, p.h), cap = tint('#9aa0a8', env);
    ctx.fillStyle = cap; ctx.beginPath(); ctx.ellipse(x, y, r * 45, r * 22, 0, Math.PI, 0); ctx.fill(); quad(ctx, [[x - r * 45, y], [x, y - 18], [x + r * 45, y]], cap);
    quadN(ctx, x - r * 45, y, x, y, x, y - 18, x - r * 45, y, snowA(0.18));
    ctx.beginPath(); for (const k of [0.25, 0.5, 0.75]) { ctx.moveTo(x + r * 45, y + p.h * k); ctx.ellipse(x, y + p.h * k, r * 45, r * 22.6, 0, 0, Math.PI); } stroke(ctx, sootA(0.1), 1); // ribbing
    return null;
  },
  stack(ctx, p, env) {
    const [x, y] = P(p.gx + 0.45, p.gy + 0.45, p.h), [bx, by] = P(p.gx + 0.45, p.gy + 0.45); blob(ctx, bx + 5, by + 2, 18, 7, 0.28);
    cyl(ctx, p.gx + 0.45, p.gy + 0.45, 0.32, p.h, body(p.col, env));
    for (const k of [0.6, 0.8]) { ctx.fillStyle = tint(p.acc, env); ctx.fillRect(x - 11, y + p.h * (1 - k) - 4, 22, 5); }
    ellipse(ctx, x, y, 10, 4.5, '#2a2e36');
    if (!env.far) smoke(ctx, x, y, env.t, 5, '200,205,215');
    return null;
  },
  dome(ctx, p, env) {
    const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2), r = p.w * 30;
    blob(ctx, x + 4, y + 3, r + 6, r * 0.5 + 3, 0.26); ellipse(ctx, x, y, r, r * 0.5, tint('#1c2a38', env));
    ctx.save(); ctx.globalAlpha = 0.65; ctx.fillStyle = tint('#3a7a9a', env); ctx.beginPath(); ctx.ellipse(x, y, r, p.h, 0, Math.PI, 0); ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.ellipse(x - r * 0.28, y - p.h * 0.55, r * 0.3, p.h * 0.3, -0.5, 0, 7); ctx.fillStyle = snowA(0.12); ctx.fill(); // sky reflected in the glass
    ctx.strokeStyle = tint(p.acc, env); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(x, y, r, p.h, 0, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.ellipse(x, y, r * 0.5, p.h, 0, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.stroke();
    return null;
  },
  dish(ctx, p, env) {
    const [x, y] = P(p.gx + 0.4, p.gy + 0.4); blob(ctx, x + 2, y + 1, 8, 3.2, 0.28); ctx.fillStyle = '#6a707c'; ctx.fillRect(x - 2, y - p.h, 4, p.h); ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(x - 2, y - p.h, 1.2, p.h);
    ctx.save(); ctx.translate(x, y - p.h); ctx.rotate(-0.5 + (env.t ? Math.sin(env.t / 4000) * 0.15 : 0)); ellipse(ctx, 0, 0, 13, 7, tint(p.col, env), '#8a94a4', 1.2); ellipse(ctx, -2, -1, 8, 3.8, snowA(0.14)); ctx.strokeStyle = tint(p.acc, env); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -12); ctx.stroke(); ellipse(ctx, 0, -12, 2, 2, tint(p.acc, env)); ctx.restore();
    return null;
  },
  windmill(ctx, p, env) {
    const cx = p.gx + p.w / 2, cy = p.gy + p.d / 2, [bx, by] = P(cx, cy), [tx, ty] = P(cx, cy, p.h), c = body(p.col, env);
    blob(ctx, bx + 5, by + 2, 18, 7, 0.28);
    quad(ctx, [[bx - 12, by], [bx + 12, by], [tx + 5, ty], [tx - 5, ty]], c.l); quad(ctx, [[bx + 12, by], [bx + 4, by - 4], [tx + 5, ty], [tx + 1, ty]], c.r);
    quadN(ctx, bx - 12, by, bx - 10, by, tx - 3.6, ty, tx - 5, ty, snowA(0.22));
    const a0 = env.t ? env.t / 1600 : 0.3; ctx.strokeStyle = tint('#f2ead8', env); ctx.lineWidth = 3.2; ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = a0 + (i * Math.PI) / 2; ctx.moveTo(tx, ty); ctx.lineTo(tx + Math.cos(a) * 26, ty + Math.sin(a) * 26 * 0.95); } ctx.stroke(); ellipse(ctx, tx, ty, 3, 3, '#6a707c');
    return null;
  },
});

// ---------------------------------------------------------------- layered: car rows and container stacks
layer('autos', {
  night: false,
  body(ctx, p, env) {
    const n = p.n, cw = p.w / n, cols = ['#c0392b', '#2f80ed', '#f2c94c', '#e8eef6', '#27ae60', '#5b6573'];
    for (let i = 0; i < n; i++) {
      const x = p.gx + i * cw + 0.06, c = cols[(i * 5 + (p.seed | 0)) % cols.length], ww = cw - 0.12;
      blob(ctx, ...P(x + ww / 2, p.gy + p.d), ww * 22, 4, 0.22);
      const b = solid(ctx, x, p.gy + 0.1, ww, p.d - 0.2, 5, body(c, env), { z: 2, mat: 'metal', lite: lite(env) });
      const f = solid(ctx, x + ww * 0.22, p.gy + 0.15, ww * 0.52, p.d - 0.3, 4, body(shade(c, 0.85), env), { z: 7, lite: true }); windows(ctx, f.left, 1, 1, '#27304a', 0, 0.18, undefined, 0, { fine: false });
      ctx.beginPath(); const w0 = fp(b.left, 0.18, 0.1), w1 = fp(b.left, 0.82, 0.1); ctx.moveTo(w0[0], w0[1]); ctx.lineTo(w1[0], w1[1]); stroke(ctx, 'rgba(0,0,0,.35)', 1.6);
    }
    return null;
  },
});
layer('containers', {
  night: false,
  body(ctx, p, env) {
    const cols = ['#c0392b', '#2f80ed', '#f2994a', '#27ae60', '#8e44ad', '#16a085'], cw = p.w / p.nx, fine = !env.far;
    for (let k = 0; k < p.stack; k++) for (let i = 0; i < p.nx; i++) {
      const c = cols[(i * 3 + k * 2 + (p.seed | 0)) % cols.length], f = box(ctx, p.gx + i * cw + 0.03, p.gy + 0.04, cw - 0.06, p.d - 0.08, 9, body(c, env), { z: k * 9.4 });
      if (fine) {
        ctx.beginPath(); for (let r = 1; r < 5; r++) { const a = fp(f.left, r / 5, 0.1), b = fp(f.left, r / 5, 0.9); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } stroke(ctx, 'rgba(0,0,0,.22)', 1);
        const t = f.top; ctx.beginPath(); ctx.moveTo(t[3][0], t[3][1] + 0.5); ctx.lineTo(t[2][0], t[2][1] + 0.5); stroke(ctx, snowA(0.3), 1); // lit top edge
        strip(ctx, f, 'L', 0, 1, 0, 0.1, sootA(0.18)); // dark bottom rail
      }
    }
    return null;
  },
});
