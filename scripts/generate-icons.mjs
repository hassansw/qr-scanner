import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");
mkdirSync(outDir, { recursive: true });

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const BG_TOP = [24, 26, 37];
const BG_BOTTOM = [10, 12, 20];
const WHITE = [245, 245, 245];
const EMERALD = [52, 211, 153];

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const set = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = 255;
  };

  for (let y = 0; y < size; y++) {
    const t = y / size;
    const r = Math.round(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t);
    const g = Math.round(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t);
    const b = Math.round(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t);
    for (let x = 0; x < size; x++) set(x, y, [r, g, b]);
  }

  const margin = Math.round(size * 0.2);
  const grid = 21;
  const cell = (size - margin * 2) / grid;

  const drawCell = (row, col, color) => {
    const pad = cell * 0.1;
    const x0 = Math.round(margin + col * cell + pad);
    const y0 = Math.round(margin + row * cell + pad);
    const x1 = Math.round(margin + (col + 1) * cell - pad);
    const y1 = Math.round(margin + (row + 1) * cell - pad);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, color);
  };

  const drawFinder = (row, col) => {
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 7; c++) {
        const inOuter = r >= 1 && r <= 5 && c >= 1 && c <= 5;
        const inInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        drawCell(row + r, col + c, inInner ? WHITE : inOuter ? BG_BOTTOM : WHITE);
      }
  };

  drawFinder(0, 0);
  drawFinder(0, 14);
  drawFinder(14, 0);

  for (let c = 8; c < 13; c++) drawCell(6, c, c % 2 === 0 ? WHITE : BG_BOTTOM);
  for (let r = 8; r < 13; r++) drawCell(r, 6, r % 2 === 0 ? WHITE : BG_BOTTOM);

  const rand = mulberry32(size);
  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      const inFinder =
        (r < 7 && c < 7) || (r < 7 && c > 13) || (r > 13 && c < 7);
      const inTiming = r === 6 || c === 6;
      const inCenter = r >= 8 && r <= 12 && c >= 8 && c <= 12;
      if (inFinder || inTiming || inCenter) continue;
      if (rand() < 0.42) drawCell(r, c, WHITE);
    }
  }

  drawCell(10, 10, EMERALD);
  drawCell(10, 11, EMERALD);
  drawCell(11, 10, EMERALD);
  drawCell(11, 11, EMERALD);

  return buf;
}

for (const size of [192, 512, 180]) {
  const png = encodePNG(size, size, buildIcon(size));
  const name = size === 180 ? "apple-touch-icon.png" : `icon-${size}.png`;
  writeFileSync(join(outDir, name), png);
  console.log("wrote", join("public/icons", name));
}

const maskable = Buffer.from(buildIcon(512));
const maskablePng = encodePNG(512, 512, maskable);
writeFileSync(join(outDir, "maskable-512.png"), maskablePng);
console.log("wrote public/icons/maskable-512.png");