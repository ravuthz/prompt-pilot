(function () {
  if (window.__promptPilotLoaded) return;
  window.__promptPilotLoaded = true;

  const adapters = [
    {
      name: 'Google Flow',
      match: (host, path) => {
        const h = host.toLowerCase();
        if (h === 'flow.google' || h === 'flow.google.com' || h.endsWith('.flow.google') || h.endsWith('.flow.google.com')) return true;
        if (/(^|\.)labs\.google$/i.test(h) && /\/fx\/tools\/flow/i.test(path)) return true;
        return false;
      },
      inputs: [
        '[data-slate-editor="true"][contenteditable="true"]',
        '[data-slate-editor="true"]',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]',
        '[contenteditable="true"][role="textbox"]',
        '[contenteditable="true"]',
        'textarea[placeholder*="describe" i]',
        'textarea[placeholder*="prompt" i]',
        'textarea[aria-label*="prompt" i]',
        'textarea[aria-label*="describe" i]',
        'textarea',
        'input[type="text"][placeholder*="prompt" i]',
        'input[type="text"][placeholder*="describe" i]',
        'input[type="text"]'
      ],
      sends: [
        'button[aria-label*="generate" i]',
        'button[aria-label*="create" i]',
        'button[aria-label*="submit" i]',
        'button[aria-label*="send" i]',
        'button[type="submit"]'
      ]
    },
    {
      name: 'Flow Music',
      host: /(^|\.)flowmusic\.app$/,
      inputs: [
        'textarea[placeholder*="describe" i]',
        'textarea[placeholder*="lyrics" i]',
        'textarea[placeholder*="message" i]',
        'textarea[placeholder*="prompt" i]',
        'textarea',
        '[contenteditable="true"][role="textbox"]',
        '[contenteditable="true"]'
      ],
      sends: [
        'button[type="submit"]',
        'button[aria-label*="send" i]',
        'button[aria-label*="generate" i]',
        'button[aria-label*="create" i]',
        'button[title*="send" i]'
      ]
    },
    { name: 'ChatGPT', host: /(^|\.)(chatgpt\.com|openai\.com)$/, inputs: ['#prompt-textarea', 'textarea[data-id="root"]', 'div[contenteditable="true"]#prompt-textarea', 'textarea'], sends: ['button[data-testid="send-button"]', 'button[aria-label*="Send"]', 'button[data-testid*="send"]'] },
    { name: 'Claude', host: /(^|\.)claude\.ai$/, inputs: ['div[contenteditable="true"][data-testid*="chat-input"]', 'div.ProseMirror[contenteditable="true"]', 'div[contenteditable="true"]'], sends: ['button[aria-label*="Send"]', 'button[data-testid*="send"]', 'button[aria-label*="Send message"]'] },
    { name: 'Gemini', host: /(^|\.)gemini\.google\.com$/, inputs: ['rich-textarea div[contenteditable="true"]', 'div[contenteditable="true"][role="textbox"]', 'div[contenteditable="true"]'], sends: ['button[aria-label*="Send message"]', 'button.send-button', 'button[aria-label*="Submit"]'] },
    { name: 'Grok', match: (host, path) => /(^|\.)grok\.com$/i.test(host) || (/(^|\.)(x|twitter)\.com$/i.test(host) && /\/i\/grok/i.test(path)), inputs: ['textarea[placeholder*="Ask" i]', 'textarea[placeholder*="Grok" i]', 'div[contenteditable="true"]', 'textarea'], sends: ['button[aria-label*="Grok" i]', 'button[aria-label*="Submit" i]', 'button[aria-label*="Send" i]', 'button[type="submit"]'] },
    { name: 'Perplexity', host: /(^|\.)perplexity\.ai$/, inputs: ['textarea[placeholder]', 'div[contenteditable="true"][role="textbox"]', 'textarea'], sends: ['button[aria-label*="Submit"]', 'button[aria-label*="Send"]', 'button[type="submit"]'] },
    { name: 'Microsoft Copilot', host: /(^|\.)copilot\.microsoft\.com$/, inputs: ['textarea', 'div[contenteditable="true"][role="textbox"]', 'div[contenteditable="true"]'], sends: ['button[aria-label*="Submit"]', 'button[aria-label*="Send"]', 'button[type="submit"]'] }
  ];

  const generic = {
    name: location.hostname,
    inputs: [
      '[data-slate-editor="true"][contenteditable="true"]',
      '[data-slate-editor="true"]',
      'textarea[placeholder*="describe" i]',
      'textarea[placeholder*="message" i]',
      'textarea[placeholder*="ask" i]',
      'textarea[placeholder*="prompt" i]',
      'textarea',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"]'
    ],
    sends: [
      'button[aria-label*="send" i]',
      'button[aria-label*="generate" i]',
      'button[aria-label*="create" i]',
      'button[aria-label*="submit" i]',
      'button[type="submit"]',
      'button[title*="send" i]'
    ]
  };

  function adapter() {
    const host = location.hostname;
    const path = location.pathname;
    return adapters.find((item) => {
      if (typeof item.match === 'function') return item.match(host, path);
      return item.host?.test(host) && (!item.path || item.path.test(path));
    }) || generic;
  }

  function visible(element) {
    if (!element) return false;
    const box = element.getBoundingClientRect?.();
    const style = window.getComputedStyle?.(element);
    if (style && (style.visibility === 'hidden' || style.display === 'none')) return false;
    if (box && (box.width > 0 || box.height > 0)) return true;
    if (element.offsetWidth > 0 || element.offsetHeight > 0) return true;
    if (element.getClientRects && element.getClientRects().length > 0) return true;
    return Boolean(box && box.width > 0 && box.height > 0);
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
        const icon = button.querySelector('.google-symbols, svg, [class*="icon" i]');
        const iconText = icon?.textContent?.trim()?.toLowerCase();
        const text = (button.textContent || '').trim();
        const ariaLabel = button.getAttribute('aria-label') || '';
        if (iconText === 'arrow_forward' && /create|generate|send/i.test(text)) return true;
        if (/^(create|generate|send|run)$/i.test(text)) return true;
        if (/^(create|generate|send|submit)/i.test(ariaLabel)) return true;
        return false;
      });
      if (flowButton) return flowButton;
    }
    return findVisible(current.sends);
  }

  function getSlateEditor(element) {
    if (!element) return null;
    if (element.matches?.('[data-slate-editor="true"]')) return element;
    return element.querySelector?.('[data-slate-editor="true"]') || element.closest?.('[data-slate-editor="true"]') || null;
  }

  function setSlateValue(element, value) {
    const slate = getSlateEditor(element) || element;
    slate.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    const lastLeaf = [...slate.querySelectorAll('[data-slate-leaf]')].at(-1);
    range.selectNodeContents(lastLeaf || slate);
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
    slate.dispatchEvent(pasteEvent);
  }

  function focusComposer(element) {
    const slate = getSlateEditor(element);
    const target = slate || element;
    target.focus();
    if (slate || target.getAttribute('contenteditable') === 'true' || target.isContentEditable) {
      const selection = window.getSelection();
      const range = document.createRange();
      const lastLeaf = [...target.querySelectorAll('[data-slate-leaf]')].at(-1);
      range.selectNodeContents(lastLeaf || target);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  function setComposerValue(element, value) {
    const slate = getSlateEditor(element);
    if (slate) {
      setSlateValue(slate, value);
      return true;
    }
    element.focus();
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
    if (!element) return '';
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) return element.value.trim();
    const slate = getSlateEditor(element);
    if (slate) {
      const copy = slate.cloneNode(true);
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
    if (type === 'audio') return 'm4a';
    if (type === 'video') return 'mp4';
    return 'jpg';
  }

  function sanitizeFilename(name) {
    return (name || '').replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, ' ').trim();
  }

  function getVerticalPosition(element) {
    if (!element || typeof element.getBoundingClientRect !== 'function') return 0;
    try {
      const rect = element.getBoundingClientRect();
      const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
      return rect.top + scrollY;
    } catch {
      return 0;
    }
  }

  function scanMedia() {
    const isFlowMusic = location.hostname.includes('flowmusic.app');
    const sitePrefix = isFlowMusic ? 'flowmusic' : 'flow';

    // 1. Index Next.js Data Cache (__NEXT_DATA__)
    const nextDataScript = document.querySelector('script#__NEXT_DATA__');
    const clipsById = new Map();
    const clipsByUrl = new Map();
    const allClips = [];

    if (nextDataScript?.textContent) {
      try {
        const nextData = JSON.parse(nextDataScript.textContent);
        const traverse = (node) => {
          if (!node || typeof node !== 'object') return;
          if (node.id && (node.audio_url || node.wav_url || node.image_url || node.video_url)) {
            if (!clipsById.has(node.id)) {
              clipsById.set(node.id, node);
              allClips.push(node);
            }
            if (node.audio_url) clipsByUrl.set(node.audio_url, node);
            if (node.wav_url) clipsByUrl.set(node.wav_url, node);
            if (node.image_url) clipsByUrl.set(node.image_url, node);
            if (node.video_url) clipsByUrl.set(node.video_url, node);
          }
          for (const k of Object.keys(node)) {
            traverse(node[k]);
          }
        };
        traverse(nextData);
      } catch {}
    }

    const items = [];
    const addedUrls = new Set();
    let trackCounter = 0;

    const add = (rawUrl, type, width = 0, height = 0, customName = '', trackNum = null) => {
      if (!rawUrl || typeof rawUrl !== 'string') return;
      let url = rawUrl.trim();
      if (!url || url.startsWith('data:image/svg')) return;
      try {
        url = new URL(url, location.href).href;
      } catch {
        return;
      }
      if (url.includes('/embed/') || url.includes('/song/') || url.includes('/playlist/') || url.includes('/space/')) {
        if (!/\.(m4a|mp3|wav|ogg|flac|aac|opus|mp4|webm|mov|mkv|jpg|jpeg|png|webp|gif)($|\?)/i.test(url)) {
          return;
        }
      }
      if (addedUrls.has(url)) return;

      // Extract original image URL if Next.js image optimizer proxy URL
      if (url.includes('/_next/image?url=')) {
        try {
          const parsed = new URL(url);
          const orig = parsed.searchParams.get('url');
          if (orig) {
            add(orig, 'image', width, height, customName, trackNum);
            return;
          }
        } catch {}
      }

      if (type === 'image' && width && height && (width < 200 || height < 100)) return;

      addedUrls.add(url);
      const extension = mediaExtension(url, type);
      items.push({
        url,
        type,
        width,
        height,
        extension,
        customName: customName ? sanitizeFilename(customName) : '',
        trackNum: trackNum !== null ? trackNum : null
      });
    };

    const addClipMedia = (clip) => {
      if (!clip) return;
      trackCounter += 1;
      const title = clip.title ? sanitizeFilename(clip.title) : `Track-${trackCounter}`;
      if (clip.audio_url) add(clip.audio_url, 'audio', 0, 0, title, trackCounter);
      if (clip.wav_url) add(clip.wav_url, 'audio', 0, 0, title, trackCounter);
      if (clip.video_url) add(clip.video_url, 'video', 0, 0, title, trackCounter);
      if (clip.image_url) add(clip.image_url, 'image', 0, 0, title, trackCounter);
    };

    // 2. Scan DOM elements sorted from top to bottom
    const allDomElements = [
      ...document.querySelectorAll('a[href*="/song/"], video, audio, img, [style*="background-image"], a[href], [data-url], [data-src], [data-audio-url], [data-video-url], [data-clip-url]')
    ].sort((a, b) => getVerticalPosition(a) - getVerticalPosition(b));

    const seenClipIds = new Set();

    allDomElements.forEach((el) => {
      // Check for song links (e.g. /song/<uuid>)
      const href = el.getAttribute('href') || el.getAttribute('data-url') || '';
      const songMatch = href.match(/\/song\/([a-f0-9-]+)/i);
      if (songMatch) {
        const clipId = songMatch[1];
        if (!seenClipIds.has(clipId)) {
          seenClipIds.add(clipId);
          const clip = clipsById.get(clipId);
          if (clip) {
            addClipMedia(clip);
            return;
          }
        }
      }

      // Check for video element
      if (el.tagName === 'VIDEO') {
        const src = el.currentSrc || el.src || el.querySelector('source')?.src;
        if (src) {
          const clip = clipsByUrl.get(src);
          if (clip && !seenClipIds.has(clip.id)) {
            seenClipIds.add(clip.id);
            addClipMedia(clip);
          } else if (!addedUrls.has(src)) {
            trackCounter += 1;
            const base = src.split('/').pop().split('?')[0].replace(/\.[^.]+$/, '');
            add(src, 'video', el.videoWidth, el.videoHeight, base || 'video', trackCounter);
          }
        }
        if (el.poster) {
          add(el.poster, 'image', el.clientWidth, el.clientHeight);
        }
        return;
      }

      // Check for audio element
      if (el.tagName === 'AUDIO') {
        const src = el.currentSrc || el.src || el.querySelector('source')?.src;
        if (src) {
          const clip = clipsByUrl.get(src);
          if (clip && !seenClipIds.has(clip.id)) {
            seenClipIds.add(clip.id);
            addClipMedia(clip);
          } else if (!addedUrls.has(src)) {
            trackCounter += 1;
            const base = src.split('/').pop().split('?')[0].replace(/\.[^.]+$/, '');
            add(src, 'audio', 0, 0, base || 'audio', trackCounter);
          }
        }
        return;
      }

      // Check for image element
      if (el.tagName === 'IMG') {
        const src = el.currentSrc || el.src;
        const alt = el.getAttribute('alt') || '';
        if (src) {
          const clip = clipsByUrl.get(src);
          if (clip && !seenClipIds.has(clip.id)) {
            seenClipIds.add(clip.id);
            addClipMedia(clip);
          } else {
            add(src, 'image', el.naturalWidth || el.clientWidth, el.naturalHeight || el.clientHeight, alt && alt.length < 50 ? `${alt}.jpg` : '');
          }
        }
        return;
      }

      // Check for background image style
      if (el.hasAttribute('style')) {
        const bg = getComputedStyle(el).backgroundImage;
        const match = bg?.match(/^url\(["']?(.*?)["']?\)$/);
        if (match) {
          add(match[1], 'image', el.clientWidth, el.clientHeight);
        }
        return;
      }

      // Check for direct media link or data attributes
      const linkUrl = el.getAttribute('href') || el.getAttribute('data-url') || el.getAttribute('data-src') || el.getAttribute('data-audio-url') || el.getAttribute('data-video-url') || el.getAttribute('data-clip-url');
      if (linkUrl) {
        if (/\.(m4a|mp3|wav|ogg|flac|aac|opus)($|\?)/i.test(linkUrl) || linkUrl.includes('/clips/')) {
          const clip = clipsByUrl.get(linkUrl);
          if (clip && !seenClipIds.has(clip.id)) {
            seenClipIds.add(clip.id);
            addClipMedia(clip);
          } else {
            add(linkUrl, 'audio');
          }
        } else if (/\.(mp4|webm|mov|mkv)($|\?)/i.test(linkUrl)) {
          add(linkUrl, 'video');
        } else if (/\.(jpg|jpeg|png|webp|gif)($|\?)/i.test(linkUrl)) {
          add(linkUrl, 'image');
        }
      }
    });

    // 3. Open Graph and Twitter Meta Tags
    const metaSelectors = [
      { sel: 'meta[property="og:audio"], meta[property="og:audio:secure_url"], meta[name="twitter:audio"]', type: 'audio' },
      { sel: 'meta[property="og:video"], meta[property="og:video:url"], meta[property="og:video:secure_url"], meta[name="twitter:player:stream"]', type: 'video' },
      { sel: 'meta[property="og:image"], meta[property="og:image:secure_url"], meta[name="twitter:image"]', type: 'image' }
    ];
    for (const { sel, type } of metaSelectors) {
      document.querySelectorAll(sel).forEach((meta) => {
        const content = meta.getAttribute('content');
        if (content) {
          const clip = clipsByUrl.get(content);
          if (clip && !seenClipIds.has(clip.id)) {
            seenClipIds.add(clip.id);
            addClipMedia(clip);
          } else {
            add(content, type);
          }
        }
      });
    }

    // 4. Any remaining clips in __NEXT_DATA__ not yet discovered in DOM
    for (const clip of allClips) {
      if (clip.id && !seenClipIds.has(clip.id)) {
        seenClipIds.add(clip.id);
        addClipMedia(clip);
      }
    }

    // 5. Override file names with top-to-bottom sequence
    const totalOrdered = Math.max(trackCounter, items.length);
    const padLength = totalOrdered >= 100 ? 3 : 2;
    let fallbackCounter = 0;

    return items.map((item) => {
      const ext = item.extension;
      let finalName = '';
      if (item.trackNum !== null) {
        const numStr = String(item.trackNum).padStart(padLength, '0');
        finalName = `${numStr} - ${item.customName}.${ext}`;
      } else {
        fallbackCounter += 1;
        const numStr = String(trackCounter + fallbackCounter).padStart(padLength, '0');
        finalName = item.customName ? `${numStr} - ${item.customName}.${ext}` : `${numStr} - ${sitePrefix}-${item.type}.${ext}`;
      }

      return {
        url: item.url,
        type: item.type,
        width: item.width,
        height: item.height,
        name: finalName
      };
    });
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
        if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true') {
          button.click();
          sendResponse({ ok: true });
          return;
        }
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
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
