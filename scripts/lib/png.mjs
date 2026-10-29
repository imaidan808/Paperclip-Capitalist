// A small PNG codec with no dependencies (zlib is built into Node). It reads what Chrome writes (8 or 16 bit grey, grey+alpha, palette, RGB and RGBA, not interlaced) and writes RGBA.
//   decodePng(buffer)  -> { width, height, data }   data is a Uint8Array of width * height * 4 (R, G, B, A), opaque where the file has no alpha
//   encodePng(image)   -> Buffer                    image is { width, height, data } in the same form; filter 0 on every row would be large, so rows use the Sub filter
// Pure: no files, no Chrome. The rig's metrics (scripts/lib/imagemetrics.mjs) and the side-by-side maker (scripts/world-ab.mjs) are built on it.
import { inflateSync, deflateSync } from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function decodePng(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  if (buf.length < 33 || !buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  let pos = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0, plte = null, trns = null; const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos), name = buf.toString('latin1', pos + 4, pos + 8), body = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (name === 'IHDR') { w = body.readUInt32BE(0); h = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12]; }
    else if (name === 'PLTE') plte = body;
    else if (name === 'tRNS') trns = body;
    else if (name === 'IDAT') idat.push(body);
    else if (name === 'IEND') break;
  }
  if (!w || !h) throw new Error('PNG has no header');
  if (interlace) throw new Error('interlaced PNG is not supported');
  if (depth !== 8 && depth !== 16) throw new Error('PNG bit depth ' + depth + ' is not supported');
  const ch = CHANNELS[type]; if (!ch) throw new Error('PNG colour type ' + type + ' is not supported');
  const bpp = ch * (depth >> 3), stride = w * bpp, raw = inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * h) throw new Error('PNG data is short');
  const px = new Uint8Array(stride * h); // the unfiltered rows
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride, up = dst - stride;
    switch (f) {
      case 0: for (let i = 0; i < stride; i++) px[dst + i] = raw[src + i]; break;
      case 1: for (let i = 0; i < stride; i++) px[dst + i] = (raw[src + i] + (i >= bpp ? px[dst + i - bpp] : 0)) & 255; break;
      case 2: for (let i = 0; i < stride; i++) px[dst + i] = (raw[src + i] + (y ? px[up + i] : 0)) & 255; break;
      case 3: for (let i = 0; i < stride; i++) px[dst + i] = (raw[src + i] + (((i >= bpp ? px[dst + i - bpp] : 0) + (y ? px[up + i] : 0)) >> 1)) & 255; break;
      case 4: for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? px[dst + i - bpp] : 0, b = y ? px[up + i] : 0, c = i >= bpp && y ? px[up + i - bpp] : 0, p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        px[dst + i] = (raw[src + i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      } break;
      default: throw new Error('PNG filter ' + f + ' is not valid');
    }
  }
  const out = new Uint8Array(w * h * 4), step = depth >> 3; // 16 bit samples keep their high byte
  for (let y = 0, o = 0; y < h; y++) for (let x = 0; x < w; x++, o += 4) {
    const i = y * stride + x * bpp;
    if (type === 6) { out[o] = px[i]; out[o + 1] = px[i + step]; out[o + 2] = px[i + 2 * step]; out[o + 3] = px[i + 3 * step]; }
    else if (type === 2) { out[o] = px[i]; out[o + 1] = px[i + step]; out[o + 2] = px[i + 2 * step]; out[o + 3] = 255; }
    else if (type === 0) { out[o] = out[o + 1] = out[o + 2] = px[i]; out[o + 3] = 255; }
    else if (type === 4) { out[o] = out[o + 1] = out[o + 2] = px[i]; out[o + 3] = px[i + step]; }
    else { const k = px[i] * 3; out[o] = plte ? plte[k] : 0; out[o + 1] = plte ? plte[k + 1] : 0; out[o + 2] = plte ? plte[k + 2] : 0; out[o + 3] = trns && px[i] < trns.length ? trns[px[i]] : 255; }
  }
  return { width: w, height: h, data: out };
}

let CRC = null;
const crc32 = (b) => {
  if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;
};
const chunk = (name, body) => { const out = Buffer.alloc(12 + body.length); out.writeUInt32BE(body.length, 0); out.write(name, 4, 'latin1'); body.copy(out, 8); out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length); return out; };

export function encodePng({ width, height, data }) {
  if (data.length < width * height * 4) throw new Error('image data is short');
  const stride = width * 4, raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) { // the Sub filter: each byte minus the one a pixel to its left (flat colour compresses to nothing)
    const o = y * (stride + 1), s = y * stride; raw[o] = 1;
    for (let i = 0; i < stride; i++) raw[o + 1 + i] = (data[s + i] - (i >= 4 ? data[s + i - 4] : 0)) & 255;
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
