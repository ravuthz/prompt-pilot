const els = {
  prompts: document.querySelector('#prompts'),
  separator: document.querySelector('#separator'),
  delay: document.querySelector('#delay'),
  delayValue: document.querySelector('#delayValue'),
  autoSend: document.querySelector('#autoSend'),
  waitForResponse: document.querySelector('#waitForResponse'),
  count: document.querySelector('#countBadge'),
  status: document.querySelector('#statusText'),
  progress: document.querySelector('#progress'),
  progressLabel: document.querySelector('#progressLabel'),
  notice: document.querySelector('#notice'),
  start: document.querySelector('#startBtn'),
  pause: document.querySelector('#pauseBtn'),
  stop: document.querySelector('#stopBtn')
};

Object.assign(els, {
  queueTab: document.querySelector('#queueTab'),
  sunoTab: document.querySelector('#sunoTab'),
  favoritesTab: document.querySelector('#favoritesTab'),
  downloadsTab: document.querySelector('#downloadsTab'),
  queuePanel: document.querySelector('#queuePanel'),
  sunoPanel: document.querySelector('#sunoPanel'),
  favoritesPanel: document.querySelector('#favoritesPanel'),
  downloadsPanel: document.querySelector('#downloadsPanel'),
  sunoPrompts: document.querySelector('#sunoPrompts'),
  sunoCountBadge: document.querySelector('#sunoCountBadge'),
  sunoDelay: document.querySelector('#sunoDelay'),
  sunoDelayValue: document.querySelector('#sunoDelayValue'),
  sunoAutoCreate: document.querySelector('#sunoAutoCreate'),
  sunoStatusText: document.querySelector('#sunoStatusText'),
  sunoProgress: document.querySelector('#sunoProgress'),
  sunoProgressLabel: document.querySelector('#sunoProgressLabel'),
  sunoNotice: document.querySelector('#sunoNotice'),
  sunoStartBtn: document.querySelector('#sunoStartBtn'),
  sunoPauseBtn: document.querySelector('#sunoPauseBtn'),
  sunoStopBtn: document.querySelector('#sunoStopBtn'),
  favoriteCount: document.querySelector('#favoriteCount'),
  favoriteTypeTabs: document.querySelector('#favoriteTypeTabs'),
  favoriteGroups: document.querySelector('#favoriteGroups'),
  emptyFavorites: document.querySelector('#emptyFavorites'),
  favoriteNotice: document.querySelector('#favoriteNotice'),
  saveFavorite: document.querySelector('#saveFavoriteBtn'),
  mediaType: document.querySelector('#mediaType'),
  mediaCount: document.querySelector('#mediaCount'),
  mediaList: document.querySelector('#mediaList'),
  emptyMedia: document.querySelector('#emptyMedia'),
  mediaNotice: document.querySelector('#mediaNotice'),
  scanMedia: document.querySelector('#scanMediaBtn'),
  toggleMedia: document.querySelector('#toggleMediaBtn'),
  upscaleMedia: document.querySelector('#upscaleMediaBtn'),
  downloadMedia: document.querySelector('#downloadMediaBtn'),
  bridgeTab: document.querySelector('#bridgeTab'),
  bridgeStatusDot: document.querySelector('#bridgeStatusDot'),
  bridgePanel: document.querySelector('#bridgePanel'),
  bridgeConnectionStatus: document.querySelector('#bridgeConnectionStatus'),
  bridgeStatusBadge: document.querySelector('#bridgeStatusBadge'),
  bridgeUrlInput: document.querySelector('#bridgeUrlInput'),
  bridgeTokenInput: document.querySelector('#bridgeTokenInput'),
  bridgeNotice: document.querySelector('#bridgeNotice'),
  testBridgeConnectionBtn: document.querySelector('#testBridgeConnectionBtn'),
  saveBridgeConfigBtn: document.querySelector('#saveBridgeConfigBtn')
});

let stopped = false;
let running = false;
let paused = false;
let discoveredMedia = [];
let favorites = [];
let activeFavoriteGroup = 'GPT';
const FAVORITE_GROUP_ORDER = ['GPT', 'Gemini', 'Claude', 'Grok', 'Google Flow', 'Flow Music', 'Suno'];
const DELAY_VALUES = [
  ...Array.from({ length: 20 }, (_, index) => (index + 1) * 3),
  ...Array.from({ length: 18 }, (_, index) => 90 + index * 30)
];

function delaySeconds() {
  return DELAY_VALUES[Number(els.delay.value)] || 3;
}

function closestDelayIndex(seconds) {
  return DELAY_VALUES.reduce((bestIndex, value, index) =>
    Math.abs(value - seconds) < Math.abs(DELAY_VALUES[bestIndex] - seconds) ? index : bestIndex, 0);
}

