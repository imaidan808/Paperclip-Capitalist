// node assets/src/render.mjs [cdp-port]
// Renders the two pictures of assets/ from the HTML scenes beside this file, in headless Chrome through scripts/cdp.mjs:
//   share.html -> ../share.png            1200 x 630, the picture a link shows when it is shared (Open Graph and Twitter cards)
//   icon.html  -> ../apple-touch-icon.png 180 x 180, the icon a phone puts on its home screen
// The scenes are static (no script, no request); edit them and run this again. assets/src/ is not published: scripts/stage.mjs leaves it out.
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch, open } from '../../scripts/cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCENES = [{ from: 'share.html', to: '../share.png', w: 1200, h: 630 }, { from: 'icon.html', to: '../apple-touch-icon.png', w: 180, h: 180 }];
const b = await launch(+process.argv[2] || 9333);
try {
  for (const s of SCENES) {
    const p = await open(b, pathToFileURL(join(here, s.from)).href, { w: s.w, h: s.h, dsf: 1 });
    await p.sleep(400);
    await p.shot(join(here, s.to));
    if (p.logs.length) console.error(s.from + ': ' + p.logs.join('; '));
    await p.close();
    console.log(`${s.from} -> ${s.to} (${s.w} x ${s.h})`);
  }
} finally { b.close(); }
