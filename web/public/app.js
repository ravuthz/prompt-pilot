const $ = (id) => document.getElementById(id);

const state = {
  browsers: [],
  selected: null,
};

async function api(path, body) {
  const res = await fetch(path, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : undefined);
  const json = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }));
  if (!json.success) throw new Error(json.error || 'Request failed');
  return json.data;
}

function action(name, params = {}) {
  return api('/api/action', { action: name, params, browser: state.selected });
}

function setStatus(kind, text) {
  $('status').className = `status ${kind}`;
  $('statusText').textContent = text;
}

function log(label, data, isError = false) {
  const line = document.createElement('div');
  const ts = document.createElement('span');
  ts.className = 'ts';
  ts.textContent = `[${new Date().toLocaleTimeString()}] ${label}\n`;
  const body = document.createElement('span');
  if (isError) body.className = 'err';
  body.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  line.append(ts, body, '\n');
  $('log').prepend(line);
}

async function run(label, fn, button) {
  if (button) button.disabled = true;
  try {
    const data = await fn();
    log(label, data);
    return data;
  } catch (err) {
    log(label, err.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}

/* ---------- Per-browser config cache (localStorage) ---------- */

const CONFIG_KEY_PREFIX = 'promptPilot.web.config.browser.';
const LAST_BROWSER_KEY = 'promptPilot.web.lastBrowser';
const CONFIG_FIELDS = ['prompt', 'site', 'mode', 'aspect', 'count', 'model', 'agent', 'mediaFilter'];
const CONFIG_DEFAULTS = {
  prompt: '', site: 'Google Flow', mode: 'image', aspect: '16:9', count: '1', model: '', agent: 'true', mediaFilter: '',
};

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

function saveConfig() {
  if (!state.selected) return;
  const config = {};
  for (const id of CONFIG_FIELDS) {
    const el = $(id);
    config[id] = el.type === 'checkbox' ? el.checked : el.value;
  }
  storageSet(CONFIG_KEY_PREFIX + state.selected, JSON.stringify(config));
}

function restoreConfig(browserId) {
  let saved = {};
  try { saved = JSON.parse(storageGet(CONFIG_KEY_PREFIX + browserId) || '{}') || {}; } catch { /* corrupt entry */ }
  const config = { ...CONFIG_DEFAULTS };
  // Empty values (from older saves) fall back to the default first item
  for (const [key, value] of Object.entries(saved)) {
    if (value !== '' || key === 'prompt' || key === 'mediaFilter') config[key] = value;
  }
  for (const id of CONFIG_FIELDS) {
    const el = $(id);
    if (el.type === 'checkbox') el.checked = Boolean(config[id]);
    else if (id !== 'model') el.value = config[id];
  }
  if (!$('count').value) $('count').value = CONFIG_DEFAULTS.count;
  syncSegments();
  renderModelOptions(config.model);
}

/* ---------- Switch buttons & model dropdown ---------- */

const MODELS = {
  image: ['Nano Banana Pro', 'Nano Banana 2 Lite', 'Nano Banana 2.1'],
  video: ['Omni 1.1 Flash', 'Veo 3.1 - Lite', 'Veo 3.1 - Fast', 'Veo 3.1 - Quality'],
};

function syncSegments() {
  document.querySelectorAll('.segmented').forEach((group) => {
    const value = $(group.dataset.for).value;
    group.querySelectorAll('button').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.value === value));
    });
  });
}

// Model list follows the mode; falls back to the first model of that mode
function renderModelOptions(selected = $('model').value) {
  const select = $('model');
  const names = MODELS[$('mode').value] || MODELS.image;
  select.replaceChildren(...names.map((name) => new Option(name, name)));
  select.value = names.includes(selected) ? selected : names[0];
}

document.querySelectorAll('.segmented').forEach((group) => {
  group.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (!btn) return;
    const input = $(group.dataset.for);
    if (input.value === btn.dataset.value) return;
    input.value = btn.dataset.value;
    syncSegments();
    if (input.id === 'mode') renderModelOptions();
    saveConfig();
  });
});