function parsePrompts() {
  const text = els.prompts.value.trim();
  if (!text) return [];
  const mode = els.separator.value;
  const parts = mode === 'line'
    ? text.split(/\r?\n/)
    : mode === 'delimiter'
      ? text.split(/^\s*---+\s*$/m)
      : text.split(/(?:\r?\n){2,}/);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function updateCount() {
  const count = parsePrompts().length;
  els.count.textContent = `${count} prompt${count === 1 ? '' : 's'}`;
}

function formatDelay(totalSeconds) {
  const seconds = Number(totalSeconds);
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder
    ? `${minutes}m ${remainder}s`
    : `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

function updateDelayLabel() {
  els.delayValue.textContent = formatDelay(delaySeconds());
}

function showNotice(message, type = 'info') {
  const colorClass = {
    info: 'alert-info',
    success: 'alert-success',
    warning: 'alert-warning',
    error: 'alert-error'
  }[type] || 'alert-info';
  els.notice.className = `alert alert-soft ${colorClass} py-2.5 text-sm`;
  els.notice.textContent = message;
}

function hideNotice() {
  els.notice.classList.add('hidden');
}

function switchPanel(panel) {
  const suno = panel === 'suno';
  const favorite = panel === 'favorites';
  const downloads = panel === 'downloads';
  const bridge = panel === 'bridge';
  const queue = !suno && !favorite && !downloads && !bridge;

  if (els.queuePanel) els.queuePanel.className = queue ? 'prompt-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto' : 'prompt-scroll hidden min-h-0 flex-1 flex-col gap-3 overflow-y-auto';
  if (els.sunoPanel) els.sunoPanel.className = suno ? 'prompt-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto' : 'prompt-scroll hidden min-h-0 flex-1 flex-col gap-3 overflow-y-auto';
  if (els.favoritesPanel) els.favoritesPanel.className = favorite ? 'prompt-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto' : 'prompt-scroll hidden min-h-0 flex-1 flex-col gap-3 overflow-y-auto';
  if (els.downloadsPanel) els.downloadsPanel.className = downloads ? 'prompt-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto' : 'prompt-scroll hidden min-h-0 flex-1 flex-col gap-3 overflow-y-auto';
  if (els.bridgePanel) els.bridgePanel.className = bridge ? 'prompt-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto' : 'prompt-scroll hidden min-h-0 flex-1 flex-col gap-3 overflow-y-auto';

  els.queueTab?.classList.toggle('tab-active', queue);
  els.sunoTab?.classList.toggle('tab-active', suno);
  els.favoritesTab?.classList.toggle('tab-active', favorite);
  els.downloadsTab?.classList.toggle('tab-active', downloads);
  els.bridgeTab?.classList.toggle('tab-active', bridge);
}

async function updateBridgeStatus() {
  const data = await chrome.storage.local.get(['promptPilotBridgeConnected', 'promptPilotBridgeConnectedUrl', 'promptPilotBridgeLastConnected']);
  const isConnected = Boolean(data.promptPilotBridgeConnected);
  const url = data.promptPilotBridgeConnectedUrl || 'wss://prompt-pilot.appkh.online';

  if (els.bridgeStatusDot) {
    els.bridgeStatusDot.className = `absolute top-1.5 right-1.5 size-2 rounded-full ${isConnected ? 'bg-success' : 'bg-error'}`;
  }
  if (els.bridgeConnectionStatus) {
    els.bridgeConnectionStatus.textContent = isConnected ? `Connected to ${url}` : 'Disconnected / Reconnecting';
    els.bridgeConnectionStatus.className = `font-medium ${isConnected ? 'text-success' : 'text-error'}`;
  }
  if (els.bridgeStatusBadge) {
    els.bridgeStatusBadge.textContent = isConnected ? 'Online' : 'Offline';
    els.bridgeStatusBadge.className = `badge badge-sm ${isConnected ? 'badge-success' : 'badge-error'}`;
  }
}

function favoriteGroup(url) {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  if (host === 'chatgpt.com' || host.endsWith('.openai.com')) return 'GPT';
  if (host === 'gemini.google.com') return 'Gemini';
  if (host === 'claude.ai') return 'Claude';
  if (host === 'grok.com' || ((host === 'x.com' || host === 'twitter.com') && parsed.pathname.startsWith('/i/grok'))) return 'Grok';
  if (host === 'flowmusic.app' || host.endsWith('.flowmusic.app')) return 'Flow Music';
  if (host === 'perplexity.ai') return 'Perplexity';
  if (host === 'copilot.microsoft.com') return 'Microsoft Copilot';
  if (host === 'flow.google' || host === 'flow.google.com' || host.endsWith('.flow.google') || host.endsWith('.flow.google.com') || (host === 'labs.google' && parsed.pathname.includes('/fx/tools/flow'))) return 'Google Flow';
  if (host === 'suno.com' || host === 'suno.ai' || host.endsWith('.suno.com') || host.endsWith('.suno.ai')) return 'Suno';
  return host;
}

function cleanFavoriteTitle(title, group) {
  const cleaned = (title || '').replace(/\s+[-–|]\s+(ChatGPT|Gemini|Claude|Grok|Perplexity|Flow Music|Google Flow|Suno).*$/i, '').trim();
  return cleaned || `${group} chat`;
}

function showFavoriteNotice(message, type = 'info') {
  const color = { info: 'alert-info', success: 'alert-success', warning: 'alert-warning', error: 'alert-error' }[type];
  els.favoriteNotice.className = `alert alert-soft ${color} py-2.5 text-sm`;
  els.favoriteNotice.textContent = message;
}

async function persistFavorites() {
  await chrome.storage.local.set({ favorites });
}

async function removeFavorite(id) {
  favorites = favorites.filter((favorite) => favorite.id !== id);
  await persistFavorites();
  renderFavorites();
}

function renderFavorites() {
  els.favoriteTypeTabs.replaceChildren();
  els.favoriteGroups.replaceChildren();
  const extraGroups = [...new Set(favorites.map((favorite) => favorite.group))]
    .filter((group) => !FAVORITE_GROUP_ORDER.includes(group))
    .sort((a, b) => a.localeCompare(b));
  const groups = [...FAVORITE_GROUP_ORDER, ...extraGroups];
  if (!groups.includes(activeFavoriteGroup)) activeFavoriteGroup = 'GPT';

  groups.forEach((group) => {
    const count = favorites.filter((favorite) => favorite.group === group).length;
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.role = 'tab';
    tab.className = `tab shrink-0 gap-1 ${group === activeFavoriteGroup ? 'tab-active' : ''}`;
    tab.setAttribute('aria-selected', String(group === activeFavoriteGroup));
    tab.textContent = group;
    const badge = document.createElement('span');
    badge.className = 'badge badge-ghost badge-xs';
    badge.textContent = count;
    tab.append(badge);
    tab.addEventListener('click', () => {
      activeFavoriteGroup = group;
      renderFavorites();
    });
    els.favoriteTypeTabs.append(tab);
  });

  const items = favorites
    .filter((favorite) => favorite.group === activeFavoriteGroup)
    .sort((a, b) => b.savedAt - a.savedAt);
  const list = document.createElement('ul');
  list.className = 'list rounded-box border border-base-300 bg-base-200';
  items.forEach((favorite) => {
    const row = document.createElement('li');
    row.className = 'list-row items-center gap-2 px-3 py-2';
    const details = document.createElement('button');
    details.type = 'button';
    details.className = 'list-col-grow min-w-0 cursor-pointer text-left';
    details.addEventListener('click', () => chrome.tabs.create({ url: favorite.url }));
    const title = document.createElement('p');
    title.className = 'truncate text-sm font-medium';
    title.textContent = favorite.title;
    details.append(title);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-ghost btn-xs btn-square';
    remove.setAttribute('aria-label', `Remove ${favorite.title}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => removeFavorite(favorite.id));
    row.append(details, remove);
    list.append(row);
  });
  els.favoriteGroups.append(list);
  els.favoriteCount.textContent = `${favorites.length} Saved`;
  els.emptyFavorites.textContent = favorites.length
    ? `No ${activeFavoriteGroup} chats saved yet.`
    : 'No chats saved yet. Open an AI conversation and save the current page.';
  els.emptyFavorites.classList.toggle('hidden', items.length > 0);
  els.favoriteGroups.classList.toggle('hidden', items.length === 0);
}

