// The mark of a person. A buyer, a seller, the auctioneer and the repair bench have no picture: the screens draw a flat disc holding the first letter of the name, tinted by the person's style
// (docs/ART_DIRECTION.md 3.6). Pure and without imports: the screens and the world's canvas both read it, and it is not part of the first screen (tests/page-budget.test.mjs LATER).

/** One calm matte tone per style: the four buyer styles, and `steady` for the auctioneer and the repair bench. css/styles.css holds the same tones as --ava-* tokens for the screens; the canvas cannot read a token and
 *  takes them from here. tests/ui-avatar.test.mjs keeps the two equal and holds the letter to 4.5:1 on each. */
export const AVATAR_TONE = Object.freeze({ hard: '#d9785f', friendly: '#78bd93', impulsive: '#e0b45f', analytical: '#7aa3dd', steady: '#a9b6c9' });
/** The letter on the disc: the first letter or digit of the name, after a title or "The" ("Mr. Abernathy, serious collector" is A, "The auctioneer" is A), in capitals; "?" when there is none. */
const TITLE = /^\s*(?:(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+|The\s+)/;
export const initialOf = (name) => (String(name ?? '').replace(TITLE, '').match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase();
/** The letters on a row of discs where the disc is all there is of a name (the instructor's heat map: a column head and its key): the first letter, or, where two names of the row share it, the shortest start of
 *  each that tells them apart ("De" and "Dr", "Ad" and "Al"). A name that is the start of another keeps all its letters. */
export function marksOf(names) {
  const core = names.map((n) => (String(n ?? '').replace(TITLE, '').match(/[\p{L}\p{N}]+/gu) || []).join('').toLowerCase());
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  return core.map((c, i) => {
    if (!c) return '?';
    for (let n = 1; n <= c.length; n++) if (!core.some((o, j) => j !== i && o.slice(0, n) === c.slice(0, n))) return cap(c.slice(0, n));
    return cap(c);
  });
}
/** The disc as markup (css .ava). Decoration: the name is printed beside it, so a screen reader skips it. A letter or a digit needs no escaping; `cls` is ours (a size or a place), `style` is one of the keys above or it is steady.
 *  `mark` is what marksOf gave for it (letters and digits only): two letters or more say so (data-len) and the disc widens to a pill. */
export const avatarHTML = (name, style, cls = '', mark = '') => `<span class="ava${cls ? ' ' + cls : ''}"${mark.length > 1 ? ` data-len="${mark.length}"` : ''} data-style="${Object.hasOwn(AVATAR_TONE, style) ? style : 'steady'}" aria-hidden="true">${mark || initialOf(name)}</span>`;
