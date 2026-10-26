// Gera public/icon-192.png e public/icon-512.png (mesmo desenho de public/icon.svg) sem dependências.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
// Formas no espaço 512×512: [tipo, ...geometria, cor]
const shapes = [
  ['rrect', 0, 0, 512, 512, 112, '#4f46e5'],
  ['rrect', 96, 150, 320, 212, 32, '#ffffff'],
  ['rrect', 96, 196, 320, 40, 0, '#1e1b4b'],
  ['rrect', 132, 290, 96, 24, 12, '#a5b4fc'],
  ['circle', 356, 302, 26, '#34d399'],
];

function inside(s, x, y) {
  if (s[0] === 'circle') return (x - s[1]) ** 2 + (y - s[2]) ** 2 <= s[3] ** 2;
  const [, rx, ry, w, h, r] = s;
  if (x < rx || y < ry || x > rx + w || y > ry + h) return false;
  const cx = Math.min(Math.max(x, rx + r), rx + w - r);
  const cy = Math.min(Math.max(y, ry + r), ry + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function png(size) {
  const scale = 512 / size;
  const SS = 4; // supersampling para bordas suaves
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const x = (px + (sx + 0.5) / SS) * scale, y = (py + (sy + 0.5) / SS) * scale;
        let col = null;
        for (const s of shapes) if (inside(s, x, y)) col = hex(s[s.length - 1]);
        if (col) { r += col[0]; g += col[1]; b += col[2]; a += 255; }
      }
      const n = SS * SS, o = py * (size * 4 + 1) + 1 + px * 4, cov = a / 255 || 1;
      raw[o] = r / cov; raw[o + 1] = g / cov; raw[o + 2] = b / cov; raw[o + 3] = a / n;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

for (const s of [192, 512]) writeFileSync(`public/icon-${s}.png`, png(s));
console.log('Ícones gerados.');
