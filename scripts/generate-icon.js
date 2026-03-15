/**
 * Generates a minimal 256x256 ICO file with a blue gradient shield icon.
 * Uses raw pixel data - no external dependencies required.
 * 
 * Usage: node scripts/generate-icon.js
 * Output: build/icon.ico
 */

const fs = require('fs');
const path = require('path');

const SIZE = 64;
const OUTPUT = path.join(__dirname, '..', 'build', 'icon.ico');

function createBMPData(size) {
  const pixels = Buffer.alloc(size * size * 4);

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.42;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = ((size - 1 - y) * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        const t = y / size;
        const r = Math.round(16 + t * 43);
        const g = Math.round(90 + t * 40);
        const b = Math.round(220 + t * 26);

        const edgeFade = Math.min(1, (radius - dist) / 2);
        const alpha = Math.round(255 * edgeFade);

        pixels[idx + 0] = b;
        pixels[idx + 1] = g;
        pixels[idx + 2] = r;
        pixels[idx + 3] = alpha;
      } else {
        pixels[idx + 0] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = 0;
      }
    }
  }

  // Draw a simple "H" in white for "Health"
  const letterW = Math.floor(size * 0.35);
  const letterH = Math.floor(size * 0.4);
  const startX = Math.floor(cx - letterW / 2);
  const startY = Math.floor(cy - letterH / 2);
  const barW = Math.max(2, Math.floor(size * 0.06));

  for (let ly = 0; ly < letterH; ly++) {
    for (let lx = 0; lx < letterW; lx++) {
      const isLeftBar = lx < barW;
      const isRightBar = lx >= letterW - barW;
      const isCrossBar = ly >= (letterH / 2 - barW / 2) && ly <= (letterH / 2 + barW / 2);

      if (isLeftBar || isRightBar || isCrossBar) {
        const px = startX + lx;
        const py = startY + ly;
        if (px >= 0 && px < size && py >= 0 && py < size) {
          const idx = ((size - 1 - py) * size + px) * 4;
          pixels[idx + 0] = 255;
          pixels[idx + 1] = 255;
          pixels[idx + 2] = 255;
          pixels[idx + 3] = 255;
        }
      }
    }
  }

  return pixels;
}

function createICO(size) {
  const pixelData = createBMPData(size);
  const bmpInfoSize = 40;
  const imageDataSize = bmpInfoSize + pixelData.length;

  // ICO header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // type: ICO
  header.writeUInt16LE(1, 4);      // 1 image

  // Directory entry: 16 bytes
  const dirEntry = Buffer.alloc(16);
  dirEntry.writeUInt8(size >= 256 ? 0 : size, 0);   // width (0 = 256)
  dirEntry.writeUInt8(size >= 256 ? 0 : size, 1);   // height
  dirEntry.writeUInt8(0, 2);                          // color palette
  dirEntry.writeUInt8(0, 3);                          // reserved
  dirEntry.writeUInt16LE(1, 4);                       // color planes
  dirEntry.writeUInt16LE(32, 6);                      // bits per pixel
  dirEntry.writeUInt32LE(imageDataSize, 8);           // image data size
  dirEntry.writeUInt32LE(22, 12);                     // offset to image data

  // BMP info header
  const bmpInfo = Buffer.alloc(bmpInfoSize);
  bmpInfo.writeUInt32LE(bmpInfoSize, 0);
  bmpInfo.writeInt32LE(size, 4);         // width
  bmpInfo.writeInt32LE(size * 2, 8);     // height (double for ICO)
  bmpInfo.writeUInt16LE(1, 12);          // planes
  bmpInfo.writeUInt16LE(32, 14);         // bits per pixel
  bmpInfo.writeUInt32LE(0, 16);          // compression
  bmpInfo.writeUInt32LE(pixelData.length, 20);
  bmpInfo.writeInt32LE(0, 24);
  bmpInfo.writeInt32LE(0, 28);
  bmpInfo.writeUInt32LE(0, 32);
  bmpInfo.writeUInt32LE(0, 36);

  return Buffer.concat([header, dirEntry, bmpInfo, pixelData]);
}

const icoBuffer = createICO(SIZE);
fs.writeFileSync(OUTPUT, icoBuffer);
console.log(`Icon generated: ${OUTPUT} (${icoBuffer.length} bytes, ${SIZE}x${SIZE})`);
