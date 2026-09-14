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
  favoritesTab: document.querySelector('#favoritesTab'),
  downloadsTab: document.querySelector('#downloadsTab'),
  queuePanel: document.querySelector('#queuePanel'),
  favoritesPanel: document.querySelector('#favoritesPanel'),
  downloadsPanel: document.querySelector('#downloadsPanel'),
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
  downloadMedia: document.querySelector('#downloadMediaBtn')
});

let stopped = false;
let running = false;
let paused = false;
let discoveredMedia = [];
let favorites = [];
let activeFavoriteGroup = 'GPT';
const FAVORITE_GROUP_ORDER = ['GPT', 'Gemini', 'Claude', 'Grok', 'Google Flow', 'Flow Music'];
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
  const favorite = panel === 'favorites';
  const downloads = panel === 'downloads';
  const queue = !favorite && !downloads;
  els.queuePanel.classList.toggle('hidden', !queue);
  els.queuePanel.classList.toggle('flex', queue);
  els.favoritesPanel.classList.toggle('hidden', !favorite);
  els.favoritesPanel.classList.toggle('flex', favorite);
  els.downloadsPanel.classList.toggle('hidden', !downloads);
  els.downloadsPanel.classList.toggle('flex', downloads);
  els.queueTab.classList.toggle('tab-active', queue);
  els.favoritesTab.classList.toggle('tab-active', favorite);
  els.downloadsTab.classList.toggle('tab-active', downloads);
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
  return host;
}

function cleanFavoriteTitle(title, group) {
  const cleaned = (title || '').replace(/\s+[-–|]\s+(ChatGPT|Gemini|Claude|Grok|Perplexity|Flow Music|Google Flow).*$/i, '').trim();
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
  if (!tab?.id || isRestrictedUrl(tab.url)) {
    throw new Error('Chrome internal pages cannot receive prompts. Open a web-based AI chat first.');
  }

  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (firstError) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      return await chrome.tabs.sendMessage(tab.id, message);
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

async function restore() {
  const saved = await chrome.storage.local.get(['prompts', 'separator', 'delay', 'autoSend', 'waitForResponse', 'favorites']);
  els.prompts.value = saved.prompts || '';
  els.separator.value = saved.separator || 'blank';
  els.delay.value = String(closestDelayIndex(Math.min(600, Math.max(3, Number(saved.delay) || 6))));
  els.autoSend.checked = saved.autoSend ?? true;
  els.waitForResponse.checked = saved.waitForResponse ?? false;
  favorites = Array.isArray(saved.favorites)
    ? saved.favorites.map((favorite) => ({ ...favorite, group: favorite.group === 'ChatGPT' ? 'GPT' : favorite.group }))
    : [];
  updateCount();
  updateDelayLabel();
  renderFavorites();
}

function save() {
  chrome.storage.local.set({
    prompts: els.prompts.value,
    separator: els.separator.value,
    delay: String(delaySeconds()),
    autoSend: els.autoSend.checked,
    waitForResponse: els.waitForResponse.checked
  });
  updateCount();
  updateDelayLabel();
}

['input', 'change'].forEach((eventName) => {
  els.prompts.addEventListener(eventName, save);
  els.separator.addEventListener(eventName, save);
  els.delay.addEventListener(eventName, save);
  els.autoSend.addEventListener(eventName, save);
  els.waitForResponse.addEventListener(eventName, save);
});
els.start.addEventListener('click', runQueue);
els.pause.addEventListener('click', () => {
  paused = !paused;
  els.pause.textContent = paused ? 'Resume' : 'Pause';
  els.status.textContent = paused ? 'Queue paused' : 'Queue resumed';
});
els.stop.addEventListener('click', () => { stopped = true; els.status.textContent = 'Stopping…'; });
els.queueTab.addEventListener('click', () => switchPanel('queue'));
els.favoritesTab.addEventListener('click', () => switchPanel('favorites'));
els.downloadsTab.addEventListener('click', () => switchPanel('downloads'));
els.saveFavorite.addEventListener('click', saveCurrentFavorite);
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