async function saveCurrentFavorite() {
  const tab = await activeTab();
  if (!tab?.url || !/^https?:\/\//i.test(tab.url)) {
    showFavoriteNotice('Open an AI chat webpage before saving.', 'warning');
    return;
  }
  const group = favoriteGroup(tab.url);
  activeFavoriteGroup = group;
  const existing = favorites.find((favorite) => favorite.url === tab.url);
  if (existing) {
    existing.title = cleanFavoriteTitle(tab.title, group);
    existing.savedAt = Date.now();
    showFavoriteNotice('Updated the existing saved chat.', 'success');
  } else {
    favorites.push({ id: crypto.randomUUID(), title: cleanFavoriteTitle(tab.title, group), url: tab.url, group, savedAt: Date.now() });
    showFavoriteNotice(`Saved to ${group}.`, 'success');
  }
  await persistFavorites();
  renderFavorites();
}

function showMediaNotice(message, type = 'info') {
  const color = { info: 'alert-info', success: 'alert-success', warning: 'alert-warning', error: 'alert-error' }[type];
  els.mediaNotice.className = `alert alert-soft ${color} py-2.5 text-sm`;
  els.mediaNotice.textContent = message;
}

function filteredMedia() {
  return discoveredMedia.filter((item) => els.mediaType.value === 'all' || item.type === els.mediaType.value);
}

function renderMedia() {
  const media = filteredMedia();
  els.mediaList.replaceChildren();
  media.forEach((item) => {
    const row = document.createElement('li');
    row.className = 'list-row items-center gap-3 px-3 py-2';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'checkbox checkbox-sm';
    checkbox.checked = item.selected;
    checkbox.addEventListener('change', () => { item.selected = checkbox.checked; updateMediaActions(); });
    const details = document.createElement('div');
    details.className = 'min-w-0';
    const title = document.createElement('p');
    title.className = 'truncate text-sm font-medium';
    title.textContent = item.name;
    const meta = document.createElement('p');
    meta.className = 'text-xs opacity-55';
    const dimensions = item.width && item.height ? ` · ${item.width}×${item.height}` : '';
    meta.textContent = `${item.type}${dimensions}`;
    details.append(title, meta);
    row.append(checkbox, details);
    els.mediaList.append(row);
  });
  els.mediaCount.textContent = `${media.length} found`;
  els.emptyMedia.classList.toggle('hidden', media.length > 0);
  els.mediaList.classList.toggle('hidden', media.length === 0);
  updateMediaActions();
}

