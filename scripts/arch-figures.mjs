// The figures docs/ARCHITECTURE.md quotes about the staged site (requests, modules, sizes, the title screen's share), measured on the tree as it stands.
//   node scripts/arch-figures.mjs            print what the tree measures and what the document says
//   node scripts/arch-figures.mjs --write    rewrite the document's three lines to the measured figures (the orchestrator does this in the merge commit)
// Why it exists: the art tracks add modules to js/world/ and every new module moves these figures. A track does NOT edit docs/ARCHITECTURE.md (it is the orchestrator's: docs/RENDER_PLAN.md rule 11); the F2 test
// tolerates the growth of js/world/ on a track branch and is exact when the environment says PC_STRICT_DOCS=1, which the orchestrator runs after this script at every merge.
import { readFileSync, writeFileSync } from 'node:fs';
import { measured } from '../tests/helpers/staged-size.mjs';

const path = new URL('../docs/ARCHITECTURE.md', import.meta.url), md = readFileSync(path, 'utf8'), m = measured(), kb = (n) => Math.round(n / 1024).toLocaleString('en-US'), n0 = (n) => n.toLocaleString('en-US');
const requests = `| Requests | ${m.requests}: the page, 12 stylesheets, ${m.modules} modules; none fails, none goes to another host |`;
const transferred = `| Transferred | about ${kb(m.total)} KB gzipped (${kb(m.js[0])} KB of JavaScript and ${kb(m.css[0])} KB of CSS before gzip`;
const split = `needs ${m.title.n} modules, ${kb(m.title.raw)} KB of JavaScript (${kb(m.title.gz)} KB gzipped); the other ${m.rest.n}, ${kb(m.rest.raw)} KB (${kb(m.rest.gz)} KB gzipped`;
console.log(JSON.stringify({ requests: m.requests, modules: m.modules, worldModules: m.world, totalKB: +(m.total / 1024).toFixed(1), jsKB: +(m.js[0] / 1024).toFixed(1), cssKB: +(m.css[0] / 1024).toFixed(1), title: { n: m.title.n, rawKB: +(m.title.raw / 1024).toFixed(1), gzKB: +(m.title.gz / 1024).toFixed(1) }, rest: { n: m.rest.n, rawKB: +(m.rest.raw / 1024).toFixed(1), gzKB: +(m.rest.gz / 1024).toFixed(1) } }, null, 1));
if (process.argv.includes('--write')) {
  let out = md;
  out = out.replace(/\| Requests \| \d+: the page, 12 stylesheets, \d+ modules; none fails, none goes to another host \|/, requests);
  out = out.replace(/\| Transferred \| about [\d,]+ KB gzipped \([\d,]+ KB of JavaScript and [\d,]+ KB of CSS before gzip/, transferred);
  out = out.replace(/needs \d+ modules, [\d,]+ KB of JavaScript \([\d,]+ KB gzipped\); the other \d+, [\d,]+ KB \([\d,]+ KB gzipped/, split);
  if (out === md) console.log('the document already says this'); else { writeFileSync(path, out); console.log('docs/ARCHITECTURE.md rewritten: ' + [requests, transferred, split].join('\n')); }
}
void n0;
