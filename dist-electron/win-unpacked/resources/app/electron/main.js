const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');

const BACKEND_HOST = '127.0.0.1';
const DEFAULT_PORT = 8502;
const POLL_INTERVAL_MS = 500;
const MAX_POLL_ATTEMPTS = 120;
const MAX_RESTART_ATTEMPTS = 3;
const RESTART_DELAY_MS = 2000;

let backendPort = DEFAULT_PORT;
let backendUrl = `http://${BACKEND_HOST}:${DEFAULT_PORT}`;
let mainWindow = null;
let splashWindow = null;
let setupWindow = null;
let pythonProcess = null;
let isQuitting = false;
let restartCount = 0;
let backendReady = false;

// ── Paths & Config ─────────────────────────────────────────────────────

function getConfigPath() {
  return path.join(app.getPath('userData'), 'app-config.json');
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8'));
  } catch {
    return null;
  }
}

function saveConfig(config) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}

function isFirstRun() {
  return !fs.existsSync(getConfigPath());
}

function isDev() {
  return !app.isPackaged;
}

function clearDevCache() {
  const dbPath = path.join(__dirname, '..', 'data', 'org_health_agent.db');
  const configPath = getConfigPath();
  let cleared = [];
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
    cleared.push('app-config.json');
  }
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    cleared.push('org_health_agent.db');
  }
  return cleared;
}

function getPythonBackendPath() {
  if (isDev()) return null;
  return path.join(process.resourcesPath, 'python-backend');
}

// ── Salesforce CLI Check ───────────────────────────────────────────────

function checkSalesforceCli() {
  const cmds = ['sf', 'sfdx'];
  for (const cmd of cmds) {
    try {
      const version = execSync(`${cmd} --version`, { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      return { installed: true, version };
    } catch { /* try next */ }
  }
  return { installed: false, version: null };
}

// ── Port Detection ─────────────────────────────────────────────────────

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, BACKEND_HOST);
  });
}

async function findAvailablePort(startPort, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) return port;
  }
  return null;
}

// ── Python Backend ─────────────────────────────────────────────────────

async function startPythonBackend() {
  const electronEnv = { ...process.env, PYTHONUNBUFFERED: '1', ELECTRON_RUN: '1' };

  if (isDev()) {
    const projectRoot = path.join(__dirname, '..');
    pythonProcess = spawn('python', [
      '-m', 'uvicorn', 'app.server:app',
      '--host', BACKEND_HOST,
      '--port', String(backendPort),
      '--log-level', 'info',
    ], {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: electronEnv,
    });
  } else {
    const backendPath = getPythonBackendPath();
    const mainExe = path.join(backendPath, 'main.exe');
    if (!fs.existsSync(mainExe)) {
      throw new Error(`Backend executable not found: ${mainExe}`);
    }
    pythonProcess = spawn(mainExe, [], {
      cwd: backendPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...electronEnv, PORT: String(backendPort) },
    });
  }

  pythonProcess.stdout.on('data', (data) => {
    console.log(`[Backend] ${data.toString().trim()}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`[Backend] ${data.toString().trim()}`);
  });

  pythonProcess.on('error', (err) => {
    console.error('Failed to start Python backend:', err);
  });

  pythonProcess.on('exit', (code) => {
    console.log(`Python backend exited with code ${code}`);
    pythonProcess = null;

    if (isQuitting) return;

    if (restartCount < MAX_RESTART_ATTEMPTS) {
      restartCount++;
      console.log(`Auto-restarting backend (attempt ${restartCount}/${MAX_RESTART_ATTEMPTS})...`);
      updateSplashMessage(`Backend restarting (attempt ${restartCount}/${MAX_RESTART_ATTEMPTS})...`);
      setTimeout(async () => {
        try {
          await startPythonBackend();
          await pollBackendReady();
          backendReady = true;
          restartCount = 0;
          if (mainWindow) {
            mainWindow.reload();
          }
        } catch (err) {
          console.error('Restart failed:', err);
          handleBackendFailure();
        }
      }, RESTART_DELAY_MS);
    } else {
      handleBackendFailure();
    }
  });
}

function handleBackendFailure() {
  if (isQuitting) return;
  const choice = dialog.showMessageBoxSync({
    type: 'error',
    title: 'Backend Error',
    message: 'The backend has stopped after multiple restart attempts.',
    detail:
      'The Org Health Agent backend could not stay running.\n\n' +
      'Possible causes:\n' +
      '- Python dependency issue\n' +
      '- Port conflict with another application\n' +
      '- Missing or corrupt files\n\n' +
      'You can try restarting the application.',
    buttons: ['Restart Application', 'Exit'],
    defaultId: 0,
  });

  if (choice === 0) {
    restartCount = 0;
    app.relaunch();
    app.exit(0);
  } else {
    app.quit();
  }
}

function updateSplashMessage(msg) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.executeJavaScript(
      `document.querySelector('.subtitle') && (document.querySelector('.subtitle').textContent = ${JSON.stringify(msg)});`
    ).catch(() => {});
  }
}

function killPythonBackend() {
  if (!pythonProcess || pythonProcess.killed) {
    pythonProcess = null;
    return;
  }
  try {
    pythonProcess.removeAllListeners('exit');
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pythonProcess.pid} /T /F`, { stdio: 'pipe' });
    } else {
      pythonProcess.kill('SIGTERM');
    }
  } catch (e) {
    console.error('Error killing Python process:', e.message);
  }
  pythonProcess = null;
}

