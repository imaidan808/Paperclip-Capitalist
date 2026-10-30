export const meta = {
  name: 'art-judge',
  description: 'Independent judges score before/after pictures of the 2.5D world, area by area, on change, quality and edges',
  phases: [
    { title: 'Judge', detail: 'three judges per area with distinct lenses, each with the pictures and crop tools' },
    { title: 'Collate', detail: 'one agent turns the scores into the list of what must be repaired, by track' },
  ],
}

// args: { before, after, ab, round, areas: { areaKey: { title, shots: [names], focus } }, prior: [issues fixed last round] }
const BEFORE = args.before, AFTER = args.after, AB = args.ab, ROUND = args.round || 1

const BRIEF = `
You are an independent ART JUDGE for a browser game, "Paperclip Capitalist": a 90-day trading simulation shown as a 2.5D isometric world drawn with Canvas 2D (no art files: everything is code). The author wants a bright, cozy TOY DIORAMA look, in the spirit of Untitled Goose Game and Egg Inc.: chunky readable shapes, warm saturated but harmonious colour, soft light and soft shadows, a sense of tiny handmade miniature, charm and life. NOT a flat vector ad, NOT a grey-blue engineering diagram. The author said an earlier polish pass was "virtually nonexistent", so the change must be UNMISTAKABLE at normal viewing size (the whole picture on a laptop screen, not zoomed in).
You judge pictures only: you have not seen the code and you do not need to. The pictures are PNGs made by a fixed rig (same seed, same camera, same clock). BEFORE is the old build (commit adcd991); AFTER is the current build. The files are in ${BEFORE} (before) and ${AFTER} (after), named NAME.png; side-by-side pairs, each with a label bar, are in ${AB}/ab-NAME.png. Use the Read tool to LOOK at an image (it shows you the picture). Look at the AFTER images first as a person would, then compare with BEFORE.
You may crop and magnify to inspect edges: python3 with PIL (from PIL import Image) or ImageMagick (convert in.png -crop WxH+X+Y +repage -filter point -resize 300% out.png); write crops under /tmp/artjudge-<area>/ and Read them. Do this: edges, seams, aliasing and glitches only show under magnification (look at coastlines, building bases, roads, tile joins, shadows, cloud edges, text labels, character feet, sprite edges, water patterns, the far edge of the picture).
SCORE the AFTER pictures 0 to 10 on three axes, strictly (8 means "I would ship it as it is", 10 is rare; if you see a glitch you cannot unsee, edges are at most 6):
  change   How unmistakable is the improvement over BEFORE at normal viewing size? (0 same or worse, 5 a careful person notices, 8 anyone notices at once, 10 a different, better game)
  quality  Does it read as a polished, cohesive, charming toy diorama: depth, lighting, colour harmony, silhouette, material, scale consistency, life? Is anything still flat, grey, muddy, empty, repetitive, or flat-vector?
  edges    Technical cleanliness: seams between tiles or chunks, shimmering or stair-stepped edges, aliasing, halos, clipped or floating objects, wrong overlaps (z-order), blurry or mismatched sprite resolution, banding, popping artifacts, black or unpainted areas, text that is cut or illegible, anything that looks like a bug.
Then list ISSUES, most severe first. Each issue: the picture (NAME), where in it (x, y, w, h as fractions 0..1 of the picture), what is wrong in plain words, severity (blocker: the picture looks broken or the change is not visible; major: a person would call it ugly or buggy; minor: polish), which part of the game's art it belongs to (track: terrain-coast-sea | atmosphere-clouds-grade | buildings | props-nature-characters | raster-edges | other) and what would fix it (art terms). Do not list praise as issues. Be concrete: "the beach ends in a hard 1px dark line along the south coast at (0.3,0.7,0.2,0.05)" is useful; "could be better" is not.
Round ${ROUND}${args.prior && args.prior.length ? '. These were repaired since the last round: ' + JSON.stringify(args.prior) + '. Check that they are really fixed, and look for what the repairs broke or still missed.' : '.'}
Game readability matters too: a player must still be able to tell where buyers, lots, crates, buildings and plots are, read district name tags, and see which thing is under the pointer.`