function updateMediaActions() {
  const media = filteredMedia();
  const selected = media.filter((item) => item.selected).length;
  els.toggleMedia.disabled = media.length === 0;
  els.downloadMedia.disabled = selected === 0;
  els.upscaleMedia.disabled = discoveredMedia.filter((item) => item.type === 'video').length === 0;
  els.downloadMedia.textContent = selected ? `Download ${selected}` : 'Download selected';
  els.toggleMedia.textContent = selected === media.length && media.length ? 'Select none' : 'Select all';
}

async function upscaleFlowMedia() {
  const tab = await activeTab();
  if (!isGoogleFlow(tab)) {
    showMediaNotice('Open a Google Flow project in the active tab first.', 'warning');
    return;
  }
  els.upscaleMedia.disabled = true;
  els.upscaleMedia.textContent = 'Upscaling…';
  try {
    const result = await messageTab(tab, { type: 'PROMPT_PILOT_UPSCALE_FLOW' });
    if (!result?.ok) throw new Error(result?.error || 'Flow could not upscale the videos.');
    showMediaNotice(`Selected 1080p Upscaled for ${result.completed} of ${result.total} video${result.total === 1 ? '' : 's'}.`, result.completed === result.total ? 'success' : 'warning');
  } catch (error) {
    showMediaNotice(error.message, 'error');
  } finally {
    els.upscaleMedia.textContent = 'Upscale 1080p';
    updateMediaActions();
  }
}

async function scanMedia() {
  const tab = await activeTab();
  if (!tab?.url || isRestrictedUrl(tab.url)) {
    showMediaNotice('Open Flow Music or Google Flow in the active tab first.', 'warning');
    return;
  }
  els.scanMedia.disabled = true;
  els.scanMedia.textContent = 'Scanning…';
  try {
    const response = await messageTab(tab, { type: 'PROMPT_PILOT_SCAN_MEDIA' });
    discoveredMedia = (response?.media || []).map((item) => ({ ...item, selected: true }));
    renderMedia();
    showMediaNotice(discoveredMedia.length ? `Found ${discoveredMedia.length} loaded media file${discoveredMedia.length === 1 ? '' : 's'}.` : 'No downloadable media was found. Scroll through the page or project and scan again.', discoveredMedia.length ? 'success' : 'info');
  } catch (error) {
    showMediaNotice(error.message, 'error');
  } finally {
    els.scanMedia.disabled = false;
    els.scanMedia.textContent = 'Scan project';
  }
}

async function downloadSelectedMedia() {
  const tab = await activeTab();
  const selected = filteredMedia().filter((item) => item.selected);
  if (!selected.length) return;
  els.downloadMedia.disabled = true;
  let completed = 0;
  for (const item of selected) {
    try {
      if (item.url.startsWith('blob:')) {
        const result = await messageTab(tab, { type: 'PROMPT_PILOT_DOWNLOAD_BLOB', item });
        if (!result?.ok) throw new Error(result?.error || 'Blob download failed');
      } else {
        await chrome.downloads.download({ url: item.url, filename: `Prompt-Pilot/${item.name}`, conflictAction: 'uniquify', saveAs: false });
      }
      completed += 1;
    } catch (error) {
      showMediaNotice(`Downloaded ${completed} of ${selected.length}. ${error.message}`, 'error');
      updateMediaActions();
      return;
    }
  }
  showMediaNotice(`Started ${completed} download${completed === 1 ? '' : 's'}.`, 'success');
  updateMediaActions();
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isRestrictedUrl(url = '') {
  return !/^https?:\/\//i.test(url);
}

async function messageTab(tab, message) {
  let targetTab = tab;
  let url = targetTab?.url || targetTab?.pendingUrl || '';

  if (!targetTab?.id || isRestrictedUrl(url)) {
    if (targetTab?.id) {
      try {
        const refreshed = await chrome.tabs.get(targetTab.id);
        if (refreshed) {
          targetTab = refreshed;
          url = targetTab.url || targetTab.pendingUrl || '';
        }
      } catch {}
    }
  }

  if (!targetTab?.id || isRestrictedUrl(url)) {
    throw new Error('Chrome internal pages cannot receive prompts. Open a web-based AI chat first.');
  }

  try {
    return await chrome.tabs.sendMessage(targetTab.id, message);
  } catch (firstError) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: targetTab.id }, files: ['content.js'] });
      return await chrome.tabs.sendMessage(targetTab.id, message);
    } catch (injectionError) {
      const detail = injectionError?.message || firstError?.message || 'Unknown connection error';
      throw new Error(`Could not connect to this page: ${detail}`);
    }
  }
}

