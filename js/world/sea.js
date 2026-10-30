// The sea. LEGACY drawer: a 1 x 256 strip stretched over the window in screen space (it ignores the camera, which is the fault the new sea replaces).
// Owner: T1 TERRAIN, COAST AND WATER (docs/RENDER_PLAN.md). The V2 sea is a world-space surface (registerLayer('sea', draw, 'world')).
import { mix, h2 } from './iso.js';
import { surface, snap } from './gfx.js';

const SEA_STRIP = 256;                     // samples in the sea's strip: the gradient is smooth, so 256 stretched over the window match a full-size fill to within one level of colour
export const seaMethods = {
  /**
   * The sea. Its colour follows the light (night, the golden hour) and is a gradient from the top of the window to its foot, so it varies in one direction only: the world keeps
   * it as ONE strip of SEA_STRIP samples, 1 px wide, that is repainted in place (never remade) whenever the light moves to a new step, and each frame stretches it over the
   * whole canvas with a single drawImage (measured in a CPU-drawn canvas at 2160 x 1350: 1.2 ms, against 7.3 for filling the gradient and 8.9 for a new full-window layer at
   * every step, which allocated a bitmap of tens of megabytes about every other frame of a dusk). On top of it go the slow wave lines, drawn as one stroke, and a scatter of
   * glints that twinkle on the sun's side of the water by day and the moon's by night. Under reduced motion the waves and glints stand still.
   */
  drawWater(ctx) {
    const { W, H } = this, night = this.night, dusk = this.dusk, calm = this.reduced(), cw = this.cv.width, ch = this.cv.height;
    const nb = Math.round(night * 24), db = Math.round(dusk * 12), key = nb * 100 + db;
    let wg = this.waterGr;
    if (!wg || wg.key !== key) { // the colour follows the light in 24 and 12 steps and is worked out once per step, not once per frame
      const n = nb / 24, d = db / 12;
      wg = this.waterGr = { key, top: mix(mix('#1b3b5c', '#08111f', n * 0.8), '#3b3550', d * 0.35), foot: mix(mix('#235a7a', '#0b1a2c', n * 0.8), '#6a5a6a', d * 0.22) };
    }
    if (this.seaStrip === undefined) { this.seaStrip = surface(1, SEA_STRIP); this.seaKey = -1; } // made once for the life of the world (null: no offscreen surfaces here)
    const strip = this.seaStrip;
    if (strip) {
      if (this.seaKey !== key) { // a new light step: the same strip painted again, 256 pixels
        const g = strip.g, gr = g.createLinearGradient(0, 0, 0, SEA_STRIP); gr.addColorStop(0, wg.top); gr.addColorStop(1, wg.foot);
        g.fillStyle = gr; g.fillRect(0, 0, 1, SEA_STRIP); this.seaKey = key; // opaque, so it covers the step before
      }
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(strip.c, 0, 0, 1, SEA_STRIP, 0, 0, cw, ch); ctx.restore(); // the canvas's own pixels, top to foot
    } else { const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, wg.top); gr.addColorStop(1, wg.foot); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H); } // no offscreen surfaces: as the world always drew it
    ctx.strokeStyle = `rgba(190,230,255,${0.1 + 0.05 * (1 - night)})`; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i < 26; i++) {
      const y = (i / 26) * H + 8, ph = calm ? 0 : this.vt / 1400 + i, x0 = ((i * 137) % W); let prev = -1e9;
      for (let x = -20; x < 90; x += 6) { const px = (x0 + x * 2.2) % (W + 60) - 30, py = y + Math.sin(ph + x * 0.1) * 1.6; if (x === -20 || px < prev) ctx.moveTo(px, py); else ctx.lineTo(px, py); prev = px; } // a line that runs off the right edge starts again at the left: it never streaks across the window
    }
    ctx.stroke();
    // glints: 44 small bright dashes at fixed places, each twinkling on its own clock (a steady dim glint under reduced motion)
    ctx.fillStyle = night > 0.5 ? '#cfe0ff' : '#ffffff';
    for (let i = 0; i < 44; i++) {
      const x = snap(h2(i, 61) * W, this.dpr), y = snap(h2(i, 62) * H, this.dpr), tw = calm ? 0.35 : Math.max(0, Math.sin(this.vt / 820 + i * 2.3)), a = (calm ? 0.18 : 0.06 + 0.42 * tw * tw * tw) * (0.55 + 0.45 * (y / H));
      if (a < 0.03) continue;
      ctx.globalAlpha = a; ctx.fillRect(x, y, 3 + (i % 4) * 2, 1);
    }
    ctx.globalAlpha = 1;
  },
};
