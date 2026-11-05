// The marks a stylesheet draws, as custom properties: a pressed switch, a verdict, a tick in a box, a fold's caret are `content` that CSS paints, so CSS needs the glyph as a data URI to use as a mask (a box masked with the shape
// and painted in the text colour). The shapes live in js/art/g-ui.js; this script writes their data URIs into the block of css/styles.css between the two marker comments, and tests/glyph-style.test.mjs holds the block equal to what
// it would write (change a mark, run this, commit both).
//   node scripts/glyph-css.mjs           print the block
//   node scripts/glyph-css.mjs --write   rewrite it in css/styles.css
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), FILE = join(ROOT, 'css/styles.css');
/** The marks CSS draws (ids of js/art/g-ui.js without the "mark-"): --gl-<name>. */
export const CSS_MARKS = ['tick', 'cross', 'caret-right', 'warn', 'info', 'level', 'careful', 'up', 'down', 'partial'];
export const BEGIN = '/* glyph marks: begin (written by scripts/glyph-css.mjs) */', END = '/* glyph marks: end */';

/** The text of the block, markers included. */
export async function block() {
  const { uri } = await import(pathToFileURL(join(ROOT, 'js/art/paint.js')).href);
  await import(pathToFileURL(join(ROOT, 'js/art/g-ui.js')).href);
  const lines = CSS_MARKS.map((n) => `  --gl-${n}: url("${uri('mark-' + n)}");`);
  return `${BEGIN}\n:root {\n${lines.join('\n')}\n}\n${END}`;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const b = await block();
  if (!process.argv.includes('--write')) console.log(b);
  else {
    const css = readFileSync(FILE, 'utf8'), i = css.indexOf(BEGIN), j = css.indexOf(END);
    if (i < 0 || j < i) throw new Error('css/styles.css has no glyph marks block: put the two marker comments where the block goes');
    writeFileSync(FILE, css.slice(0, i) + b + css.slice(j + END.length));
    console.log(`wrote ${CSS_MARKS.length} marks to css/styles.css`);
  }
}