syncSegments();
renderModelOptions();

for (const id of CONFIG_FIELDS) {
  $(id).addEventListener('input', saveConfig);
  $(id).addEventListener('change', saveConfig);
}

/* ---------- Browser tabs row ---------- */

function renderBrowserTabs() {
  const nav = $('browserTabs');
  nav.replaceChildren();

  for (const id of state.browsers) {
    const btn = document.createElement('button');
    btn.className = 'browser-tab';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(id === state.selected));
    btn.innerHTML = '<span class="dot"></span>';
    btn.append(`Browser ${id}`);
    btn.addEventListener('click', () => selectBrowser(id));
    nav.append(btn);
  }

  const refresh = document.createElement('button');
  refresh.className = 'browser-tab refresh';
  refresh.textContent = '↻ Refresh';
  refresh.addEventListener('click', loadBrowsers);
  nav.append(refresh);

  const hasBrowsers = state.browsers.length > 0;
  $('empty').hidden = hasBrowsers;
  $('panel').hidden = !hasBrowsers;
}

async function loadBrowsers() {
  const previous = state.selected;
  try {
    const list = await api('/api/browsers');
    state.browsers = (Array.isArray(list) ? list : []).sort((a, b) => Number(a) - Number(b));
    setStatus('ok', `Bridge connected · ${state.browsers.length} browser${state.browsers.length === 1 ? '' : 's'}`);
  } catch (err) {
    state.browsers = [];
    setStatus('bad', err.message);
  }

  if (!state.browsers.includes(state.selected)) {
    const last = storageGet(LAST_BROWSER_KEY);
    state.selected = state.browsers.includes(last) ? last : (state.browsers[0] ?? null);
    if (state.selected) restoreConfig(state.selected);
  }
  renderBrowserTabs();
  if (state.selected) {
    loadTabs();
    if (state.selected !== previous) loadMedia($('scanMedia'));
  }
}

function selectBrowser(id) {
  if (id === state.selected) return;
  state.selected = id;
  storageSet(LAST_BROWSER_KEY, id);
  restoreConfig(id);
  mediaItems = [];
  renderBrowserTabs();
  loadTabs();
  loadMedia($('scanMedia'));
}

/* ---------- Open tabs in selected browser ---------- */

async function loadTabs() {
  const list = $('tabList');
  list.innerHTML = '<li class="muted">Loading…</li>';
  try {
    const tabs = await action('list_tabs');
    list.replaceChildren();
    if (!Array.isArray(tabs) || tabs.length === 0) {
      list.innerHTML = '<li class="muted">No web tabs open.</li>';
      return;
    }
    for (const tab of tabs) {
      const li = document.createElement('li');
      const meta = document.createElement('div');
      meta.className = 'meta';
      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = tab.title || '(untitled)';
      const url = document.createElement('div');
      url.className = 'url';
      url.textContent = tab.url;
      meta.append(title, url);
      li.append(meta);
      if (tab.active) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'active';
        li.append(badge);
      }
      const use = document.createElement('button');
      use.className = 'btn ghost';
      use.textContent = 'Target';
      use.title = 'Use this tab\'s host as the prompt site';
      use.addEventListener('click', () => {
        try { $('site').value = new URL(tab.url).hostname; } catch { $('site').value = tab.url; }
        saveConfig();
      });
      li.append(use);
      list.append(li);
    }
  } catch (err) {
    list.replaceChildren();
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = err.message;
    list.append(li);
  }
}

/* ---------- Prompt / config ---------- */

function readConfigOptions() {
  const opts = {};
  if ($('mode').value) opts.mode = $('mode').value;
  if ($('aspect').value) opts.aspectRatio = $('aspect').value;
  if ($('count').value) opts.count = Number($('count').value);
  if ($('model').value.trim()) opts.model = $('model').value.trim();
  if ($('agent').value) opts.agent = $('agent').value === 'true';
  return opts;
}

