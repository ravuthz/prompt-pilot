(function () {
  if (window.__promptPilotLoaded) return;
  window.__promptPilotLoaded = true;

  const adapters = [
    {
      name: 'Google Flow',
      host: /(^|\.)labs\.google$/,
      path: /\/fx\/tools\/flow/i,
      inputs: [
        '[data-slate-editor="true"][contenteditable="true"]',
        'textarea[placeholder*="describe" i]',
        'textarea[aria-label*="prompt" i]',
        'textarea',
        '[contenteditable="true"][role="textbox"]',
        '[contenteditable="true"]'
      ],
      sends: [
        'button[aria-label*="generate" i]',
        'button[aria-label*="create" i]',
        'button[type="submit"]'
      ]
    },
    { name: 'ChatGPT', host: /(^|\.)chatgpt\.com$/, inputs: ['#prompt-textarea', 'textarea[data-id="root"]'], sends: ['button[data-testid="send-button"]', 'button[aria-label*="Send"]'] },
    { name: 'Claude', host: /(^|\.)claude\.ai$/, inputs: ['div[contenteditable="true"][data-testid*="chat-input"]', 'div.ProseMirror[contenteditable="true"]'], sends: ['button[aria-label*="Send"]', 'button[data-testid*="send"]'] },
    { name: 'Gemini', host: /(^|\.)gemini\.google\.com$/, inputs: ['rich-textarea div[contenteditable="true"]', 'div[contenteditable="true"][role="textbox"]'], sends: ['button[aria-label*="Send message"]', 'button.send-button'] },
    { name: 'Perplexity', host: /(^|\.)perplexity\.ai$/, inputs: ['textarea[placeholder]', 'div[contenteditable="true"][role="textbox"]'], sends: ['button[aria-label*="Submit"]', 'button[aria-label*="Send"]'] },
    { name: 'Microsoft Copilot', host: /(^|\.)copilot\.microsoft\.com$/, inputs: ['textarea', 'div[contenteditable="true"][role="textbox"]'], sends: ['button[aria-label*="Submit"]', 'button[aria-label*="Send"]'] }
  ];

  const generic = {
    name: location.hostname,
    inputs: [
      'textarea[placeholder*="message" i]',
      'textarea[placeholder*="ask" i]',
      'textarea[placeholder*="prompt" i]',
      'div[contenteditable="true"][role="textbox"]'
    ],
    sends: [
      'button[type="submit"]',
      'button[aria-label*="send" i]',
      'button[title*="send" i]'
    ]
  };

  function adapter() {
    return adapters.find((item) => item.host.test(location.hostname) && (!item.path || item.path.test(location.pathname))) || generic;
  }

  function visible(element) {
    const box = element?.getBoundingClientRect();
    return Boolean(element && box && box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden');
  }

  function findVisible(selectors) {
    for (const selector of selectors) {
      const match = [...document.querySelectorAll(selector)].find(visible);
      if (match) return match;
    }
    return null;
  }

  function findSendButton(current) {
    if (current.name === 'Google Flow') {
      const flowButton = [...document.querySelectorAll('button')].find((button) => {
        if (!visible(button) || button.getAttribute('aria-haspopup')) return false;
        const icon = button.querySelector('.google-symbols');
        return icon?.textContent?.trim() === 'arrow_forward' && /create/i.test(button.textContent || '');
      });
      if (flowButton) return flowButton;
    }
    return findVisible(current.sends);
  }

  function setSlateValue(element, value) {
    element.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    const lastLeaf = [...element.querySelectorAll('[data-slate-leaf]')].at(-1);
    range.selectNodeContents(lastLeaf || element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);

    const transfer = new DataTransfer();
    transfer.setData('text/plain', value);
    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: transfer,
      bubbles: true,
      cancelable: true,
      composed: true
    });
    element.dispatchEvent(pasteEvent);
  }

  function focusComposer(element) {
    element.focus();
    if (!element.matches('[data-slate-editor="true"]')) return;
    const selection = window.getSelection();
    const range = document.createRange();
    const lastLeaf = [...element.querySelectorAll('[data-slate-leaf]')].at(-1);
    range.selectNodeContents(lastLeaf || element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function setComposerValue(element, value) {
    element.focus();
    if (element.matches('[data-slate-editor="true"]')) {
      setSlateValue(element, value);
      return true;
    }
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      element.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true,
        composed: true,
        cancelable: true,
        inputType: 'insertText',
        data: value
      }));
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
      element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: value }));
      element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Unidentified', bubbles: true, composed: true }));
      return true;
    }

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      composed: true,
      cancelable: true,
      inputType: 'insertText',
      data: value
    }));
    if (document.queryCommandSupported?.('insertText') && document.execCommand('insertText', false, value)) {
      element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      return true;
    }
    element.replaceChildren(document.createTextNode(value));
    element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: value }));
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    return true;
  }

  function composerValue(element) {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) return element.value.trim();
    if (element.matches('[data-slate-editor="true"]')) {
      const copy = element.cloneNode(true);
      copy.querySelectorAll('[data-slate-placeholder], [data-slate-zero-width]').forEach((node) => node.remove());
      return (copy.innerText || copy.textContent || '').trim();
    }
    return (element.innerText || element.textContent || '').trim();
  }

  async function waitForComposerValue(element, expected) {
    const normalize = (text) => text.replace(/\s+/g, ' ').trim();
    const wanted = normalize(expected);
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline) {
      const actual = normalize(composerValue(element));
      if (actual === wanted || actual.includes(wanted)) return true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  }

  async function waitForSendButton(current) {
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
      const button = findSendButton(current);
      if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true') return button;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return findSendButton(current);
  }

  async function send(prompt, autoSend) {
    const current = adapter();
    const input = findVisible(current.inputs);
    if (!input) return { ok: false, error: `No message box found on ${current.name}.` };
    setComposerValue(input, prompt);
    const inserted = await waitForComposerValue(input, prompt);
    if (!inserted) return { ok: false, error: `${current.name} did not accept the pasted prompt.` };
    await new Promise((resolve) => setTimeout(resolve, 350));
    if (!autoSend) return { ok: true };
    const button = await waitForSendButton(current);
    if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true') {
      button.click();
      return { ok: true };
    }
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    return { ok: true };
  }

  function mediaExtension(url, type) {
    try {
      const match = new URL(url, location.href).pathname.match(/\.([a-z0-9]{2,5})$/i);
      if (match) return match[1].toLowerCase();
    } catch {}
    return type === 'video' ? 'mp4' : 'jpg';
  }

  function scanMedia() {
    const found = new Map();
    const add = (url, type, width = 0, height = 0) => {
      if (!url || url.startsWith('data:image/svg') || found.has(url)) return;
      if (type === 'image' && width && height && (width < 240 || height < 120)) return;
      const index = found.size + 1;
      const extension = mediaExtension(url, type);
      found.set(url, { url, type, width, height, name: `flow-${type}-${String(index).padStart(3, '0')}.${extension}` });
    };

    document.querySelectorAll('video').forEach((video) => {
      add(video.currentSrc || video.src || video.querySelector('source')?.src, 'video', video.videoWidth, video.videoHeight);
      add(video.poster, 'image', video.clientWidth, video.clientHeight);
    });
    document.querySelectorAll('img').forEach((img) => add(img.currentSrc || img.src, 'image', img.naturalWidth, img.naturalHeight));
    document.querySelectorAll('[style]').forEach((element) => {
      const background = getComputedStyle(element).backgroundImage;
      const match = background?.match(/^url\(["']?(.*?)["']?\)$/);
      if (match) add(match[1], 'image', element.clientWidth, element.clientHeight);
    });
    return [...found.values()];
  }

  const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  function menuText(element) {
    return (element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function visibleMoreButton(root) {
    return [...root.querySelectorAll('button')].find((button) => {
      if (!visible(button)) return false;
      const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''} ${button.querySelector('.google-symbols')?.textContent || ''} ${menuText(button)}`.toLowerCase();
      return /more_vert|more_horiz|more actions|options|(^|\s)more(\s|$)|⋮/.test(label);
    });
  }

  function allMoreButtons() {
    return [...document.querySelectorAll('button')].filter((button) => {
      const icon = button.querySelector('.google-symbols')?.textContent?.trim().toLowerCase() || '';
      const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''} ${icon} ${menuText(button)}`.toLowerCase();
      return visible(button) && /more_vert|more_horiz|more actions|options|(^|\s)more(\s|$)|⋮/.test(label);
    });
  }

  function visibleMenuItem(predicate) {
    return [...document.querySelectorAll('[role="menuitem"], [data-radix-collection-item], button')]
      .find((element) => visible(element) && !element.hasAttribute('data-disabled') && element.getAttribute('aria-disabled') !== 'true' && predicate(menuText(element)));
  }

  async function upscaleFlowVideos() {
    if (adapter().name !== 'Google Flow') return { ok: false, error: '1080p upscaling is available only on Google Flow.' };
    const videos = [...document.querySelectorAll('video')].filter(visible);
    let completed = 0;
    const errors = [];
    const attempted = new Set();
    const globalMoreButtons = allMoreButtons();

    const processMoreButton = async (moreButton, index) => {
      if (!moreButton || attempted.has(moreButton)) return false;
      attempted.add(moreButton);
      moreButton.click();
      await delay(250);
      const downloadItem = visibleMenuItem((text) => /^download$/i.test(text));
      if (!downloadItem) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return false;
      }
      downloadItem.click();
      await delay(250);
      const upscaleItem = visibleMenuItem((text) => /^1080p\b/i.test(text) && /upscaled/i.test(text));
      if (!upscaleItem) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return false;
      }
      upscaleItem.click();
      await delay(400);
      return true;
    };

    for (let index = 0; index < videos.length; index += 1) {
      const video = videos[index];
      video.scrollIntoView({ block: 'center', behavior: 'auto' });
      let moreButton = null;
      let ancestor = video;
      for (let depth = 0; depth < 8 && ancestor; depth += 1, ancestor = ancestor.parentElement) {
        ['mouseover', 'mouseenter', 'mousemove'].forEach((type) => ancestor.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true, clientX: video.getBoundingClientRect().right - 8, clientY: video.getBoundingClientRect().top + 8 })));
        await delay(80);
        moreButton = visibleMoreButton(ancestor);
        if (moreButton) break;
      }
      const candidates = [moreButton, ...globalMoreButtons, ...allMoreButtons()].filter(Boolean);
      let success = false;
      for (const candidate of candidates) {
        if (await processMoreButton(candidate, index)) {
          success = true;
          completed += 1;
          break;
        }
      }
      if (!success) errors.push(`video ${index + 1}: More → Download → 1080p Upscaled was not completed`);
    }
    return { ok: videos.length > 0, total: videos.length, completed, errors, error: videos.length ? undefined : 'No visible videos found. Scroll through the Flow gallery first.' };
  }

  function responseIsBusy() {
    const selectors = [
      'button[data-testid*="stop" i]',
      'button[aria-label*="stop" i]',
      'button[title*="stop" i]',
      'button[aria-label*="cancel response" i]',
      'button[aria-label*="cancel generation" i]'
    ];
    if (findVisible(selectors)) return true;
    return [...document.querySelectorAll('button')].some((button) => {
      if (!visible(button)) return false;
      const iconText = button.querySelector('.google-symbols')?.textContent?.trim().toLowerCase();
      return iconText === 'stop' || iconText === 'cancel';
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'PROMPT_PILOT_DETECT') {
      sendResponse({ site: adapter().name });
      return;
    }
    if (message.type === 'PROMPT_PILOT_SEND') {
      send(message.prompt, message.autoSend).then(sendResponse);
      return true;
    }
    if (message.type === 'PROMPT_PILOT_FOCUS') {
      const current = adapter();
      const input = findVisible(current.inputs);
      if (!input) {
        sendResponse({ ok: false, error: `No message box found on ${current.name}.` });
        return;
      }
      focusComposer(input);
      sendResponse({ ok: true });
      return;
    }
    if (message.type === 'PROMPT_PILOT_SUBMIT') {
      const current = adapter();
      const input = findVisible(current.inputs);
      if (!input || !composerValue(input)) {
        sendResponse({ ok: false, error: 'Google Flow did not register the typed prompt.' });
        return;
      }
      waitForSendButton(current).then((button) => {
        if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') {
          sendResponse({ ok: false, error: 'Google Flow kept the Create button disabled.' });
          return;
        }
        button.click();
        sendResponse({ ok: true });
      });
      return true;
    }
    if (message.type === 'PROMPT_PILOT_SCAN_MEDIA') {
      sendResponse({ media: scanMedia() });
      return;
    }
    if (message.type === 'PROMPT_PILOT_UPSCALE_FLOW') {
      upscaleFlowVideos().then(sendResponse);
      return true;
    }
    if (message.type === 'PROMPT_PILOT_RESPONSE_STATE') {
      sendResponse({ busy: responseIsBusy() });
      return;
    }
    if (message.type === 'PROMPT_PILOT_DOWNLOAD_BLOB') {
      try {
        const link = document.createElement('a');
        link.href = message.item.url;
        link.download = message.item.name;
        link.hidden = true;
        document.body.append(link);
        link.click();
        link.remove();
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
      return;
    }
  });
})();
