/**
 * Patches electron-builder's SZA_PATH to use a 7za wrapper that
 * tolerates symlink extraction errors on Windows without Developer Mode.
 * Run before `electron-builder --win` on corporate/locked-down machines.
 */
const fs = require('fs');
const path = require('path');

const utilPath = path.join(__dirname, '..', 'node_modules', 'builder-util', 'out', 'util.js');
const wrapperPath = path.join(__dirname, '7za-wrapper.cmd').replace(/\\/g, '\\\\');

let src = fs.readFileSync(utilPath, 'utf8');

const original = 'SZA_PATH: await (0, _7za_1.getPath7za)()';
const patched = `SZA_PATH: "${wrapperPath}"`;

if (src.includes(patched)) {
  console.log('[patch-7za] Already patched.');
} else if (src.includes(original)) {
  src = src.replace(original, patched);
  fs.writeFileSync(utilPath, src, 'utf8');
  console.log('[patch-7za] Patched SZA_PATH to use 7za-wrapper.cmd');
} else {
  console.warn('[patch-7za] Could not find SZA_PATH line to patch. Build may fail on symlink errors.');
}
