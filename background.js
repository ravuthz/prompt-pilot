// Prompt Pilot - Background Service Worker with Local Bridge Client

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
});
const DEFAULT_BRIDGE_URL = 'wss://prompt-pilot.appkh.online';
let socket = null;
let reconnectTimer = null;
let isConnecting = false;

async function getBridgeConfig() {
  const stored = await chrome.storage.local.get(['promptPilotBridgeUrl', 'promptPilotBridgeToken']);
  return {
    url: stored.promptPilotBridgeUrl || DEFAULT_BRIDGE_URL,
    token: stored.promptPilotBridgeToken || ''
  };
}

// Stable per-profile id so the bridge can tell browsers apart across reconnects and restarts.
async function getBrowserIdentity() {
  const stored = await chrome.storage.local.get(['promptPilotBrowserId']);
  let id = stored.promptPilotBrowserId;
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    await chrome.storage.local.set({ promptPilotBrowserId: id });
  }
  return { id, name: await detectBrowserName() };
}

async function detectBrowserName() {
  if (await navigator.brave?.isBrave?.().catch(() => false)) return 'Brave';
  const brands = navigator.userAgentData?.brands?.map((b) => b.brand) || [];
  if (brands.includes('Microsoft Edge')) return 'Edge';
  if (brands.includes('Opera')) return 'Opera';
  if (brands.includes('Google Chrome')) return 'Chrome';
  return 'Chromium';
}

async function connectBridge() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  isConnecting = true;
  try {
    const config = await getBridgeConfig();
    const identity = await getBrowserIdentity();
    socket = new WebSocket(config.url);

    socket.onopen = async () => {
      isConnecting = false;
      console.log(`[PromptPilot Bridge] Connected to ${config.url}`);
      await chrome.storage.local.set({
        promptPilotBridgeConnected: true,
        promptPilotBridgeConnectedUrl: config.url,
        promptPilotBridgeLastConnected: Date.now()
      });
      socket.send(JSON.stringify({
        type: 'REGISTER',
        client: 'chrome-extension',
        token: config.token,
        browserId: identity.id,
        browserName: identity.name
      }));
    };
    socket.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type === 'PING') {
          socket.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
          return;
        }
        if (!payload || !payload.id || !payload.action) return;
        const result = await handleBridgeAction(payload.action, payload.params || {});
        socket.send(JSON.stringify({
          id: payload.id,
          success: true,
          data: result
        }));
      } catch (err) {
        try {
          const payload = JSON.parse(event.data);
          if (payload?.id && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
              id: payload.id,
              success: false,
              error: err?.message || String(err)
            }));
          }
        } catch {
          // ignore parsing error
        }
      }
    };

    socket.onclose = async () => {
      socket = null;
      isConnecting = false;
      await chrome.storage.local.set({ promptPilotBridgeConnected: false });
      scheduleReconnect();
    };

    socket.onerror = async () => {
      await chrome.storage.local.set({ promptPilotBridgeConnected: false });
      try { socket.close(); } catch {}
    };
  } catch (e) {
    isConnecting = false;
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectBridge();
  }, 3000);
}

// 1. Chrome alarms keep-alive (wakes the worker if sleeping)
chrome.alarms.create('promptPilotBridgeKeepAlive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'promptPilotBridgeKeepAlive') {
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      connectBridge();
    } else if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'PING' }));
    }
  }
});

// 2. Ensure bridge is active immediately and check on short interval
connectBridge();
setInterval(() => {
  if (!socket || socket.readyState === WebSocket.CLOSED) {
    connectBridge();
  } else if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'PING' }));
  }
}, 10000);
async function findTargetTab(siteFilter) {
  const tabs = await chrome.tabs.query({});
  const webTabs = tabs.filter(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('brave://') && !t.url.startsWith('edge://'));

  if (siteFilter) {
    const filter = String(siteFilter).toLowerCase();
    const matched = webTabs.find(t => (t.url || '').toLowerCase().includes(filter) || (t.title || '').toLowerCase().includes(filter));
    if (matched) return matched;
  }

  // Check any active tab in any window
  const active = webTabs.find(t => t.active);
  if (active) return active;

  // Fallback to flow.google or labs.google
  const flowTab = webTabs.find(t => /(flow\.google|labs\.google\/fx\/tools\/flow)/i.test(t.url || ''));
  if (flowTab) return flowTab;

  return webTabs[0] || null;
}

