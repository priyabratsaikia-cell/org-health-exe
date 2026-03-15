/**
 * Build script: bundles the Python backend using PyInstaller
 * and copies the output to python-dist/ for electron-builder to package.
 *
 * Usage: node scripts/build-python.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST_SRC = path.join(ROOT, 'dist', 'org-health-backend');
const DIST_DEST = path.join(ROOT, 'python-dist');

function run(cmd, label) {
  console.log(`\n>> ${label}`);
  console.log(`   ${cmd}\n`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

function copyDir(src, dest) {
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  fs.cpSync(src, dest, { recursive: true });
}

// ── Pre-checks ─────────────────────────────────────────────────────────

console.log('=== Org Health Agent - Python Backend Build ===\n');

try {
  execSync('python --version', { stdio: 'pipe' });
} catch {
  console.error('ERROR: Python is not installed or not on PATH.');
  process.exit(1);
}

try {
  execSync('pip show pyinstaller', { stdio: 'pipe' });
  console.log('PyInstaller found.');
} catch {
  console.log('Installing PyInstaller...');
  run('pip install pyinstaller', 'Install PyInstaller');
}

// ── Step 1: Build the React frontend ───────────────────────────────────

const frontendDir = path.join(ROOT, 'frontend');
const reactDist = path.join(ROOT, 'app', 'static', 'dist');

if (fs.existsSync(frontendDir)) {
  const pkgLock = path.join(frontendDir, 'package-lock.json');
  const nodeModules = path.join(frontendDir, 'node_modules');

  if (!fs.existsSync(nodeModules)) {
    run('npm install', 'Install frontend dependencies');
  }

  run('cd frontend && npm run build', 'Build React frontend');
  console.log(`Frontend built to: ${reactDist}`);
} else {
  console.log('No frontend/ directory found. Skipping frontend build.');
}

// ── Step 2: Install Python dependencies ────────────────────────────────

const requirementsFile = path.join(ROOT, 'requirements.txt');
if (fs.existsSync(requirementsFile)) {
  run('pip install -r requirements.txt', 'Install Python dependencies');
}

// ── Step 3: Run PyInstaller ────────────────────────────────────────────

const specFile = path.join(ROOT, 'org-health.spec');
if (!fs.existsSync(specFile)) {
  console.error('ERROR: org-health.spec not found.');
  process.exit(1);
}

run('pyinstaller org-health.spec --noconfirm --clean', 'Run PyInstaller');

// ── Step 4: Copy to python-dist/ ───────────────────────────────────────

if (!fs.existsSync(DIST_SRC)) {
  console.error(`ERROR: PyInstaller output not found at ${DIST_SRC}`);
  process.exit(1);
}

console.log(`\nCopying build output to python-dist/...`);
copyDir(DIST_SRC, DIST_DEST);

console.log('\n=== Python backend build complete ===');
console.log(`Output: ${DIST_DEST}`);
