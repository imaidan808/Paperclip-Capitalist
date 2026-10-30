// What a frame's blits reached, read back from a recording context (tests/helpers/recctx.mjs) with the clips in force: the picture is judged, not the bookkeeping.
/**
 * What a frame's blits reached: a grid of sample points over the canvas, each covered or not. The log is replayed: `save` and `restore` keep the clips, `beginPath` and `rect` build a path, `clip` makes the path a clip
 * (even-odd when asked), and a `drawImage` covers the sample points inside its destination that every clip in force contains. `skip(x, y)` leaves out the blits at those corners (a chunk that is still fading in covers
 * nothing: the picture under it must).
 */
export function reach(main, cw, ch, { step = 16, skip = () => false, only = () => true } = {}) {
  const nx = Math.ceil(cw / step), ny = Math.ceil(ch / step), got = new Uint8Array(nx * ny); let clips = [], path = []; const stack = [];
  const inside = (cl, x, y) => { let n = 0; for (const [rx, ry, rw, rh] of cl.rects) if (x >= rx && x < rx + rw && y >= ry && y < ry + rh) n++; return cl.eo ? n % 2 === 1 : n > 0; };
  for (const [name, ...a] of main.log.calls) {
    if (name === 'save') stack.push(clips.slice()); else if (name === 'restore') clips = stack.pop() || [];
    else if (name === 'beginPath') path = []; else if (name === 'rect') path.push(a); else if (name === 'clip') clips = [...clips, { rects: path.slice(), eo: a[0] === 'evenodd' }];
    else if (name === 'drawImage') {
      const [img, x, y, w, h] = a; const dw = a.length >= 5 ? w : img.width, dh = a.length >= 5 ? h : img.height; if (skip(x, y, a.length) || !only(img)) continue;
      for (let j = Math.max(0, Math.floor(y / step)); j < ny && j * step < y + dh; j++) for (let i = Math.max(0, Math.floor(x / step)); i < nx && i * step < x + dw; i++) {
        const px = i * step + step / 2, py = j * step + step / 2; if (px < x || px >= x + dw || py < y || py >= y + dh) continue;
        if (clips.every((cl) => inside(cl, px, py))) got[j * nx + i] = 1;
      }
    }
  }
  const bare = (x0 = 0, y0 = 0, x1 = cw, y1 = ch) => { let n = 0; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const px = i * step + step / 2, py = j * step + step / 2; if (px >= x0 && px < x1 && py >= y0 && py < y1 && !got[j * nx + i]) n++; } return n; };
  return { bare, got, nx, ny };
}