function isGoogleFlowUrl(urlStr) {
  try {
    const url = new URL(urlStr || '');
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'flow.google' || host === 'flow.google.com' || host.endsWith('.flow.google') || host.endsWith('.flow.google.com')) return true;
    if (host === 'labs.google' && /\/fx\/tools\/flow/i.test(url.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

// Tabs with a debugger session held open by a long-running action (e.g. upscale)
const debuggerTabs = new Set();

async function attachDebugger(tabId) {
  if (debuggerTabs.has(tabId)) return false;
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    debuggerTabs.add(tabId);
    return true;
  } catch {
    return false;
  }
}

async function detachDebugger(tabId) {
  debuggerTabs.delete(tabId);
  await chrome.debugger.detach({ tabId }).catch(() => {});
}

// Real (trusted) mouse input, so CSS :hover and hover-only controls actually appear
async function realMouse(tabId, { kind, x, y }) {
  const borrowed = debuggerTabs.has(tabId);
  if (!borrowed && !(await attachDebugger(tabId))) return { ok: false, error: 'Could not attach debugger' };
  const target = { tabId };
  try {
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', pointerType: 'mouse' });
    if (kind === 'click') {
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' });
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  } finally {
    if (!borrowed) await detachDebugger(tabId);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'PROMPT_PILOT_REAL_MOUSE' || !sender.tab?.id) return;
  realMouse(sender.tab.id, message).then(sendResponse);
  return true;
});

async function sendToGoogleFlow(tab, prompt, autoSend) {
  const focused = await sendToContentScript(tab.id, { type: 'PROMPT_PILOT_FOCUS' });
  if (!focused?.ok) throw new Error(focused?.error || 'Could not focus the Google Flow prompt editor.');

  const target = { tabId: tab.id };
  let attached = false;
  try {
    await chrome.debugger.attach(target, '1.3');
    attached = true;
    await chrome.debugger.sendCommand(target, 'Input.insertText', { text: prompt });

    if (autoSend) {
      await new Promise((r) => setTimeout(r, 400));
      // Dispatch real Enter key down/up events via Chrome Debugger
      await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
        macCharCode: 13,
        unmodifiedText: '\r',
        text: '\r',
        key: 'Enter',
        code: 'Enter'
      });
      await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
        macCharCode: 13,
        unmodifiedText: '\r',
        text: '\r',
        key: 'Enter',
        code: 'Enter'
      });
    }
  } catch (error) {
    throw new Error(`Google Flow requires browser-level typing: ${error.message}`);
  } finally {
    if (attached) await chrome.debugger.detach(target).catch(() => {});
  }

  await new Promise((r) => setTimeout(r, 400));
  if (!autoSend) return { ok: true, typedOnly: true };
  // Also fallback to triggering DOM button click via content script if Enter didn't submit
  return sendToContentScript(tab.id, { type: 'PROMPT_PILOT_SUBMIT' });
}
async function sendToContentScript(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    // Attempt re-injecting content.js
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    return await chrome.tabs.sendMessage(tabId, message);
  }
}

// Saves media through chrome.downloads so the browser's own session cookies apply.
async function downloadMediaItems(items) {
  const list = Array.isArray(items) ? items : [];
  const results = [];
  for (const item of list) {
    if (!item?.url || !item?.name) continue;
    if (item.url.startsWith('blob:')) {
      results.push({ url: item.url, name: item.name, ok: false, error: 'blob: URLs cannot be downloaded from the bridge' });
      continue;
    }
    try {
      const downloadId = await chrome.downloads.download({ url: item.url, filename: `Prompt-Pilot/${item.name}`, conflictAction: 'uniquify', saveAs: false });
      results.push({ url: item.url, name: item.name, ok: true, downloadId });
    } catch (err) {
      results.push({ url: item.url, name: item.name, ok: false, error: err?.message || String(err) });
    }
  }
  return { results };
}

