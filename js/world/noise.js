// Value noise on a hashed lattice: the world's one source of smooth variation (patches, mottling, grain, scallops). Pure, deterministic, no Math.random, no allocation per call.
// Owner: T1 TERRAIN, COAST AND WATER (docs/RENDER_PLAN.md). Everything is a function of the position it is asked at, so a texture made from it is anchored to the world, never to the screen.
import { hash } from './iso.js';

const N = 256, MASK = N - 1;
/** The lattice: N x N values in [0, 1), the same on every machine. */
export const LATTICE = (() => { const t = new Float32Array(N * N); for (let i = 0; i < t.length; i++) t[i] = hash(i * 2654435761 + 12345); return t; })();
/** Smooth value noise at (x, y) in lattice units (period 256): smoothstep-interpolated, 0..1. */
export function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = ix & MASK, b = (ix + 1) & MASK, c = (iy & MASK) * N, d = ((iy + 1) & MASK) * N;
  const v00 = LATTICE[c + a], v10 = LATTICE[c + b], v01 = LATTICE[d + a], v11 = LATTICE[d + b];
  return (v00 + (v10 - v00) * fx) + ((v01 + (v11 - v01) * fx) - (v00 + (v10 - v00) * fx)) * fy;
}
/** Linear (no smoothstep) value noise: a third cheaper, for per-pixel grain. */
export function lnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, a = ix & MASK, b = (ix + 1) & MASK, c = (iy & MASK) * N, d = ((iy + 1) & MASK) * N;
  const v00 = LATTICE[c + a], v10 = LATTICE[c + b], v01 = LATTICE[d + a], v11 = LATTICE[d + b], t = v00 + (v10 - v00) * fx;
  return t + ((v01 + (v11 - v01) * fx) - t) * fy;
}
/** Two octaves (1 and 2.1 times the frequency, a third of the weight on the second), 0..1. */
export const fbm = (x, y) => vnoise(x, y) * 0.68 + vnoise(x * 2.13 + 17.3, y * 2.13 + 5.1) * 0.32;
export const smooth = (e0, e1, x) => { const t = (x - e0) / (e1 - e0 || 1e-9); return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); };

/** A well-mixed hash of three integers to [0, 1): the one for anything scattered over the world (tufts, motifs), because the two-argument `h2` of iso.js leaves rows and lines in what it scatters. */
export function hz(a, b, c) { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177); h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; }