$('promptForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = e.submitter;
  const prompt = $('prompt').value.trim();
  if (!prompt) return;
  const site = $('site').value.trim() || 'Google Flow';
  const options = readConfigOptions();

  await run(`send_prompt → Browser ${state.selected}`, async () => {
    if (Object.keys(options).length > 0) {
      const cfg = await action('flow_config', { options, site });
      log('flow_config', cfg);
    }
    return action('send_prompt', { prompt, site, autoSend: true });
  }, button);
});

/* ---------- Media list ---------- */

let mediaItems = [];

function renderMedia() {
  const grid = $('mediaList');
  const filter = $('mediaFilter').value;
  const items = filter ? mediaItems.filter((m) => m.type === filter) : mediaItems;
  $('mediaCount').textContent = mediaItems.length ? `(${items.length})` : '';
  grid.replaceChildren();

  if (items.length === 0) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = mediaItems.length ? 'No media of this type.' : 'No media found in the target tab.';
    grid.append(p);
    return;
  }

  for (const m of items) {
    const card = document.createElement('div');
    card.className = 'media-item';
    let preview;
    if (m.type === 'video') {
      preview = document.createElement('video');
      preview.src = m.url;
      preview.muted = true;
      preview.preload = 'metadata';
      preview.controls = true;
    } else if (m.type === 'audio') {
      preview = document.createElement('audio');
      preview.src = m.url;
      preview.preload = 'none';
      preview.controls = true;
    } else {
      preview = document.createElement('img');
      preview.src = m.url;
      preview.loading = 'lazy';
      preview.alt = m.name || '';
    }
    const link = document.createElement('a');
    link.className = 'name';
    link.href = m.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = m.name || m.url;
    link.title = m.url;
    const kind = document.createElement('span');
    kind.className = 'kind';
    kind.textContent = m.width && m.height ? `${m.type} · ${m.width}×${m.height}` : m.type;
    card.append(preview, link, kind);
    grid.append(card);
  }
}

async function loadMedia(button) {
  const browserId = state.selected;
  if (!browserId) return;
  const grid = $('mediaList');
  grid.innerHTML = '<p class="muted">Scanning…</p>';
  $('mediaCount').textContent = '';
  const data = await run(`scan_media → Browser ${browserId}`, () =>
    action('scan_media', { site: $('site').value.trim() || undefined }), button);
  // Ignore results if the user switched browser while scanning
  if (browserId !== state.selected) return;
  if (!data) {
    grid.innerHTML = '<p class="muted">Scan failed — see Output.</p>';
    return;
  }
  {
    mediaItems = Array.isArray(data.media) ? data.media : [];
    renderMedia();
  }
}

$('scanMedia').addEventListener('click', (e) => loadMedia(e.currentTarget));
$('mediaFilter').addEventListener('change', renderMedia);

/* ---------- Quick actions (mirror CLI commands) ---------- */

const QUICK = {
  image: () => action('flow_config', { options: { ...readConfigOptions(), mode: 'image', agent: false }, site: 'Google Flow' }),
  video: () => action('flow_config', { options: { ...readConfigOptions(), mode: 'video', agent: false }, site: 'Google Flow' }),
  detect: () => action('detect', { site: $('site').value.trim() || undefined }),
  state: () => action('flow_state'),
  'open-project': () => action('open_flow_project'),
  upscale: () => action('upscale_flow'),
};

document.querySelectorAll('[data-quick]').forEach((btn) => {
  btn.addEventListener('click', () => run(`${btn.dataset.quick} → Browser ${state.selected}`, QUICK[btn.dataset.quick], btn));
});

$('reloadTabs').addEventListener('click', loadTabs);
$('clearLog').addEventListener('click', () => $('log').replaceChildren());

loadBrowsers();
setInterval(async () => {
  // Poll for browsers connecting/disconnecting without disturbing the current view
  try {
    const list = await api('/api/browsers');
    const next = (Array.isArray(list) ? list : []).sort((a, b) => Number(a) - Number(b));
    if (next.join(',') !== state.browsers.join(',')) loadBrowsers();
  } catch {
    /* status updates on next manual refresh */
  }
}, 5000);
