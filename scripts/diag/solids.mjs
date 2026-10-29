// THE SOLIDS CONTACT SHEET: a bare roundedBox next to the legacy box, in the colours of the island, at the sizes of its buildings, at a camera zoom you choose. T3's first gate (docs/RENDER_PLAN.md T3):
// the form must read as a chunky toy at the working zoom (0.9 to 1.2) before any building is built on it, so look at this sheet before touching a building.
//   PORT=8781 node server/static.mjs &
//   DIAG_BASE=http://localhost:8781 DIAG_CDP=9781 node scripts/diag/solids.mjs [zoom 0.9] [dsf 2]
// Writes solids-<zoom>.png under DIAG_OUT. Rows: plaster, tile, brick and toy colours. Columns: the legacy box (iso.box with iso.tone), then roundedBox at a crate, a house, a shop and a tower.
import { launch, open } from '../cdp.mjs';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const BASE = process.env.DIAG_BASE || 'http://localhost:8090', CDP = +(process.env.DIAG_CDP || 9333), OUT = process.env.DIAG_OUT || tmpdir() + '/render-diag';
mkdirSync(OUT, { recursive: true });
const zoom = +(process.argv[2] || 0.9), dsf = +(process.argv[3] || 2);
const b = await launch(CDP);
try {
  const p = await open(b, `${BASE}/dev/world-harness.html`, { w: 1300, h: 1500, dsf });
  await p.eval(`(async () => {
    const iso = await import('/js/world/iso.js'), so = await import('/js/world/solids.js'), pal = await import('/js/world/palette.js');
    document.body.innerHTML = ''; document.body.style.cssText = 'margin:0;background:#a4dc66';
    const cv = document.createElement('canvas'); cv.width = 1300 * ${dsf}; cv.height = 1500 * ${dsf}; cv.style.cssText = 'width:1300px;height:1500px;display:block'; document.body.append(cv);
    const g = cv.getContext('2d'); g.fillStyle = '#a4dc66'; g.fillRect(0, 0, cv.width, cv.height);
    const rows = [pal.PLASTER.cream, pal.PLASTER.peach, pal.PLASTER.mint, pal.PLASTER.sky, pal.PLASTER.rose, pal.TILE.terracotta, pal.TILE.teal, pal.BRICK.mid, pal.TOY.red, pal.TOY.blue];
    const sizes = [[1, 1, 12], [1.6, 1.4, 30], [2.7, 2.4, 40], [3.3, 3.3, 96]];
    const colW = 1300 / (sizes.length + 1), rowH = 1500 / rows.length, z = ${zoom};
    rows.forEach((col, i) => {
      for (let k = 0; k <= sizes.length; k++) {
        const [w, d, h] = sizes[Math.max(0, k - 1)], cx = colW * (k + 0.5), cy = rowH * (i + 0.5) + Math.min(h, 60) * z * 0.4;
        g.save(); g.setTransform(${dsf} * z, 0, 0, ${dsf} * z, ${dsf} * cx, ${dsf} * cy);
        const [ox, oy] = iso.P(w / 2, d / 2, 0); g.translate(-ox, -oy);
        if (k === 0) iso.box(g, 0, 0, 2.7, 2.4, 40, iso.tone(col)); else so.roundedBox(g, 0, 0, w, d, h, col);
        g.restore();
      }
    });
  })()`);
  await p.shot(`${OUT}/solids-${zoom}.png`);
  console.log(`${OUT}/solids-${zoom}.png`);
} finally { b.close(); }
process.exit(0);