function pollBackendReady() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const poll = () => {
      attempts++;
      if (attempts > MAX_POLL_ATTEMPTS) {
        reject(new Error('Backend did not start within the expected time.'));
        return;
      }
      const req = http.get(`${backendUrl}/api/health`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) resolve();
          else setTimeout(poll, POLL_INTERVAL_MS);
        });
      });
      req.on('error', () => setTimeout(poll, POLL_INTERVAL_MS));
      req.setTimeout(2000, () => { req.destroy(); setTimeout(poll, POLL_INTERVAL_MS); });
    };
    poll();
  });
}

// ── Windows ────────────────────────────────────────────────────────────

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 360,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    center: true,
    show: false,
    backgroundColor: '#161616',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.once('ready-to-show', () => splashWindow.show());
}

function createSetupWindow() {
  return new Promise((resolve) => {
    setupWindow = new BrowserWindow({
      width: 720,
      height: 600,
      frame: false,
      resizable: false,
      center: true,
      show: false,
      backgroundColor: '#161616',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
      },
    });
    setupWindow.loadFile(path.join(__dirname, 'setup.html'));
    setupWindow.once('ready-to-show', () => setupWindow.show());

    ipcMain.once('setup-complete', (_event, config) => {
      saveConfig(config);
      if (setupWindow && !setupWindow.isDestroyed()) {
        setupWindow.close();
      }
      setupWindow = null;
      resolve(config);
    });

    setupWindow.on('closed', () => {
      setupWindow = null;
      if (!loadConfig()) resolve(null);
    });
  });
}

function createMainWindow() {
  const config = loadConfig() || {};
  const accent = config.theme || 'blue';
  const targetUrl = backendUrl;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Org Health Agent',
    show: false,
    frame: false,
    backgroundColor: '#161616',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadURL(targetUrl);

  // Open external links in the system browser, not in Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(backendUrl)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.insertCSS(`
      html, body, #root {
        width: 100% !important;
        height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
      }
      /* Make the topbar header area draggable for window movement */
      header {
        -webkit-app-region: drag;
        padding-right: 136px !important;
      }
      header button, header a, header [role="button"], header input, header select, header div[class*="relative"] {
        -webkit-app-region: no-drag;
      }
      /* Window controls inlined into the topbar, top-right */
      .electron-window-controls {
        position: fixed;
        top: 0;
        right: 0;
        height: 72px;
        z-index: 99999;
        display: flex;
        align-items: center;
        -webkit-app-region: no-drag;
        background: #161616;
        border-bottom: 1px solid #393939;
      }
      .electron-window-controls button {
        background: none;
        border: none;
        color: #6F6F6F;
        width: 46px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 11px;
        transition: background 0.15s, color 0.15s;
      }
      .electron-window-controls button:hover {
        background: #393939;
        color: #F4F4F4;
      }
      .electron-window-controls button.close-btn:hover {
        background: #DA1E28;
        color: #FFFFFF;
      }
    `);

    mainWindow.webContents.executeJavaScript(`
      if (!document.querySelector('.electron-window-controls')) {
        const controls = document.createElement('div');
        controls.className = 'electron-window-controls';
        controls.innerHTML = \`
          <button onclick="window.electronAPI && window.electronAPI.minimizeWindow()" title="Minimize">&#x2500;</button>
          <button onclick="window.electronAPI && window.electronAPI.maximizeWindow()" title="Maximize">&#x25A1;</button>
          <button class="close-btn" onclick="window.electronAPI && window.electronAPI.closeWindow()" title="Close">&#x2715;</button>
        \`;
        document.body.appendChild(controls);
      }
    `);
  });

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── IPC Handlers ───────────────────────────────────────────────────────