function setRunning(value) {
  running = value;
  if (!value) paused = false;
  els.start.disabled = value;
  els.pause.disabled = !value;
  els.pause.textContent = 'Pause';
  els.stop.disabled = !value;
  els.prompts.disabled = value;
  els.separator.disabled = value;
  els.delay.disabled = value;
  els.autoSend.disabled = value;
  els.waitForResponse.disabled = value;
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitWhilePaused() {
  while (paused && !stopped) await wait(200);
}

async function waitInterruptibly(milliseconds) {
  let remaining = milliseconds;
  while (remaining > 0 && !stopped) {
    await waitWhilePaused();
    if (stopped) return;
    const slice = Math.min(250, remaining);
    await wait(slice);
    remaining -= slice;
  }
}

async function waitForResponseCompletion(tab) {
  const timeout = 30 * 60 * 1000;
  let activeElapsed = 0;
  let sawBusy = false;
  let idleChecks = 0;

  while (!stopped && activeElapsed < timeout) {
    await waitWhilePaused();
    if (stopped) return;
    const state = await messageTab(tab, { type: 'PROMPT_PILOT_RESPONSE_STATE' });
    if (state?.busy) {
      sawBusy = true;
      idleChecks = 0;
    } else if (sawBusy) {
      idleChecks += 1;
      if (idleChecks >= 2) return;
    } else if (activeElapsed >= 10000) {
      return;
    }
    await waitInterruptibly(1000);
    activeElapsed += 1000;
  }

  if (!stopped && activeElapsed >= timeout) {
    throw new Error('Timed out waiting for the previous response after 30 minutes.');
  }
}

function isGoogleFlow(tab) {
  try {
    const url = new URL(tab?.url || '');
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'flow.google' || host === 'flow.google.com' || host.endsWith('.flow.google') || host.endsWith('.flow.google.com')) return true;
    if (host === 'labs.google' && /\/fx\/tools\/flow/i.test(url.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

function isFlowMusic(tab) {
  try {
    const url = new URL(tab?.url || '');
    const host = url.hostname.replace(/^www\./, '');
    return host === 'flowmusic.app' || host.endsWith('.flowmusic.app');
  } catch {
    return false;
  }
}

async function sendToGoogleFlow(tab, prompt) {
  const focused = await messageTab(tab, { type: 'PROMPT_PILOT_FOCUS' });
  if (!focused?.ok) throw new Error(focused?.error || 'Could not focus the Google Flow prompt editor.');

  const target = { tabId: tab.id };
  let attached = false;
  try {
    await chrome.debugger.attach(target, '1.3');
    attached = true;
    await chrome.debugger.sendCommand(target, 'Input.insertText', { text: prompt });
  } catch (error) {
    throw new Error(`Google Flow requires browser-level typing: ${error.message}`);
  } finally {
    if (attached) await chrome.debugger.detach(target).catch(() => {});
  }

  await wait(500);
  if (!els.autoSend.checked) return { ok: true };
  return messageTab(tab, { type: 'PROMPT_PILOT_SUBMIT' });
}

async function sendPrompt(tab, prompt) {
  if (isGoogleFlow(tab)) return sendToGoogleFlow(tab, prompt);
  return messageTab(tab, {
    type: 'PROMPT_PILOT_SEND',
    prompt,
    autoSend: els.autoSend.checked
  });
}

async function runQueue() {
  if (running) return;
  const prompts = parsePrompts();
  if (!prompts.length) {
    showNotice('Paste at least one prompt before starting.', 'warning');
    return;
  }

  const tab = await activeTab();
  if (!tab?.id || !/^https?:/.test(tab.url || '')) {
    showNotice('Open a supported AI chat page in the active tab.', 'warning');
    return;
  }

  stopped = false;
  hideNotice();
  setRunning(true);
  els.progress.max = prompts.length;
  els.progress.value = 0;

  try {
    for (let index = 0; index < prompts.length; index += 1) {
      if (stopped) break;
      await waitWhilePaused();
      if (stopped) break;
      els.status.textContent = `Sending prompt ${index + 1} of ${prompts.length}`;
      els.progressLabel.textContent = `${index} / ${prompts.length}`;
      const result = await sendPrompt(tab, prompts[index]);
      if (!result?.ok) throw new Error(result?.error || 'Could not find the message box.');
      els.progress.value = index + 1;
      els.progressLabel.textContent = `${index + 1} / ${prompts.length}`;
      if (!els.autoSend.checked) {
        showNotice('Prompt pasted. Automatic send is off, so the queue paused.', 'info');
        stopped = true;
        break;
      }
      if (index < prompts.length - 1) {
        if (els.waitForResponse.checked) {
          els.status.textContent = `Waiting for response ${index + 1} to finish`;
          await waitForResponseCompletion(tab);
        } else {
          await waitInterruptibly(delaySeconds() * 1000);
        }
      }
    }

    if (stopped) {
      els.status.textContent = 'Queue stopped';
      if (!els.notice.textContent) showNotice('The queue was stopped.', 'info');
    } else {
      els.status.textContent = 'Queue complete';
      showNotice(`Sent ${prompts.length} prompt${prompts.length === 1 ? '' : 's'}.`, 'success');
    }
  } catch (error) {
    els.status.textContent = 'Queue paused';
    showNotice(`${error.message} Make sure the chat composer is visible and try again.`, 'error');
  } finally {
    setRunning(false);
  }
}

let sunoStopped = false;
let sunoRunning = false;
let sunoPaused = false;

function sunoDelaySeconds() {
  return DELAY_VALUES[Number(els.sunoDelay.value)] || 5;
}

function updateSunoDelayLabel() {
  els.sunoDelayValue.textContent = formatDelay(sunoDelaySeconds());
}

function showSunoNotice(message, type = 'info') {
  const colorClass = {
    info: 'alert-info',
    success: 'alert-success',
    warning: 'alert-warning',
    error: 'alert-error'
  }[type] || 'alert-info';
  els.sunoNotice.className = `alert alert-soft ${colorClass} py-2.5 text-sm`;
  els.sunoNotice.textContent = message;
}

function hideSunoNotice() {
  els.sunoNotice.classList.add('hidden');
}

function parseSongMetadata(text) {
  let styles = '';
  let gender = '';
  let title = '';

  const tagRegex = /@(styles?|gender|title|vocals?|voice|name)\s*:\s*(?:'([^']*)'|"([^"]*)"|((?:(?!@(styles?|gender|title|vocals?|voice|name)\b)[^\r\n])+))/gi;

  let match;
  while ((match = tagRegex.exec(text)) !== null) {
    const key = match[1].toLowerCase();
    let val = match[2] ?? match[3] ?? match[4] ?? '';
    val = val.replace(/[\s,;]+$/, '').trim();

    if (key === 'style' || key === 'styles') {
      styles = val;
    } else if (key === 'gender' || key === 'vocal' || key === 'vocals' || key === 'voice') {
      gender = val;
    } else if (key === 'title' || key === 'name') {
      title = val;
    }
  }

  const rawLyrics = text.replace(tagRegex, '');
  const lines = rawLyrics.split(/\r?\n/);
  const cleanedLines = [];
  for (const line of lines) {
    if (/^[\s,;]*$/.test(line)) {
      cleanedLines.push('');
    } else {
      cleanedLines.push(line.trimEnd());
    }
  }
  const lyrics = cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  return { styles, gender, title, lyrics };
}

function parseSunoSongs() {
  const text = els.sunoPrompts.value.trim();
  if (!text) return [];
  const chunks = text
    .split(/(?:^|\r?\n)\s*---+\s*(?:\r?\n|$)/)
    .map((c) => c.trim())
    .filter(Boolean);
  return chunks.map(parseSongMetadata);
}

function updateSunoCount() {
  const count = parseSunoSongs().length;
  els.sunoCountBadge.textContent = `${count} song${count === 1 ? '' : 's'}`;
}

function setSunoRunning(value) {
  sunoRunning = value;
  if (!value) sunoPaused = false;
  els.sunoStartBtn.disabled = value;
  els.sunoPauseBtn.disabled = !value;
  els.sunoPauseBtn.textContent = 'Pause';
  els.sunoStopBtn.disabled = !value;
  els.sunoPrompts.disabled = value;
  els.sunoDelay.disabled = value;
  els.sunoAutoCreate.disabled = value;
}

async function waitWhileSunoPaused() {
  while (sunoPaused && !sunoStopped) await wait(200);
}

async function waitSunoInterruptibly(milliseconds) {
  const interval = 100;
  let remaining = milliseconds;
  while (remaining > 0) {
    if (sunoStopped) return false;
    await waitWhileSunoPaused();
    if (sunoStopped) return false;
    const slice = Math.min(remaining, interval);
    await wait(slice);
    remaining -= slice;
  }
  return !sunoStopped;
}

async function waitForTabLoaded(tabId, timeoutMs = 30000) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab?.status === 'complete' && /^https?:\/\//i.test(tab.url || '')) {
      return tab;
    }
  } catch {}

  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(async () => {
      if (!resolved) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(listener);
        const finalTab = await chrome.tabs.get(tabId).catch(() => null);
        resolve(finalTab);
      }
    }, timeoutMs);

    async function listener(updatedTabId, changeInfo, tab) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        if (!resolved) {
          resolved = true;
          chrome.tabs.onUpdated.removeListener(listener);
          clearTimeout(timer);
          const finalTab = await chrome.tabs.get(tabId).catch(() => tab);
          resolve(finalTab);
        }
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function runSunoQueue() {
  const songs = parseSunoSongs();
  if (!songs.length) {
    showSunoNotice('Enter at least one Suno song separated by ---.', 'warning');
    return;
  }

  sunoStopped = false;
  sunoPaused = false;
  setSunoRunning(true);
  hideSunoNotice();

  els.sunoProgress.max = songs.length;
  els.sunoProgress.value = 0;
  els.sunoProgressLabel.textContent = `0 / ${songs.length}`;
  els.sunoStatusText.textContent = `Starting ${songs.length} Suno song${songs.length === 1 ? '' : 's'}…`;

  let completedCount = 0;

  try {
    for (let index = 0; index < songs.length; index += 1) {
      if (sunoStopped) break;
      await waitWhileSunoPaused();
      if (sunoStopped) break;

      const song = songs[index];
      const songLabel = song.title ? `"${song.title}"` : `Song ${index + 1}`;
      els.sunoStatusText.textContent = `Opening new tab for ${songLabel} (${index + 1}/${songs.length})…`;

      const newTab = await chrome.tabs.create({
        url: 'https://suno.com/create',
        active: true
      });

      els.sunoStatusText.textContent = `Loading Suno for ${songLabel}…`;
      const loadedTab = await waitForTabLoaded(newTab.id);
      const targetTab = loadedTab || await chrome.tabs.get(newTab.id).catch(() => newTab);

      await wait(2000);
      if (sunoStopped) break;
      await waitWhileSunoPaused();
      if (sunoStopped) break;

      els.sunoStatusText.textContent = `Populating fields for ${songLabel}…`;
      const autoCreate = els.sunoAutoCreate.checked;

      const result = await messageTab(targetTab, {
        type: 'PROMPT_PILOT_CREATE_SUNO',
        song,
        autoCreate
      });
      if (!result?.ok) {
        throw new Error(`Failed on ${songLabel}: ${result?.error || 'Unknown error'}`);
      }

      completedCount += 1;
      els.sunoProgress.value = completedCount;
      els.sunoProgressLabel.textContent = `${completedCount} / ${songs.length}`;

      const actionDesc = result.created ? 'Created' : 'Populated';
      els.sunoStatusText.textContent = `${actionDesc} ${songLabel} (${completedCount}/${songs.length})`;

      if (index < songs.length - 1) {
        const delaySec = sunoDelaySeconds();
        els.sunoStatusText.textContent = `Waiting ${formatDelay(delaySec)} before next tab…`;
        const ok = await waitSunoInterruptibly(delaySec * 1000);
        if (!ok) break;
      }
    }

    if (sunoStopped) {
      els.sunoStatusText.textContent = `Stopped at ${completedCount} of ${songs.length}`;
      showSunoNotice(`Queue stopped after ${completedCount} song${completedCount === 1 ? '' : 's'}.`, 'warning');
    } else {
      els.sunoStatusText.textContent = `Completed ${completedCount} of ${songs.length}`;
      showSunoNotice(`Successfully processed ${completedCount} Suno song${completedCount === 1 ? '' : 's'} across new tabs!`, 'success');
    }
  } catch (error) {
    els.sunoStatusText.textContent = 'Queue paused on error';
    showSunoNotice(`${error.message} Ensure you are logged into suno.com and try again.`, 'error');
  } finally {
    setSunoRunning(false);
  }
}

