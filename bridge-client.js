// Prompt Pilot Local Bridge Connection Handler (Works in Side Panel and Service Worker)

(function initBridge() {
  const BRIDGE_URL = 'wss://prompt-pilot.appkh.online';
  let socket = null;
  let reconnectTimer = null;

  function connect() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      socket = new WebSocket(BRIDGE_URL);

      socket.onopen = () => {
        console.log('[PromptPilot Bridge] Connected to wss://prompt-pilot.appkh.online');
        socket.send(JSON.stringify({ type: 'REGISTER', client: 'prompt-pilot-client' }));
      };

      socket.onmessage = async (event) => {
        let payload;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }

        if (!payload || !payload.id || !payload.action) return;

        try {
          const result = await executeAction(payload.action, payload.params || {});
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
              id: payload.id,
              success: true,
              data: result
            }));
          }
        } catch (err) {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
              id: payload.id,
              success: false,
              error: err?.message || String(err)
            }));
          }
        }
      };

      socket.onclose = () => {
        socket = null;
        scheduleReconnect();
      };

      socket.onerror = () => {
        try { socket.close(); } catch {}
      };
    } catch {
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 2000);
  }

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
    return sendToContentScript(tab.id, { type: 'PROMPT_PILOT_SUBMIT' });
  }
  async function sendToContentScript(tabId, message) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
      return await chrome.tabs.sendMessage(tabId, message);
    }
  }

  async function executeAction(action, params) {
    if (action === 'list_tabs') {
      const tabs = await chrome.tabs.query({});
      return tabs
        .filter(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('brave://'))
        .map(t => ({ id: t.id, url: t.url, title: t.title, active: t.active }));
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
        if (!params.prompt) throw new Error('prompt is required');
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

      case 'scan_media': {
        const resp = await sendToContentScript(tab.id, { type: 'PROMPT_PILOT_SCAN_MEDIA' });
        return { tabId: tab.id, url: tab.url, media: resp?.media || [] };
      }

      case 'upscale_flow': {
        const resp = await sendToContentScript(tab.id, { type: 'PROMPT_PILOT_UPSCALE_FLOW' });
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
          .map(t => ({ id: t.id, url: t.url, title: t.title, active: t.active }));
      }

      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  }

  // Connect immediately and keep alive
  connect();
  setInterval(() => {
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      connect();
    }
  }, 4000);
})();
