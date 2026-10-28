// Crisp labels for the world: name chips, price tags, buyer bubbles, crate icons and the map's district cards.
// Each label is drawn once into a small surface at the device's own pixel density (so text and 1px rules are sharp on a 2x screen) and then
// stamped with drawImage on whole device pixels. A label that did not change costs one blit a frame instead of a measure, a rounded rect and
// two or three fills of text. Presentation only. Where there is no OffscreenCanvas every method answers null and the world draws the label directly.
import { roundRect, luma, mix } from './iso.js';
import { Cache, surface, mono, sans } from './gfx.js';

/** A zoom factor rounded to eighths: sprites are cached per size, so a continuous zoom must not make a new one every frame. */
export const qs = (s) => Math.round(s * 8) / 8;
/** A district's own colour, lifted until it reads on the dark label (some palettes are nearly black): text and rules use this, never the raw colour. */
export const readable = (c) => (c && c[0] === '#' && c.length === 7 && luma(c) < 0.45 ? mix(c, '#ffffff', 0.62) : c);
const PAD = 4;

export class Labels {
  constructor() { this.cache = new Cache(240); this.widths = new Cache(600); this.dpr = 0; this.scratch = null; }

  /** Let go of every sprite and the measuring surface (the screen is leaving); they are made again when a label is next wanted. */
  release() { this.cache.clear(); this.widths.clear(); this.scratch = null; this.dpr = 0; }

  /** Tell the cache the pixel density; a change drops every sprite (they are drawn for one density). */
  setDpr(d) { if (d !== this.dpr) { this.dpr = d; this.cache.clear(); } }

  width(font, text) {
    const k = font + '|' + text; let w = this.widths.get(k);
    if (w === undefined) { if (!this.scratch) this.scratch = surface(2, 2); if (!this.scratch) return text.length * 6.5; this.scratch.g.font = font; w = this.widths.set(k, this.scratch.g.measureText(text).width); }
    return w;
  }

  /** Draw a label of w x h css px (plus padding for its rule and shadow) into a sprite; `paint(g)` draws it with its top-left at (0, 0). */
  make(w, h, paint, pad = PAD) {
    const d = this.dpr || 1, sw = Math.ceil((w + pad * 2) * d), sh = Math.ceil((h + pad * 2) * d), f = surface(sw, sh);
    if (!f) return null;
    f.g.scale(d, d); f.g.translate(pad, pad); f.g.lineJoin = 'round'; paint(f.g);
    return { c: f.c, w: sw / d, h: sh / d, pad, ax: w / 2, ay: h / 2 };
  }
  sprite(key, build) { let s = this.cache.get(key); if (s === undefined) s = this.cache.set(key, build()); return s; }

  /** Stamp a sprite so its anchor lands at (x, y), snapped to the device-pixel grid. */
  blit(ctx, spr, x, y, ax = spr.ax, ay = spr.ay) {
    const d = this.dpr || 1;
    ctx.drawImage(spr.c, Math.round((x - ax - spr.pad) * d) / d, Math.round((y - ay - spr.pad) * d) / d, spr.w, spr.h);
  }

  /** The line width of a label's rule: one css pixel on a 1x screen, one and a half on 2x (always whole device pixels). */
  lw(n = 1) { return (this.dpr || 1) >= 2 ? n * 1.5 : n; }

