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
const CONFIG_FIELDS = ['prompt', 'site', 'mode', 'aspect', 'count', 'model', 'agent', 'technique', 'autoSend', 'mediaFilter'];
const CONFIG_DEFAULTS = {
  prompt: '', site: 'Google Flow', mode: 'image', aspect: '16:9', count: '1', model: '', agent: 'true',
  technique: '', autoSend: 'true', mediaFilter: '',
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
    if (value !== '' || key === 'prompt' || key === 'technique' || key === 'mediaFilter') config[key] = value;
  }
  for (const id of CONFIG_FIELDS) {
    const el = $(id);
    if (el.type === 'checkbox') el.checked = Boolean(config[id]);
    else if (id !== 'model') el.value = config[id];
  }
  // Techniques load async; loadTechniques re-applies this once options exist
  $('technique').dataset.want = config.technique;
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
  selectedMedia.clear();
  syncDownloadButton();
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

const site = () => $('site').value.trim() || 'Google Flow';

// Server applies settings, waits for Flow to settle, then sends (same as CLI `prompt`)
$('promptForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const prompt = $('prompt').value.trim();
  if (!prompt) return;
  await run(`send_prompt → Browser ${state.selected}`, () => api('/api/prompt', {
    prompt,
    ...readConfigOptions(),
    technique: $('technique').value || undefined,
    autoSend: $('autoSend').value !== 'false',
    site: site(),
    browser: state.selected,
  }), e.submitter);
});

/* ---------- Techniques (prompt presets) ---------- */

async function loadTechniques() {
  const select = $('technique');
  const saved = select.dataset.want ?? select.value;
  try {
    const list = await api('/api/techniques');
    const groups = {};
    for (const t of list) {
      if (!groups[t.category]) {
        groups[t.category] = document.createElement('optgroup');
        groups[t.category].label = t.category;
      }
      const opt = new Option(t.name, t.id);
      opt.title = t.phrase;
      groups[t.category].append(opt);
    }
    select.replaceChildren(new Option('None', ''), ...Object.values(groups));
    select.value = saved;
  } catch (err) {
    log('techniques', err.message, true);
  }
}

/* ---------- Generation queue (mirror CLI `generate` / MCP flow_generate) ---------- */

function parseScenes(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    const list = JSON.parse(trimmed);
    if (!Array.isArray(list)) throw new Error('Scenes JSON must be an array.');
    return list;
  }
  return trimmed.split('\n').map((line) => line.trim()).filter(Boolean).map((prompt) => ({ prompt }));
}

$('queueForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  let scenes;
  try {
    scenes = parseScenes($('scenes').value);
  } catch (err) {
    log('generate', err.message, true);
    return;
  }
  if (!scenes.length) return;
  const technique = $('technique').value || undefined;
  const base = { ...readConfigOptions(), technique };
  const timeout = Number($('timeout').value);
  const data = await run(`generate ${scenes.length} scene(s) → Browser ${state.selected}`, () => api('/api/generate', {
    scenes: scenes.map((scene) => ({ ...base, ...scene })),
    download: $('download').checked,
    folder: $('folder').value.trim() || undefined,
    timeoutSeconds: timeout > 0 ? timeout : undefined,
    site: site(),
    browser: state.selected,
  }), e.submitter);
  if (data) {
    $('scenes').value = '';
    loadJobs();
  }
});

let jobsTimer = null;

function jobDetail(job) {
  if (job.error) return job.error;
  if (job.progress) return job.progress;
  if (job.downloads.length) return job.downloads.map((d) => (d.ok ? d.name : `${d.name} (failed: ${d.error})`)).join(', ');
  if (job.status === 'done') return `${job.media.length} media item(s)${job.note ? ` · ${job.note}` : ''}`;
  return job.scene.prompt;
}

function renderJobs({ jobs, queue }) {
  const parts = ['running', 'queued', 'done', 'failed', 'cancelled'].filter((k) => queue[k]).map((k) => `${queue[k]} ${k}`);
  $('queueSummary').textContent = parts.length ? `(${parts.join(', ')})` : '';
  const list = $('jobList');
  list.replaceChildren();
  if (queue.pausedReason) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = queue.pausedReason;
    list.append(li);
  }
  for (const job of [...jobs].reverse()) {
    const li = document.createElement('li');
    const pill = document.createElement('span');
    pill.className = `pill ${job.status}`;
    pill.textContent = job.status;
    const meta = document.createElement('div');
    meta.className = 'meta';
    const stem = document.createElement('div');
    stem.className = 'stem';
    stem.textContent = job.stem;
    stem.title = job.scene.prompt;
    const detail = document.createElement('div');
    detail.className = `detail${job.error ? ' err' : ''}`;
    detail.textContent = jobDetail(job);
    detail.title = detail.textContent;
    meta.append(stem, detail);
    li.append(pill, meta);
    const jobAction = job.status === 'queued' ? 'cancel' : (job.status === 'failed' || job.status === 'cancelled') ? 'retry' : null;
    if (jobAction) {
      const btn = document.createElement('button');
      btn.className = 'btn ghost';
      btn.textContent = jobAction === 'cancel' ? 'Cancel' : 'Retry';
      btn.addEventListener('click', () => jobsCommand(jobAction, [job.id], btn));
      li.append(btn);
    }
    list.append(li);
  }
  return jobs.some((j) => j.status === 'queued' || j.status === 'running');
}

