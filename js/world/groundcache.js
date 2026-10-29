// The ground cache: once the camera has stood still for a frame the ground is drawn into an offscreen copy and every frame after that is one drawImage.
// Owner: T5 RASTER QUALITY (docs/RENDER_PLAN.md). The CONTENT of the copy is the ground layers (T1); how it is kept, keyed, supersampled and invalidated is this file.
import { LAYOUT } from './layout.js';
import { surface } from './gfx.js';
import { groundKey } from './stack.js';
export { CHUNK_PX, chunkWorld, chunkBytes, chunksTouched, groundBytes, chunksFor } from './chunks.js'; // the chunk cache's arithmetic (tests/world-ledger.test.mjs holds the memory ledger to it)

export const groundCacheMethods = {
  /**
   * The ground (terrain, roads, bridges, decals). The ground only changes when the camera moves, a district opens or the window changes size, so
   * once the camera has stood still for a frame it is drawn into an offscreen copy and every frame after that is one drawImage. What animates on it
   * (water, pulses) is drawn live on top. While the camera moves, or a district is opening, it is drawn directly, as it always was.
   */
  groundPass(ctx, view) {
    const { W, H, dpr } = this, cam = this.cam, k = this.gcKey;
    let cached = false;
    if (this.cacheOK() && !this.revealing()) {
      const gk = groundKey(this), same = k[0] === cam.x && k[1] === cam.y && k[2] === cam.z && k[3] === W && k[4] === H && k[5] === dpr && k[6] === this.unlockHash && k[7] === gk;
      if (same) this.gcSeen++; else { k[0] = cam.x; k[1] = cam.y; k[2] = cam.z; k[3] = W; k[4] = H; k[5] = dpr; k[6] = this.unlockHash; k[7] = gk; this.gcSeen = 0; this.gcValid = false; }
      if (this.gcSeen >= 1) {
        if (!this.gc) { this.gc = surface(this.cv.width, this.cv.height); this.gcValid = false; }
        if (this.gc) {
          if (!this.gcValid) {
            const g = this.gc.g; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.gc.c.width, this.gc.c.height);
            this.toWorld(g);
            this.drawGround(g, view, 1); this.gcValid = true;
          }
          // stamp only the part of the copy where the island is (its bounds on screen): the sea around it is empty
          const B = LAYOUT.bounds, z = cam.z, c = this.gc.c, m = 90 * z;
          const bx0 = Math.max(0, Math.floor(((B.x0 - cam.x) * z + W / 2 - m) * dpr)), by0 = Math.max(0, Math.floor(((B.y0 - cam.y) * z + H / 2 - m) * dpr));
          const bx1 = Math.min(c.width, Math.ceil(((B.x1 - cam.x) * z + W / 2 + m) * dpr)), by1 = Math.min(c.height, Math.ceil(((B.y1 - cam.y) * z + H / 2 + m) * dpr));
          if (bx1 > bx0 && by1 > by0) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(c, bx0, by0, bx1 - bx0, by1 - by0, bx0, by0, bx1 - bx0, by1 - by0); ctx.restore(); }
          this.drawGround(ctx, view, 2); cached = true;
        }
      }
    } else { this.gcSeen = 0; this.gcValid = false; k[6] = -1; }
    if (!cached) this.drawGround(ctx, view, 0);
  },

  cacheOK() { return typeof OffscreenCanvas === 'function' && this.cv.width > 0; },
};