async function handleBridgeAction(action, params) {
  if (action === 'download_media') {
    return downloadMediaItems(params.items);
  }

  if (action === 'list_tabs') {
    const tabs = await chrome.tabs.query({});
    return tabs
      .filter(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('brave://'))
      .map(t => ({ id: t.id, url: t.url, title: t.title, active: t.active, favIconUrl: t.favIconUrl }));
  }

  if (action === 'flow_account') {
    const tabs = await chrome.tabs.query({});
    const flowTab = tabs.find((t) => t.active && isGoogleFlowUrl(t.url)) || tabs.find((t) => isGoogleFlowUrl(t.url));
    if (!flowTab?.id) throw new Error('No Google Flow tab is open in this browser.');
    const resp = await sendToContentScript(flowTab.id, { type: 'PROMPT_PILOT_FLOW_ACCOUNT' });
    return { tabId: flowTab.id, url: flowTab.url, ...resp };
  }

  const tab = await findTargetTab(params.site);
  if (!tab || !tab.id) {
    throw new Error('No matching browser tab found.');
  }

  switch (action) {
    case 'detect': {
      const resp = await sendToContentScript(tab.id, { type: 'PROMPT_PILOT_DETECT' });
      return { tabId: tab.id, url: tab.url, title: tab.title, site: resp?.site || 'Unknown' };
    }

    case 'send_prompt': {
      if (!params.prompt) {
        throw new Error('prompt is required');
      }
      const autoSend = params.autoSend !== false;
      let resp;
      if (isGoogleFlowUrl(tab.url)) {
        resp = await sendToGoogleFlow(tab, params.prompt, autoSend);
      } else {
        resp = await sendToContentScript(tab.id, {
          type: 'PROMPT_PILOT_SEND',
          prompt: params.prompt,
          autoSend
        });
      }
      return { tabId: tab.id, url: tab.url, response: resp };
    }

    case 'scan_media': {
      const resp = await sendToContentScript(tab.id, { type: 'PROMPT_PILOT_SCAN_MEDIA' });
      return { tabId: tab.id, url: tab.url, media: resp?.media || [] };
    }

    case 'upscale_flow': {
      // Hold one debugger session for the whole run instead of attaching per mouse move
      const held = await attachDebugger(tab.id);
      try {
        const resp = await sendToContentScript(tab.id, { type: 'PROMPT_PILOT_UPSCALE_FLOW' });
        return { tabId: tab.id, response: resp };
      } finally {
        if (held) await detachDebugger(tab.id);
      }
    }

    case 'open_flow_project': {
      const resp = await sendToContentScript(tab.id, { type: 'PROMPT_PILOT_OPEN_FLOW_PROJECT' });
      return { tabId: tab.id, response: resp };
    }
    case 'flow_config': {
      const resp = await sendToContentScript(tab.id, {
        type: 'PROMPT_PILOT_FLOW_CONFIG',
        options: params.options || {}
      });
      return { tabId: tab.id, response: resp };
    }
    case 'flow_state': {
      const resp = await sendToContentScript(tab.id, { type: 'PROMPT_PILOT_FLOW_STATE' });
      return { tabId: tab.id, response: resp };
    }
    case 'response_state': {
      const resp = await sendToContentScript(tab.id, { type: 'PROMPT_PILOT_RESPONSE_STATE' });
      return { tabId: tab.id, busy: resp?.busy || false };
    }

    case 'list_tabs': {
      const tabs = await chrome.tabs.query({});
      return tabs
        .filter(t => t.url && !t.url.startsWith('chrome://'))
        .map(t => ({ id: t.id, url: t.url, title: t.title, active: t.active, favIconUrl: t.favIconUrl }));
    }

    default:
      throw new Error(`Unsupported action: ${action}`);
  }
}
