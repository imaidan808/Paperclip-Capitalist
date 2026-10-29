// The screen-space passes of the air: the grade (tint, light pools, ambient), weather (rain, a trend surge's confetti and wash, a tariff's red edge), floating dust and the particles.
// Owner: T2 ATMOSPHERE (docs/RENDER_PLAN.md). Each is a layer of stack.js ('grade', 'weather', 'field', 'particles').

import './grade.js'; // registers the V2 grade layer
import { registerLayer } from './stack.js';
import { paintWeather, paintField, paintParticles, paintSmokeQueue } from './ambient.js';

const CONFETTI = ['#ff3da8', '#7be3ff', '#ffd36e'];
export const atmosMethods = {
  /** The grade over the finished world (lighting.js): the tint for the hour and weather, the light pools the props and lamps pushed, then the air and the vignette. */
  drawGrade(ctx) {
    this.light.tint(ctx, this);
    if (this.night >= 0.04 || this.revealing()) this.light.lights(ctx, this, this.lite ? 40 : 160);
    this.light.ambient(ctx, this);
  },

  /** Weather over the grade: rain in three depth layers in a credit crunch (its grey is part of the grade), a pink wash and confetti in a trend surge, a red edge under a tariff. */
  drawWeather(ctx) {
    const { W, H } = this, e = this.env;
    if (e.crunch && this.rainOn) this.fx.rain(ctx, this);
    if (e.surge && !this.reduced()) { const k = this.vt / 1000; ctx.globalAlpha = 0.55; for (let i = 0; i < 26; i++) { const x = (i * 97 + Math.sin(k + i) * 24) % W, y = ((k * 40 + i * 53) % (H + 20)) - 10; ctx.fillStyle = CONFETTI[i % 3]; ctx.fillRect(x, y, 5, 5); } ctx.globalAlpha = 1; }
    if (e.surge) { ctx.fillStyle = 'rgba(255,61,168,.07)'; ctx.fillRect(0, 0, W, H); }
    if (e.tariff) { ctx.fillStyle = 'rgba(255,80,60,.05)'; ctx.fillRect(0, 0, W, H); }
  },

  /** Dust by day and fireflies by night, in depth layers that slide past one another when the camera moves (fx.js). */
  drawField(ctx) { if (this.mode !== 'map' && this.cam.z > 0.7) this.fx.field(ctx, this); }, // not on the map or the zoomed-out island, where a few motes would read as stray lights

  /** Coins, sparks, dust puffs, rings and text pops (fx.js), over the labels. */
  drawParticles(ctx) { this.fx.draw(ctx, this); },
};

// ---------------------------------------------------------------- V2 (flagged `weather:v2`, `field:v2`, `particles:v2`; ambient.js paints them)
registerLayer('weather', (ctx, view, env, w) => paintWeather(ctx, w), 'screen');
registerLayer('field', (ctx, view, env, w) => { paintField(ctx, w); paintSmokeQueue(ctx, w); }, 'screen');
registerLayer('particles', (ctx, view, env, w) => paintParticles(ctx, w), 'screen');