async function loadJobs() {
  clearTimeout(jobsTimer);
  try {
    const pending = renderJobs(await api('/api/jobs'));
    if (pending) jobsTimer = setTimeout(loadJobs, 3000);
  } catch (err) {
    $('queueSummary').textContent = `(${err.message})`;
  }
}

async function jobsCommand(kind, ids, button) {
  await run(`${kind} jobs`, () => api(`/api/jobs/${kind}`, ids ? { ids } : {}), button);
  loadJobs();
}

$('cancelQueued').addEventListener('click', (e) => jobsCommand('cancel', undefined, e.currentTarget));
$('retryFailed').addEventListener('click', (e) => jobsCommand('retry', undefined, e.currentTarget));

/* ---------- Media list ---------- */

let mediaItems = [];
const selectedMedia = new Set();

function syncDownloadButton() {
  const btn = $('downloadSelected');
  btn.disabled = selectedMedia.size === 0;
  btn.textContent = selectedMedia.size ? `Download selected (${selectedMedia.size})` : 'Download selected';
}

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
    const pick = document.createElement('input');
    pick.type = 'checkbox';
    pick.className = 'pick';
    pick.checked = selectedMedia.has(m.url);
    pick.setAttribute('aria-label', `Select ${m.name || m.url}`);
    pick.addEventListener('change', () => {
      if (pick.checked) selectedMedia.add(m.url); else selectedMedia.delete(m.url);
      syncDownloadButton();
    });
    card.append(preview, pick, link, kind);
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
  mediaItems = Array.isArray(data.media) ? data.media : [];
  const urls = new Set(mediaItems.map((m) => m.url));
  for (const url of selectedMedia) if (!urls.has(url)) selectedMedia.delete(url);
  syncDownloadButton();
  renderMedia();
}

// Mirrors CLI `download` / MCP flow_download: saves to Downloads/Prompt-Pilot/<folder>/
$('downloadSelected').addEventListener('click', (e) => run(`download ${selectedMedia.size} item(s) → Browser ${state.selected}`, () => api('/api/download', {
  urls: [...selectedMedia],
  name: $('mediaName').value.trim() || undefined,
  folder: $('mediaFolder').value.trim() || undefined,
  site: site(),
  browser: state.selected,
}), e.currentTarget));

$('selectAllMedia').addEventListener('click', () => {
  const filter = $('mediaFilter').value;
  const shown = filter ? mediaItems.filter((m) => m.type === filter) : mediaItems;
  const all = shown.length > 0 && shown.every((m) => selectedMedia.has(m.url));
  for (const m of shown) if (all) selectedMedia.delete(m.url); else selectedMedia.add(m.url);
  syncDownloadButton();
  renderMedia();
});

$('scanMedia').addEventListener('click', (e) => loadMedia(e.currentTarget));
$('mediaFilter').addEventListener('change', renderMedia);

/* ---------- Quick actions (mirror CLI commands) ---------- */

const QUICK = {
  image: () => action('flow_config', { options: { ...readConfigOptions(), mode: 'image', agent: false }, site: 'Google Flow' }),
  video: () => action('flow_config', { options: { ...readConfigOptions(), mode: 'video', agent: false }, site: 'Google Flow' }),
  status: async () => {
    const [browsers, flowState, jobs] = await Promise.all([
      api('/api/browsers'),
      action('flow_state', { site: site() }).catch((err) => ({ error: err.message })),
      api('/api/jobs'),
    ]);
    return { browsers, state: flowState, queue: jobs.queue };
  },
  detect: () => action('detect', { site: $('site').value.trim() || undefined }),
  state: () => action('flow_state'),
  'open-project': () => action('open_flow_project'),
  upscale: () => action('upscale_flow'),
};

document.querySelectorAll('[data-quick]').forEach((btn) => {
  btn.addEventListener('click', () => run(`${btn.dataset.quick} → Browser ${state.selected}`, QUICK[btn.dataset.quick], btn));
});

/* ---------- "Send prompt" | "Quick actions" tabs ---------- */

const PANEL_TAB_KEY = 'promptPilot.web.panelTab';

function selectPanelTab(tab) {
  document.querySelectorAll('.card-tabs [role="tab"]').forEach((t) => {
    const active = t === tab;
    t.setAttribute('aria-selected', String(active));
    $(t.getAttribute('aria-controls')).hidden = !active;
  });
  storageSet(PANEL_TAB_KEY, tab.id);
}

document.querySelectorAll('.card-tabs [role="tab"]').forEach((tab) => {
  tab.addEventListener('click', () => selectPanelTab(tab));
});
const savedPanelTab = $(storageGet(PANEL_TAB_KEY) || '');
if (savedPanelTab?.getAttribute('role') === 'tab') selectPanelTab(savedPanelTab);

$('reloadTabs').addEventListener('click', loadTabs);
$('clearLog').addEventListener('click', () => $('log').replaceChildren());

loadBrowsers();
loadTechniques();
loadJobs();
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