const LENS = {
  direction: 'YOUR LENS: art direction and first impression. Is it a toy diorama, with charm? Does it have a clear light direction, soft shadows, a warm sky and sea, a coherent palette, silhouettes that read at a glance? Is the improvement over BEFORE unmistakable? Judge composition and mood as a creative director would.',
  edges: 'YOUR LENS: technical edges and glitches. You are the person who finds the seam. Magnify everything: tile joins, chunk boundaries (the ground is baked in chunks: look for lines or tone steps every few hundred pixels), coast and shoreline, water pattern repeats and bands, shadows, sprite edges and resampling, cloud shapes, the picture borders, labels. Anything that would make an artist wince.',
  play: 'YOUR LENS: the player. Can I read the world as a game? Are buyers, lots, crates, plots and buildings recognizable and distinct from scenery; are labels and name tags legible; is the picture calm enough to play on for an hour yet alive; did anything get WORSE than BEFORE (a regression: lost clarity, lost contrast, lost detail, lost character)?',
}

const ISSUES = {
  type: 'object',
  properties: {
    area: { type: 'string' }, lens: { type: 'string' },
    scores: { type: 'object', properties: { change: { type: 'number' }, quality: { type: 'number' }, edges: { type: 'number' } }, required: ['change', 'quality', 'edges'] },
    perShot: { type: 'array', items: { type: 'object', properties: { shot: { type: 'string' }, change: { type: 'number' }, quality: { type: 'number' }, edges: { type: 'number' }, note: { type: 'string' } }, required: ['shot', 'change', 'quality', 'edges'] } },
    issues: { type: 'array', items: { type: 'object', properties: { shot: { type: 'string' }, region: { type: 'array', items: { type: 'number' } }, severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, track: { type: 'string', enum: ['terrain-coast-sea', 'atmosphere-clouds-grade', 'buildings', 'props-nature-characters', 'raster-edges', 'other'] }, problem: { type: 'string' }, fix: { type: 'string' } }, required: ['shot', 'severity', 'track', 'problem', 'fix'] } },
    verdict: { type: 'string' },
  },
  required: ['area', 'lens', 'scores', 'perShot', 'issues', 'verdict'],
}

phase('Judge')
const jobs = []
for (const [key, a] of Object.entries(args.areas)) for (const [lk, lt] of Object.entries(LENS)) jobs.push({ key, a, lk, lt })
const results = (await parallel(jobs.map((j) => () => agent(`${BRIEF}\n\nAREA: ${j.a.title}. Pictures to judge (names; the files are NAME.png in both folders): ${j.a.shots.join(', ')}. ${j.a.focus || ''}\n${j.lt}`, { label: `judge-${j.key}-${j.lk}`, phase: 'Judge', schema: ISSUES })))).filter(Boolean)

const mid = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null }
const byArea = {}
for (const r of results) (byArea[r.area] ||= []).push(r)
const table = {}
for (const [area, rs] of Object.entries(byArea)) table[area] = { change: mid(rs.map((r) => r.scores.change)), quality: mid(rs.map((r) => r.scores.quality)), edges: Math.min(...rs.map((r) => r.scores.edges)), judges: rs.length, blockers: rs.reduce((n, r) => n + r.issues.filter((i) => i.severity === 'blocker').length, 0), majors: rs.reduce((n, r) => n + r.issues.filter((i) => i.severity === 'major').length, 0) }
log('scores: ' + JSON.stringify(table))

phase('Collate')
const allIssues = results.flatMap((r) => r.issues.map((i) => ({ ...i, area: r.area, lens: r.lens })))
const plan = allIssues.length ? await agent(`Several independent judges listed issues with the game's pictures. Merge the same issue found by more than one judge (same picture and place and cause), keep the highest severity, and return the repair list: grouped by track, each item with a short id, the pictures it shows in, severity, what is wrong, the fix in art terms, and how many judges saw it. Keep everything concrete. Issues (JSON): ${JSON.stringify(allIssues)}`, { label: 'collate', phase: 'Collate', schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, track: { type: 'string' }, shots: { type: 'array', items: { type: 'string' } }, severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, problem: { type: 'string' }, fix: { type: 'string' }, seenBy: { type: 'integer' } }, required: ['id', 'track', 'shots', 'severity', 'problem', 'fix', 'seenBy'] } } }, required: ['items'] } }) : { items: [] }
const below = Object.entries(table).filter(([, t]) => t.change < 8 || t.quality < 8 || t.edges < 8 || t.blockers > 0)
return { round: ROUND, table, below: below.map(([a]) => a), plan: plan ? plan.items : [], perJudge: results.map((r) => ({ area: r.area, lens: r.lens, scores: r.scores, verdict: r.verdict, perShot: r.perShot })) }
