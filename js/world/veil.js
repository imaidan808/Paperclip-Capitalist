// The veil: the world's canvas is held clear (opacity 0) while its first ground is made, and comes in over a quarter of a second when the window's ground is whole. Pure: World.attach and World.frame keep the state.
// Owner: T5 RASTER QUALITY.
//
// Why. The V2 ground is a base painted per pixel into chunks, 20 to 70 ms each on a laptop four times slower than a Mac, one chunk a frame. The first frame is up in 0.75 s there and the ground is whole at 2.5 s: for the seconds
// between, the town stood on bare blue sea with a few rectangles of ground, and the rectangles came in one at a time. Nobody should see a map being made. What is held is the CANVAS, not the loop: the ground is made as fast
// as it ever was, and the first 2.5 s of frames are spent making the exact chunks (a coarse chunk made first would be work thrown away, nobody sees the soft picture). After 2.5 s whatever is still bare is covered coarse
// first (groundcache.js), and the canvas is shown as soon as nothing is bare; at 5 s it is shown whatever the ground looks like: a slow machine is never held for longer than that.
export const VEIL_MS = 2500;      // how long the canvas is held back for the exact ground, counted from the first frame the world draws
export const VEIL_MAX_MS = 5000;  // the longest it is held for any reason
export const VEIL_FADE_MS = 250;  // the fade that brings the canvas in (none under reduced motion)

/**
 * What the veil does `age` ms after the world's first frame, with the ground whole (`whole`: an exact chunk in every cell of the window) or not, and nothing bare (`covered`: a chunk or a stand-in under every piece of the window):
 * 'hold' (the canvas stays clear and the cells are made exact), 'cover' (it stays clear and the bare cells are covered coarse first) or 'show' (it comes in).
 */
export function veilAt(age, whole, covered) {
  if (whole || age >= VEIL_MAX_MS || (age >= VEIL_MS && covered)) return 'show';
  return age < VEIL_MS ? 'hold' : 'cover';
}
