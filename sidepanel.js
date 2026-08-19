const els = {
  prompts: document.querySelector('#prompts'),
  separator: document.querySelector('#separator'),
  delay: document.querySelector('#delay'),
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

let stopped = false;
let running = false;

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
      if (index < prompts.length - 1) await wait(Number(els.delay.value) * 1000);
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
  els.delay.value = saved.delay || '5';
  els.autoSend.checked = saved.autoSend ?? true;
  updateCount();
  detectSite();
}

function save() {
  chrome.storage.local.set({
    prompts: els.prompts.value,
    separator: els.separator.value,
    delay: els.delay.value,
    autoSend: els.autoSend.checked
  });
  updateCount();
}

['input', 'change'].forEach((eventName) => {
  els.prompts.addEventListener(eventName, save);
  els.separator.addEventListener(eventName, save);
  els.delay.addEventListener(eventName, save);
  els.autoSend.addEventListener(eventName, save);
});
els.start.addEventListener('click', runQueue);
els.stop.addEventListener('click', () => { stopped = true; els.status.textContent = 'Stopping…'; });
chrome.tabs.onActivated.addListener(detectSite);
chrome.tabs.onUpdated.addListener((_tabId, info) => { if (info.status === 'complete') detectSite(); });
restore();