async function restore() {
  const saved = await chrome.storage.local.get([
    'prompts', 'separator', 'delay', 'autoSend', 'waitForResponse', 'favorites',
    'sunoPrompts', 'sunoDelay', 'sunoAutoCreate',
    'promptPilotBridgeUrl', 'promptPilotBridgeToken'
  ]);
  if (els.bridgeUrlInput) els.bridgeUrlInput.value = saved.promptPilotBridgeUrl || 'wss://prompt-pilot.appkh.online';
  if (els.bridgeTokenInput) els.bridgeTokenInput.value = saved.promptPilotBridgeToken || '';
  els.prompts.value = saved.prompts || '';
  els.waitForResponse.checked = saved.waitForResponse ?? false;
  favorites = Array.isArray(saved.favorites)
    ? saved.favorites.map((favorite) => ({ ...favorite, group: favorite.group === 'ChatGPT' ? 'GPT' : favorite.group }))
    : [];
  els.sunoPrompts.value = saved.sunoPrompts || '';
  els.sunoDelay.value = String(closestDelayIndex(Math.min(600, Math.max(3, Number(saved.sunoDelay) || 6))));
  els.sunoAutoCreate.checked = saved.sunoAutoCreate ?? true;
  updateCount();
  updateDelayLabel();
  updateSunoCount();
  updateSunoDelayLabel();
  renderFavorites();
}

