const els = {
  prompts: document.querySelector('#prompts'),
  separator: document.querySelector('#separator'),
  delay: document.querySelector('#delay'),
  delayValue: document.querySelector('#delayValue'),
  autoSend: document.querySelector('#autoSend'),
  count: document.querySelector('#countBadge'),
  site: document.querySelector('#siteBadge'),
  status: document.querySelector('#statusText'),
  progress: document.querySelector('#progress'),
  progressLabel: document.querySelector('#progressLabel'),
  notice: document.querySelector('#notice'),
  start: document.querySelector('#startBtn'),
  stop: document.querySelector('#stopBtn')
};

Object.assign(els, {
  queueTab: document.querySelector('#queueTab'),
  downloadsTab: document.querySelector('#downloadsTab'),
  queuePanel: document.querySelector('#queuePanel'),
  downloadsPanel: document.querySelector('#downloadsPanel'),
  mediaType: document.querySelector('#mediaType'),
  mediaCount: document.querySelector('#mediaCount'),
  mediaList: document.querySelector('#mediaList'),
  emptyMedia: document.querySelector('#emptyMedia'),
  mediaNotice: document.querySelector('#mediaNotice'),
  scanMedia: document.querySelector('#scanMediaBtn'),
  toggleMedia: document.querySelector('#toggleMediaBtn'),
  downloadMedia: document.querySelector('#downloadMediaBtn')
});

let stopped = false;
let running = false;
let discoveredMedia = [];
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
  const downloads = panel === 'downloads';
  els.queuePanel.classList.toggle('hidden', downloads);
  els.queuePanel.classList.toggle('flex', !downloads);
  els.downloadsPanel.classList.toggle('hidden', !downloads);
  els.downloadsPanel.classList.toggle('flex', downloads);
  els.queueTab.classList.toggle('tab-active', !downloads);
  els.downloadsTab.classList.toggle('tab-active', downloads);
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
    meta.textContent = `${item.type}${item.width ? ` · ${item.width}×${item.height}` : ''}`;
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
  els.downloadMedia.textContent = selected ? `Download ${selected}` : 'Download selected';
  els.toggleMedia.textContent = selected === media.length && media.length ? 'Select none' : 'Select all';
}

async function scanMedia() {
  const tab = await activeTab();
  if (!isGoogleFlow(tab)) {
    showMediaNotice('Open a Google Flow project in the active tab first.', 'warning');
    return;
  }
  els.scanMedia.disabled = true;
  els.scanMedia.textContent = 'Scanning…';
  try {
    const response = await messageTab(tab, { type: 'PROMPT_PILOT_SCAN_MEDIA' });
    discoveredMedia = (response?.media || []).map((item) => ({ ...item, selected: true }));
    renderMedia();
    showMediaNotice(discoveredMedia.length ? `Found ${discoveredMedia.length} loaded media file${discoveredMedia.length === 1 ? '' : 's'}.` : 'No downloadable media was found. Scroll through the gallery and scan again.', discoveredMedia.length ? 'success' : 'info');
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

async function detectSite() {
  const tab = await activeTab();
  if (!tab?.id || !/^https?:/.test(tab.url || '')) {
    els.site.textContent = 'Open an AI chat';
    return;
  }
  try {
    const response = await messageTab(tab, { type: 'PROMPT_PILOT_DETECT' });
    els.site.textContent = response?.site || new URL(tab.url).hostname;
  } catch {
    els.site.textContent = new URL(tab.url).hostname;
  }
}

function setRunning(value) {
  running = value;
  els.start.disabled = value;
  els.stop.disabled = !value;
  els.prompts.disabled = value;
  els.separator.disabled = value;
  els.delay.disabled = value;
  els.autoSend.disabled = value;
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function isGoogleFlow(tab) {
  try {
    const url = new URL(tab.url);
    return url.hostname === 'labs.google' && /\/fx\/tools\/flow/i.test(url.pathname);
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
      if (index < prompts.length - 1) await wait(delaySeconds() * 1000);
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
  const saved = await chrome.storage.local.get(['prompts', 'separator', 'delay', 'autoSend']);
  els.prompts.value = saved.prompts || '';
  els.separator.value = saved.separator || 'blank';
  els.delay.value = String(closestDelayIndex(Math.min(600, Math.max(3, Number(saved.delay) || 6))));
  els.autoSend.checked = saved.autoSend ?? true;
  updateCount();
  updateDelayLabel();
  detectSite();
}

function save() {
  chrome.storage.local.set({
    prompts: els.prompts.value,
    separator: els.separator.value,
    delay: String(delaySeconds()),
    autoSend: els.autoSend.checked
  });
  updateCount();
  updateDelayLabel();
}

['input', 'change'].forEach((eventName) => {
  els.prompts.addEventListener(eventName, save);
  els.separator.addEventListener(eventName, save);
  els.delay.addEventListener(eventName, save);
  els.autoSend.addEventListener(eventName, save);
});
els.start.addEventListener('click', runQueue);
els.stop.addEventListener('click', () => { stopped = true; els.status.textContent = 'Stopping…'; });
els.queueTab.addEventListener('click', () => switchPanel('queue'));
els.downloadsTab.addEventListener('click', () => switchPanel('downloads'));
els.scanMedia.addEventListener('click', scanMedia);
els.mediaType.addEventListener('change', renderMedia);
els.toggleMedia.addEventListener('click', () => {
  const media = filteredMedia();
  const shouldSelect = !media.every((item) => item.selected);
  media.forEach((item) => { item.selected = shouldSelect; });
  renderMedia();
});
els.downloadMedia.addEventListener('click', downloadSelectedMedia);
chrome.tabs.onActivated.addListener(detectSite);
chrome.tabs.onUpdated.addListener((_tabId, info) => { if (info.status === 'complete') detectSite(); });
restore();
