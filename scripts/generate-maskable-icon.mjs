// Génère public/icon-512-maskable.png : l'icône existante (icon-512.png)
// réduite à ~78% et centrée sur un fond vert profond (#14432A), pour que le
// logo entier tienne dans la "safe zone" du masque adaptatif Android.
// Codec PNG maison (zlib intégré à Node), aucune dépendance.

import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const pub = fileURLToPath(new URL("../public/", import.meta.url));
const SRC = pub + "icon-512.png";
const OUT = pub + "icon-512-maskable.png";

// ---- CRC-32 (PNG) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- Lecture PNG -> RGBA ----
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("pas un PNG");
  let off = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  let palette = null, trns = null;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "tRNS") {
      trns = data;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    off += 12 + len;
  }
  if (bitDepth !== 8) throw new Error("bitDepth " + bitDepth + " non géré");
  const raw = inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 0 ? 1 : 0;
  if (!channels) throw new Error("colorType " + colorType + " non géré");
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[p + x];
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let val;
      switch (filter) {
        case 0: val = rawByte; break;
        case 1: val = rawByte + a; break;
        case 2: val = rawByte + b; break;
        case 3: val = rawByte + ((a + b) >> 1); break;
        case 4: {
          const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          val = rawByte + pr;
          break;
        }
        default: throw new Error("filtre " + filter);
      }
      cur[x] = val & 0xff;
    }
    p += stride;
    for (let x = 0; x < width; x++) {
      const s = x * channels;
      let r, g, bl, al;
      if (channels === 4) { r = cur[s]; g = cur[s + 1]; bl = cur[s + 2]; al = cur[s + 3]; }
      else if (channels === 3) { r = cur[s]; g = cur[s + 1]; bl = cur[s + 2]; al = 255; }
      else if (colorType === 3) { const pi = cur[s] * 3; r = palette[pi]; g = palette[pi + 1]; bl = palette[pi + 2]; al = trns && cur[s] < trns.length ? trns[cur[s]] : 255; }
      else { r = g = bl = cur[s]; al = 255; }
      const o = (y * width + x) * 4;
      out[o] = r; out[o + 1] = g; out[o + 2] = bl; out[o + 3] = al;
    }
    cur.copy(prev);
  }
  return { width, height, data: out };
}

// ---- Écriture RGBA -> PNG (filtre 0) ----
function encodePng(width, height, data) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const compressed = deflateSync(raw, { level: 9 });
  const chunk = (type, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length, 0);
    const tb = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([tb, body])), 0);
    return Buffer.concat([len, tb, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- Traitement ----
const src = decodePng(readFileSync(SRC));
const SIZE = 512;
const INNER = 400;                 // 78% -> logo dans la safe zone (center 80%)
const OFF = (SIZE - INNER) >> 1;    // 56

// fond vert profond #14432A
const BG = [0x14, 0x43, 0x2a, 0xff];
const out = Buffer.alloc(SIZE * SIZE * 4);
for (let i = 0; i < SIZE * SIZE; i++) {
  out[i * 4] = BG[0]; out[i * 4 + 1] = BG[1]; out[i * 4 + 2] = BG[2]; out[i * 4 + 3] = BG[3];
}

// redimensionnement bilinéaire src -> INNER x INNER, composé (alpha) sur le fond
for (let dy = 0; dy < INNER; dy++) {
  const sy = (dy + 0.5) * src.height / INNER - 0.5;
  const y0 = Math.max(0, Math.floor(sy)), y1 = Math.min(src.height - 1, y0 + 1);
  const fy = sy - y0;
  for (let dx = 0; dx < INNER; dx++) {
    const sx = (dx + 0.5) * src.width / INNER - 0.5;
    const x0 = Math.max(0, Math.floor(sx)), x1 = Math.min(src.width - 1, x0 + 1);
    const fx = sx - x0;
    const sample = (ch) => {
      const p00 = src.data[(y0 * src.width + x0) * 4 + ch];
      const p10 = src.data[(y0 * src.width + x1) * 4 + ch];
      const p01 = src.data[(y1 * src.width + x0) * 4 + ch];
      const p11 = src.data[(y1 * src.width + x1) * 4 + ch];
      return p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy;
    };
    const r = sample(0), g = sample(1), b = sample(2), a = sample(3) / 255;
    const o = ((dy + OFF) * SIZE + (dx + OFF)) * 4;
    out[o] = Math.round(r * a + BG[0] * (1 - a));
    out[o + 1] = Math.round(g * a + BG[1] * (1 - a));
    out[o + 2] = Math.round(b * a + BG[2] * (1 - a));
    out[o + 3] = 255;
  }
}

const pngBytes = encodePng(SIZE, SIZE, out);
writeFileSync(OUT, pngBytes);
console.log("écrit:", OUT, "-", pngBytes.length, "octets");

// auto-vérification : relire ce qu'on vient d'écrire
const rt = decodePng(readFileSync(OUT));
console.log("relecture OK:", rt.width + "x" + rt.height);
const cornerA = rt.data[3], centerR = rt.data[(256 * 512 + 256) * 4];
console.log("coin alpha:", cornerA, "(attendu 255) | centre R:", centerR);