function save() {
  chrome.storage.local.set({
    prompts: els.prompts.value,
    separator: els.separator.value,
    delay: String(delaySeconds()),
    autoSend: els.autoSend.checked,
    waitForResponse: els.waitForResponse.checked,
    sunoPrompts: els.sunoPrompts.value,
    sunoDelay: String(sunoDelaySeconds()),
    sunoAutoCreate: els.sunoAutoCreate.checked
  });
  updateCount();
  updateDelayLabel();
  updateSunoCount();
  updateSunoDelayLabel();
}

function saveBridgeSettings() {
  const url = els.bridgeUrlInput?.value.trim() || 'wss://prompt-pilot.appkh.online';
  const token = els.bridgeTokenInput?.value.trim() || '';
  chrome.storage.local.set({
    promptPilotBridgeUrl: url,
    promptPilotBridgeToken: token
  });
}
['input', 'change'].forEach((eventName) => {
  els.bridgeUrlInput?.addEventListener(eventName, saveBridgeSettings);
  els.bridgeTokenInput?.addEventListener(eventName, saveBridgeSettings);
  els.prompts.addEventListener(eventName, save);
  els.separator.addEventListener(eventName, save);
  els.delay.addEventListener(eventName, save);
  els.autoSend.addEventListener(eventName, save);
  els.waitForResponse.addEventListener(eventName, save);
  els.sunoPrompts.addEventListener(eventName, save);
  els.sunoDelay.addEventListener(eventName, save);
  els.sunoAutoCreate.addEventListener(eventName, save);
});
els.start.addEventListener('click', runQueue);
els.pause.addEventListener('click', () => {
  paused = !paused;
  els.pause.textContent = paused ? 'Resume' : 'Pause';
  els.status.textContent = paused ? 'Queue paused' : 'Queue resumed';
});
els.stop.addEventListener('click', () => { stopped = true; els.status.textContent = 'Stopping…'; });
els.sunoStartBtn.addEventListener('click', runSunoQueue);
els.sunoPauseBtn.addEventListener('click', () => {
  sunoPaused = !sunoPaused;
  els.sunoPauseBtn.textContent = sunoPaused ? 'Resume' : 'Pause';
  els.sunoStatusText.textContent = sunoPaused ? 'Queue paused' : 'Queue resumed';
});
els.sunoStopBtn.addEventListener('click', () => { sunoStopped = true; els.sunoStatusText.textContent = 'Stopping…'; });
els.sunoTab.addEventListener('click', () => switchPanel('suno'));
els.queueTab.addEventListener('click', () => switchPanel('queue'));
els.favoritesTab.addEventListener('click', () => switchPanel('favorites'));
els.downloadsTab.addEventListener('click', () => switchPanel('downloads'));
els.bridgeTab?.addEventListener('click', () => {
  switchPanel('bridge');
  chrome.storage.local.get(['promptPilotBridgeUrl', 'promptPilotBridgeToken']).then((stored) => {
    if (els.bridgeUrlInput) els.bridgeUrlInput.value = stored.promptPilotBridgeUrl || 'wss://prompt-pilot.appkh.online';
    if (els.bridgeTokenInput) els.bridgeTokenInput.value = stored.promptPilotBridgeToken || '';
  }).catch(() => {});
});
els.testBridgeConnectionBtn?.addEventListener('click', async () => {
  const url = els.bridgeUrlInput?.value.trim() || 'wss://prompt-pilot.appkh.online';
  const token = els.bridgeTokenInput?.value.trim() || '';

  if (els.bridgeNotice) {
    els.bridgeNotice.className = 'alert alert-soft alert-info py-2.5 text-sm';
    els.bridgeNotice.textContent = `Testing connection to ${url}...`;
    els.bridgeNotice.classList.remove('hidden');
  }

  try {
    const successMsg = await new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url);
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { ws.close(); } catch {}
        reject(new Error('Connection timed out after 5 seconds.'));
      }, 5000);
    ws.onopen = () => {
      // Send register to test token authentication
      ws.send(JSON.stringify({
        type: 'REGISTER',
        client: 'test-client',
        token: token || undefined
      }));
      // Send ping
      ws.send(JSON.stringify({ type: 'PING' }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.error) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try { ws.close(); } catch {}
          reject(new Error(msg.error));
          return;
        }
        if (msg.type === 'PONG') {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try { ws.close(); } catch {}
          resolve('Connected and authenticated successfully!');
        }
      } catch {
        settled = true;
        clearTimeout(timer);
        try { ws.close(); } catch {}
        resolve('Connected successfully!');
      }
    };

    ws.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      reject(new Error('Failed to establish WebSocket handshake. Check URL & network.'));
    };
  });

  if (els.bridgeNotice) {
    els.bridgeNotice.className = 'alert alert-soft alert-success py-2.5 text-sm';
    els.bridgeNotice.textContent = successMsg;
    els.bridgeNotice.classList.remove('hidden');
  }
  } catch (err) {
    const errorMsg = err?.message || String(err);
    if (els.bridgeNotice) {
      els.bridgeNotice.className = 'alert alert-soft alert-error py-2.5 text-sm';
      els.bridgeNotice.textContent = `Test failed: ${errorMsg}`;
      els.bridgeNotice.classList.remove('hidden');
    }
  }
});
els.saveBridgeConfigBtn?.addEventListener('click', async () => {
  const url = els.bridgeUrlInput?.value.trim() || 'wss://prompt-pilot.appkh.online';
  const token = els.bridgeTokenInput?.value.trim() || '';
  await chrome.storage.local.set({ promptPilotBridgeUrl: url, promptPilotBridgeToken: token });
  if (els.bridgeNotice) {
    els.bridgeNotice.className = 'alert alert-soft alert-success py-2.5 text-sm';
    els.bridgeNotice.textContent = 'Configuration saved. Reloading bridge connection...';
    els.bridgeNotice.classList.remove('hidden');
    setTimeout(() => els.bridgeNotice?.classList.add('hidden'), 3500);
  }
  // Ask background worker to reconnect
  chrome.runtime.reload();
});
els.scanMedia.addEventListener('click', scanMedia);
els.mediaType.addEventListener('change', renderMedia);
els.toggleMedia.addEventListener('click', () => {
  const media = filteredMedia();
  const shouldSelect = !media.every((item) => item.selected);
  media.forEach((item) => { item.selected = shouldSelect; });
  renderMedia();
});
els.upscaleMedia.addEventListener('click', upscaleFlowMedia);
els.downloadMedia.addEventListener('click', downloadSelectedMedia);
restore();
updateBridgeStatus();
setInterval(updateBridgeStatus, 3000);
