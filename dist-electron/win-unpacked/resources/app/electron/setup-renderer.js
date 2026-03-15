const TOTAL_STEPS = 4;
const STEP_LABELS = ['Notice', 'License', 'CLI Check', 'Theme'];

const THEMES = [
  {
    id: 'blue',
    name: 'Default Blue',
    desc: 'IBM Carbon design with blue accents',
    accent: '#0F62FE',
    sidebar: '#262626',
    bg: '#161616',
    bars: ['#0F62FE', '#78A9FF', '#002D9C'],
    blocks: '#0F62FE',
  },
  {
    id: 'orange',
    name: 'PwC Orange',
    desc: 'Warm orange accent inspired by PwC branding',
    accent: '#E04E17',
    sidebar: '#262626',
    bg: '#161616',
    bars: ['#E04E17', '#FF832B', '#8A3800'],
    blocks: '#E04E17',
  },
];

let currentStep = 0;
let selectedTheme = 'blue';
let sfCliInstalled = false;

const steps = document.querySelectorAll('.step-panel');
const nextBtn = document.getElementById('nextBtn');
const backBtn = document.getElementById('backBtn');
const agreeCheck = document.getElementById('agreeCheck');
const closeBtn = document.getElementById('closeBtn');

// ── Steps Bar ──────────────────────────────────────────────────────────

function buildStepsBar() {
  const bar = document.getElementById('stepsBar');
  bar.innerHTML = '';
  for (let i = 0; i < TOTAL_STEPS; i++) {
    if (i > 0) {
      const conn = document.createElement('div');
      conn.className = 'step-connector' + (i <= currentStep ? ' done' : '');
      bar.appendChild(conn);
    }
    const ind = document.createElement('div');
    ind.className = 'step-indicator';
    if (i === currentStep) ind.classList.add('active');
    else if (i < currentStep) ind.classList.add('done');
    ind.innerHTML = `
      <div class="step-num">${i < currentStep ? '&#10003;' : i + 1}</div>
      <span class="step-label">${STEP_LABELS[i]}</span>
    `;
    bar.appendChild(ind);
  }
}

// ── Theme Grid ─────────────────────────────────────────────────────────

function buildThemeGrid() {
  const grid = document.getElementById('themeGrid');
  grid.innerHTML = '';
  THEMES.forEach((theme) => {
    const card = document.createElement('div');
    card.className = 'theme-card' + (theme.id === selectedTheme ? ' selected' : '');
    card.innerHTML = `
      <div class="theme-preview" style="background:${theme.bg};border:1px solid #393939;">
        <div class="sidebar-mock" style="background:${theme.sidebar};border-right:1px solid #393939;">
          ${theme.bars.map(c => `<div class="bar" style="background:${c};"></div>`).join('')}
          <div class="bar" style="background:#525252;"></div>
        </div>
        <div class="content-mock">
          <div class="block" style="background:${theme.blocks};"></div>
          <div class="block" style="background:${theme.blocks};"></div>
          <div class="block" style="background:${theme.blocks};"></div>
          <div class="block" style="background:${theme.blocks};"></div>
        </div>
      </div>
      <div class="theme-name">${theme.name}</div>
      <div class="theme-desc">${theme.desc}</div>
    `;
    card.addEventListener('click', () => {
      selectedTheme = theme.id;
      document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      applyAccentColor(theme.accent);
    });
    grid.appendChild(card);
  });
}

// ── Accent Color ───────────────────────────────────────────────────────

function applyAccentColor(hex) {
  const hoverHex = selectedTheme === 'orange' ? '#C43D0F' : '#0353E9';
  nextBtn.style.background = hex;
  nextBtn.onmouseenter = () => { if (!nextBtn.disabled) nextBtn.style.background = hoverHex; };
  nextBtn.onmouseleave = () => { if (!nextBtn.disabled) nextBtn.style.background = hex; };
}

function getActiveAccent() {
  const t = THEMES.find(t => t.id === selectedTheme);
  return t ? t.accent : '#0F62FE';
}

// ── SF CLI Check ───────────────────────────────────────────────────────

async function checkSfCli() {
  const icon = document.getElementById('cliIcon');
  const title = document.getElementById('cliTitle');
  const detail = document.getElementById('cliDetail');
  const actions = document.getElementById('cliActions');

  icon.className = 'cli-icon checking';
  icon.innerHTML = '&#8987;';
  title.textContent = 'Checking...';
  detail.textContent = 'Detecting Salesforce CLI installation';
  actions.style.display = 'none';

  try {
    const result = await window.electronAPI.checkSfCli();
    if (result.installed) {
      sfCliInstalled = true;
      icon.className = 'cli-icon found';
      icon.innerHTML = '&#10003;';
      title.textContent = 'Salesforce CLI Found';
      detail.textContent = result.version || 'Installed and ready';
    } else {
      sfCliInstalled = false;
      icon.className = 'cli-icon missing';
      icon.innerHTML = '&#10007;';
      title.textContent = 'Salesforce CLI Not Found';
      detail.textContent = 'Install Salesforce CLI to enable org connections';
      actions.style.display = 'flex';
    }
  } catch {
    sfCliInstalled = false;
    icon.className = 'cli-icon missing';
    icon.innerHTML = '!';
    title.textContent = 'Detection Failed';
    detail.textContent = 'Could not detect Salesforce CLI';
    actions.style.display = 'flex';
  }
}

// ── Navigation ─────────────────────────────────────────────────────────

function goToStep(step) {
  steps.forEach(p => p.classList.remove('active'));
  steps[step].classList.add('active');
  currentStep = step;

  buildStepsBar();

  backBtn.style.visibility = step === 0 ? 'hidden' : 'visible';
  nextBtn.textContent = step === TOTAL_STEPS - 1 ? 'Finish Setup' : 'Next';

  if (step === 2) checkSfCli();
  if (step === 3) {
    buildThemeGrid();
    applyAccentColor(getActiveAccent());
  }

  updateNextButton();
}

function updateNextButton() {
  if (currentStep === 1) {
    nextBtn.disabled = !agreeCheck.checked;
  } else {
    nextBtn.disabled = false;
  }
}

// ── Events ─────────────────────────────────────────────────────────────

agreeCheck.addEventListener('change', updateNextButton);

nextBtn.addEventListener('click', () => {
  if (currentStep < TOTAL_STEPS - 1) {
    goToStep(currentStep + 1);
  } else {
    window.electronAPI.completeSetup({
      theme: selectedTheme,
      agreedToTerms: true,
      sfCliInstalled,
      setupCompletedAt: new Date().toISOString(),
    });
  }
});

backBtn.addEventListener('click', () => {
  if (currentStep > 0) goToStep(currentStep - 1);
});

closeBtn.addEventListener('click', () => window.close());

document.getElementById('downloadCliBtn').addEventListener('click', () => {
  window.electronAPI.openExternal('https://developer.salesforce.com/tools/salesforcecli');
});

document.getElementById('recheckCliBtn').addEventListener('click', () => checkSfCli());

// ── Init ───────────────────────────────────────────────────────────────
buildStepsBar();
updateNextButton();