  // ------------------------------------------------------------------------------------------ the labels
  /** A small rounded name chip centred on its anchor ("You", "+ Hire", "Opens at $500k", a district's tag). */
  chip(text, color, s) {
    color = readable(color);
    return this.sprite(`c|${text}|${color}|${s}|${this.dpr}`, () => {
      const f = mono(700, 11 * s), w = Math.ceil(this.width(f, text) + 14 * s), h = Math.ceil(18 * s), lw = this.lw();
      return this.make(w, h, (g) => {
        roundRect(g, 0.5, 2.5, w, h, 5 * s); g.fillStyle = 'rgba(2,4,10,.4)'; g.fill();
        roundRect(g, lw / 2, lw / 2, w - lw, h - lw, 5 * s); g.fillStyle = 'rgba(16,20,28,.93)'; g.fill(); g.strokeStyle = color; g.lineWidth = lw; g.stroke();
        g.font = f; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 0.5);
      });
    });
  }

  /** A round crate icon (an emoji), gold when selected. */
  icon(icon, sel, s) {
    return this.sprite(`i|${icon}|${sel ? 1 : 0}|${s}|${this.dpr}`, () => {
      const r = Math.round(12 * s), lw = this.lw(), d = r * 2;
      return this.make(d, d, (g) => {
        g.beginPath(); g.arc(r + 0.5, r + 2.5, r, 0, 7); g.fillStyle = 'rgba(2,4,10,.4)'; g.fill();
        g.beginPath(); g.arc(r, r, r - lw / 2, 0, 7); g.fillStyle = sel ? '#ffd36e' : 'rgba(16,20,28,.93)'; g.fill(); g.strokeStyle = sel ? '#ffffff' : '#5b6b85'; g.lineWidth = lw; g.stroke();
        g.font = sans(14 * s); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(icon, r, r + 1);
      });
    });
  }

  /** A for-sale price tag: a small icon on the left, the price in the tag's colour. */
  tag(icon, text, color, hov, s) {
    color = readable(color);
    return this.sprite(`t|${icon}|${text}|${color}|${hov ? 1 : 0}|${s}|${this.dpr}`, () => {
      const f = mono(800, 11 * s), w = Math.ceil(this.width(f, text) + 30 * s), h = Math.ceil(20 * s), lw = this.lw();
      return this.make(w, h, (g) => {
        roundRect(g, 0.5, 2.5, w, h, 6 * s); g.fillStyle = 'rgba(2,4,10,.4)'; g.fill();
        roundRect(g, lw / 2, lw / 2, w - lw, h - lw, 6 * s); g.fillStyle = 'rgba(16,20,28,.94)'; g.fill(); g.strokeStyle = hov ? '#ffffff' : color; g.lineWidth = lw; g.stroke();
        g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = sans(13 * s); g.fillStyle = '#fff'; g.fillText(icon, 5 * s, h / 2 + 1);
        g.font = f; g.fillStyle = color; g.fillText(text, 22 * s, h / 2 + 1);
      });
    });
  }

  /** A buyer's speech bubble: the segment's icon, the budget, a tail pointing down at the buyer, and an urgent badge. The anchor is where the tail begins, on the bubble's lower edge. */
  bubble(icon, text, urgent, hov, s) {
    return this.sprite(`b|${icon}|${text}|${urgent ? 1 : 0}|${hov ? 1 : 0}|${s}|${this.dpr}`, () => {
      const f = mono(800, 11 * s), w = Math.ceil(this.width(f, text) + 32 * s), h = Math.ceil(22 * s), lw = this.lw(urgent ? 1.33 : 1), tail = 6 * s;
      const sp = this.make(w, h + tail, (g) => {
        roundRect(g, 0.5, 2.5, w, h, 7 * s); g.fillStyle = 'rgba(2,4,10,.4)'; g.fill();
        roundRect(g, lw / 2, lw / 2, w - lw, h - lw, 7 * s); g.fillStyle = 'rgba(16,20,28,.95)'; g.fill(); g.strokeStyle = urgent ? '#ffd36e' : hov ? '#ffffff' : '#5b6b85'; g.lineWidth = lw; g.stroke();
        g.beginPath(); g.moveTo(w / 2 - 4 * s, h - lw / 2); g.lineTo(w / 2 + 4 * s, h - lw / 2); g.lineTo(w / 2, h + tail); g.closePath(); g.fill();
        g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = sans(14 * s); g.fillStyle = '#fff'; g.fillText(icon, 5 * s, h / 2 + 1);
        g.font = f; g.fillStyle = urgent ? '#ffd36e' : '#e8eef6'; g.fillText(text, 23 * s, h / 2 + 1);
        if (urgent) { g.fillStyle = '#ffd36e'; g.beginPath(); g.arc(w - 2, 2, 7 * s, 0, 7); g.fill(); g.fillStyle = '#1a1303'; g.font = mono(900, 11 * s); g.textAlign = 'center'; g.fillText('!', w - 2, 3); }
      }, PAD + 6);
      if (sp) { sp.ax = w / 2; sp.ay = h; }
      return sp;
    });
  }

  /**
   * A district's pipeline pips for the whole-island view, where a building's own bar is too small to read: one short bar per pipeline on a small dark plate,
   * amber while it runs (`a`), red when it is starved (`r`), grey when it is paused or under audit (`o`). The anchor is the plate's centre.
   */
  pips(a, o, r) {
    a = Math.min(a, 6); r = Math.min(r, 6 - a); o = Math.min(o, 6 - a - r);
    return this.sprite(`p|${a}|${r}|${o}|${this.dpr}`, () => {
      const n = a + r + o, sw = 8, sh = 3, gap = 2, w = n * sw + (n - 1) * gap + 6, h = sh + 6;
      return this.make(w, h, (g) => {
        roundRect(g, 0, 0, w, h, 3); g.fillStyle = 'rgba(16,20,28,.92)'; g.fill();
        let x = 3; for (const [c, k] of [['#ffc247', a], ['#ff7d75', r], ['#7a7f88', o]]) for (let i = 0; i < k; i++) { g.fillStyle = c; g.fillRect(x, 3, sw, sh); x += sw + gap; }
      }, 2);
    });
  }

  /** One district's card on the map: icon, "n  Name", and a second line (buyers and crates, or what opens it). Returns the sprite and its card size. */
  card(D, l1, l2, compact, open, cur, hov) {
    const pal = readable(D.pal[1]);
    return this.sprite(`m|${D.id ?? D.short}|${l1}|${l2}|${compact ? 1 : 0}|${open ? 1 : 0}|${cur ? 1 : 0}|${hov ? 1 : 0}|${this.dpr}`, () => {
      const f1 = mono(800, 12), f2 = mono(600, 10), w = Math.ceil(Math.max(this.width(f1, l1), compact ? 0 : this.width(f2, l2)) + 34), h = compact ? 24 : 38, lw = this.lw(cur || hov ? 2 : 1.1);
      const sp = this.make(w, h, (g) => {
        g.globalAlpha = open ? 1 : 0.88;
        roundRect(g, 0.5, 2.5, w, h, 7); g.fillStyle = 'rgba(2,4,10,.4)'; g.fill();
        roundRect(g, lw / 2, lw / 2, w - lw, h - lw, 7); g.fillStyle = 'rgba(16,20,28,.95)'; g.fill(); g.strokeStyle = cur || hov ? '#ffd36e' : open ? pal : '#5b6b85'; g.lineWidth = lw; g.stroke();
        g.fillStyle = pal; g.fillRect(1, 6, 4, h - 12);
        g.font = sans(16); g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(D.icon, 10, h / 2 + 1);
        g.font = f1; g.fillStyle = open ? '#ffd36e' : '#a3b3c9'; g.fillText(l1, 30, compact ? h / 2 + 1 : 13);
        if (!compact) { g.font = f2; g.fillStyle = open ? '#e8eef6' : '#a3b3c9'; g.fillText(l2, 30, 27); }
      });
      if (sp) { sp.cw = w; sp.ch = h; }
      return sp;
    });
  }
}