ipcMain.handle('check-sf-cli', () => checkSalesforceCli());
ipcMain.handle('get-config', () => loadConfig() || {});
ipcMain.handle('save-config', (_event, config) => { saveConfig(config); return true; });
ipcMain.handle('open-external', (_event, url) => shell.openExternal(url));
ipcMain.handle('get-backend-url', () => backendUrl);

ipcMain.handle('minimize-window', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});
ipcMain.handle('maximize-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) { win.isMaximized() ? win.unmaximize() : win.maximize(); }
});
ipcMain.handle('close-window', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});
ipcMain.handle('clear-dev-cache', () => {
  if (isDev()) return clearDevCache();
  return [];
});

// ── App Lifecycle ──────────────────────────────────────────────────────

app.on('ready', async () => {
  // Dev mode: check for --clear-cache flag
  if (isDev() && process.argv.includes('--clear-cache')) {
    const cleared = clearDevCache();
    console.log('[Dev] Cleared cache:', cleared.length ? cleared.join(', ') : 'nothing to clear');
  }

  try {
    if (isFirstRun()) {
      const config = await createSetupWindow();
      if (!config) {
        app.quit();
        return;
      }
    }

    const sfCheck = checkSalesforceCli();
    if (!sfCheck.installed) {
      const result = await dialog.showMessageBox({
        type: 'warning',
        title: 'Salesforce CLI Not Found',
        message: 'Salesforce CLI (sf) is not installed or not found on PATH.',
        detail:
          'The Org Health Agent requires Salesforce CLI to connect to your Salesforce orgs.\n\n' +
          'Install from: https://developer.salesforce.com/tools/salesforcecli\n\n' +
          'You can continue, but org connections will not work until SF CLI is installed.',
        buttons: ['Continue Anyway', 'Download SF CLI', 'Exit'],
        defaultId: 0,
        cancelId: 2,
      });
      if (result.response === 1) {
        shell.openExternal('https://developer.salesforce.com/tools/salesforcecli');
      } else if (result.response === 2) {
        app.quit();
        return;
      }
    }

    createSplashWindow();
    updateSplashMessage('Checking port availability...');

    const portOk = await isPortAvailable(DEFAULT_PORT);
    if (portOk) {
      backendPort = DEFAULT_PORT;
    } else {
      updateSplashMessage('Port 8502 in use, finding alternative...');
      const altPort = await findAvailablePort(DEFAULT_PORT + 1);
      if (!altPort) {
        dialog.showErrorBox('Port Conflict',
          `Port ${DEFAULT_PORT} is already in use and no alternative port (${DEFAULT_PORT + 1}–${DEFAULT_PORT + 10}) is available.\n\n` +
          'Please close the application using that port and try again.');
        app.quit();
        return;
      }
      backendPort = altPort;
      console.log(`Port ${DEFAULT_PORT} busy. Using port ${backendPort} instead.`);
    }

    backendUrl = `http://${BACKEND_HOST}:${backendPort}`;
    updateSplashMessage('Starting backend services...');

    await startPythonBackend();
    await pollBackendReady();
    backendReady = true;
    restartCount = 0;

    createMainWindow();
  } catch (err) {
    console.error('Startup error:', err);
    dialog.showErrorBox('Startup Error', `Failed to start Org Health Agent:\n\n${err.message}`);
    killPythonBackend();
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  killPythonBackend();
});

app.on('window-all-closed', () => {
  isQuitting = true;
  killPythonBackend();
  app.quit();
});

app.on('activate', () => {
  if (!mainWindow && backendReady) createMainWindow();
});
