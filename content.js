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
    { name: 'Microsoft Copilot', host: /(^|\.)copilot\.microsoft\.com$/, inputs: ['textarea', 'div[contenteditable="true"][role="textbox"]', 'div[contenteditable="true"]'], sends: ['button[aria-label*="Submit"]', 'button[aria-label*="Send"]', 'button[type="submit"]'] },
    {
      name: 'Suno',
      host: /(^|\.)suno\.(com|ai)$/,
      inputs: [
        'textarea[placeholder*="lyrics" i]',
        'textarea[placeholder*="write your own" i]',
        'textarea[placeholder*="enter your lyrics" i]',
        'textarea[placeholder*="style" i]',
        'textarea[placeholder*="prompt" i]',
        'textarea[placeholder*="describe" i]',
        'textarea',
        '[contenteditable="true"]'
      ],
      sends: [
        'button[aria-label*="create" i]',
        'button[type="submit"]'
      ]
    },
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
      // First search near the active input container
      const activeInput = findVisible(current.inputs);
      const container = activeInput?.closest('form, [class*="prompt" i], [class*="composer" i], [class*="input" i], div.relative') || document;
      const candidates = [...container.querySelectorAll('button, [role="button"]')].concat([...document.querySelectorAll('button, [role="button"]')]);

      const flowButton = candidates.find((button) => {
        if (!visible(button) || button.getAttribute('aria-haspopup')) return false;
        const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
        const title = (button.getAttribute('title') || '').toLowerCase();
        const text = (button.textContent || '').trim().toLowerCase();
        if (/close|menu|settings|more|help|account|back|delete|cancel|info|download/i.test(ariaLabel + ' ' + title + ' ' + text)) return false;

        const icon = button.querySelector('.google-symbols, svg, [class*="icon" i]');
        const iconText = icon?.textContent?.trim()?.toLowerCase() || '';

        if (iconText.includes('arrow_forward') || iconText.includes('send') || iconText.includes('spark') || iconText.includes('auto_awesome')) return true;
        if (/^(create|generate|send|run|submit)/i.test(text)) return true;
        if (/^(create|generate|send|submit|run)/i.test(ariaLabel)) return true;
        if (/^(create|generate|send|submit)/i.test(title)) return true;
        return false;
      });
      if (flowButton) return flowButton;
    }
    return findVisible(current.sends);
  }
  async function ensureFlowProject() {
    const current = adapter();
    if (current.name !== 'Google Flow') return true;

    // If input is already visible, project is ready
    const existingInput = findVisible(current.inputs);
    if (existingInput) return true;

    // Look for "New project", "Create project", "+" or project card in gallery
    const projectButtons = [...document.querySelectorAll('button, a, [role="button"]')].filter(visible);
    const newProjectBtn = projectButtons.find((el) => {
      const text = (el.textContent || '').trim().toLowerCase();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      return /new\s*project|create\s*project|start\s*creating/i.test(text) ||
             /new\s*project|create\s*project|start\s*creating/i.test(aria) ||
             el.querySelector('.google-symbols, svg')?.textContent?.includes('add');
    });

    if (newProjectBtn) {
      newProjectBtn.click();
      await delay(2000);
      return Boolean(findVisible(current.inputs));
    }

    // If no explicit "New Project" button, try clicking the first existing project tile/card
    const projectCard = document.querySelector('[data-project-id], [class*="project-card" i], a[href*="/project/"], [class*="gallery-item" i]');
    if (projectCard && visible(projectCard)) {
      projectCard.click();
      await delay(2000);
      return Boolean(findVisible(current.inputs));
    }

    return false;
  }

  function getFlowComposerRoot() {
    const current = adapter();
    const input = findVisible(current.inputs);
    return input?.closest('form, [class*="composer" i], [class*="prompt-box" i], [class*="prompt" i], div.relative') || document;
  }

  async function toggleFlowAgent(targetState) {
    const root = getFlowComposerRoot();
    const buttons = [...root.querySelectorAll('button, [role="button"], mat-button-toggle, [role="switch"]')].concat([...document.querySelectorAll('button, [role="button"], [role="switch"]')]).filter(visible);

    const agentBtn = buttons.find((btn) => {
      const text = (btn.textContent || '').trim().toLowerCase();
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
      const title = (btn.getAttribute('title') || '').toLowerCase();
      return /\bagent\b/i.test(text) || /\bagent\b/i.test(aria) || /\bagent\b/i.test(title);
    });

    if (!agentBtn) {
      return { ok: false, error: 'Could not find Agent button or toggle in Google Flow.' };
    }

    const isSelected = agentBtn.getAttribute('aria-pressed') === 'true' ||
                       agentBtn.getAttribute('aria-checked') === 'true' ||
                       agentBtn.classList.contains('mat-button-toggle-checked') ||
                       agentBtn.classList.contains('active') ||
                       agentBtn.classList.contains('selected');

    if (typeof targetState === 'boolean') {
      if (isSelected === targetState) {
        return { ok: true, agent: isSelected, changed: false };
      }
    }

    clickElement(agentBtn);
    await delay(300);

    const newState = agentBtn.getAttribute('aria-pressed') === 'true' ||
                     agentBtn.getAttribute('aria-checked') === 'true' ||
                     agentBtn.classList.contains('mat-button-toggle-checked') ||
                     agentBtn.classList.contains('active') ||
                     agentBtn.classList.contains('selected') ||
                     !isSelected;

    return { ok: true, agent: newState, changed: true };
  }

  async function selectFlowMode(mode) {
    const wanted = String(mode).toLowerCase(); // 'image' or 'video'
    if (!['image', 'video'].includes(wanted)) {
      return { ok: false, error: 'Mode must be either "image" or "video".' };
    }

    // Search inside the prompt box and settings overlay
    const candidates = [...document.querySelectorAll('flow-base-prompt-box button, .cdk-overlay-container button, .mat-mdc-menu-panel button, [role="tab"], mat-button-toggle, mat-chip')].filter(visible);
    const directBtn = candidates.find((btn) => {
      const text = (btn.textContent || '').trim().toLowerCase();
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
      return text === wanted || aria === wanted || text.startsWith(wanted) || aria.startsWith(wanted);
    });

    if (directBtn) {
      clickElement(directBtn);
      await delay(300);
      return { ok: true, mode: wanted };
    }

    return { ok: false, error: `Could not switch to mode "${mode}".` };
  }
  function findSettingsTrigger() {
    const promptBox = document.querySelector('flow-base-prompt-box');
    if (promptBox) {
      const btn = promptBox.querySelector('button.settings-trigger-button') ||
                  promptBox.querySelector('.submit-controls button:first-child');
      if (btn) return btn;
    }
    return document.querySelector('button.settings-trigger-button, button[aria-label="Settings trigger"]');
  }

  async function openFlowSettingsPanel() {
    const trigger = findSettingsTrigger();
    if (!trigger) return { ok: false, error: 'Could not find Settings Trigger button in flow-base-prompt-box.' };

    // Ensure trigger is focused and clicked directly
    trigger.scrollIntoView?.({ block: 'center', behavior: 'instant' });
    trigger.focus?.();
    trigger.click?.();

    // Also dispatch pointerdown/up to activate Material cdkoverlayorigin
    const opts = { bubbles: true, cancelable: true, composed: true, view: window };
    trigger.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1, isPrimary: true, button: 0 }));
    trigger.dispatchEvent(new MouseEvent('mousedown', { ...opts, button: 0 }));
    trigger.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1, isPrimary: true, button: 0 }));
    trigger.dispatchEvent(new MouseEvent('mouseup', { ...opts, button: 0 }));

    await delay(700);

    // Inspect whatever overlay panes have rendered
    const overlayPanes = [...document.querySelectorAll('.cdk-overlay-pane, .cdk-overlay-container, mat-dialog-container, [role="menu"], [role="dialog"]')];
    const overlayItems = overlayPanes.flatMap((pane) => {
      return [...pane.querySelectorAll('button, [role="menuitem"], [role="option"], mat-chip, mat-button-toggle, [role="radio"], [role="tab"], .mat-mdc-menu-item, span')];
    }).filter(visible).map((el) => {
      return {
        tag: el.tagName,
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50),
        aria: el.getAttribute('aria-label') || ''
      };
    }).filter((i) => i.text || i.aria);

    return { ok: true, triggerFound: true, paneCount: overlayPanes.length, overlayItems: overlayItems.slice(0, 50) };
  }
  async function closeFlowSettingsPanel() {
    // 1. Focus and click prompt input to dismiss settings popover
    const current = adapter();
    const input = findVisible(current.inputs);
    if (input) {
      focusComposer(input);
      clickElement(input);
      await delay(200);
    }

    // 2. Click backdrop if still present
    const backdrop = document.querySelector('.cdk-overlay-backdrop');
    if (backdrop) {
      clickElement(backdrop);
      await delay(200);
    }

    // 3. Fallback Escape event
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
    await delay(200);
  }

  async function selectOptionInSettingsPanel(labels, wantedValue) {
    const val = String(wantedValue).toLowerCase().replace(/\s+/g, '');

    // Gather all interactive elements inside the overlay / menu container
    const overlay = document.querySelector('.cdk-overlay-container') || document;
    const allControls = [...overlay.querySelectorAll('button, [role="button"], mat-button-toggle, mat-chip, [role="radio"], [role="tab"], [role="menuitem"], [role="option"], mat-option, li, div[role="button"]')].filter(visible);

    // 1. Exact or partial text match on buttons/chips/options
    const direct = allControls.find((el) => {
      const text = (el.textContent || '').trim().toLowerCase().replace(/\s+/g, '');
      const aria = (el.getAttribute('aria-label') || '').toLowerCase().replace(/\s+/g, '');
      return text === val || aria === val || text.includes(val) || aria.includes(val);
    });

    if (direct) {
      clickElement(direct);
      await delay(300);
      return true;
    }
    // 2. Look for section or submenu matching label keywords
    const sectionTrigger = allControls.find((el) => {
      const text = (el.textContent || '').trim().toLowerCase();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      return labels.some((lbl) => text.includes(lbl) || aria.includes(lbl));
    });

    if (sectionTrigger) {
      clickElement(sectionTrigger);
      await delay(300);
      const subOptions = [...document.querySelectorAll('.cdk-overlay-container [role="menuitem"], .cdk-overlay-container [role="option"], mat-option, .mat-mdc-menu-item')].filter(visible);
      const match = subOptions.find((opt) => {
        const text = (opt.textContent || '').trim().toLowerCase().replace(/\s+/g, '');
        const aria = (opt.getAttribute('aria-label') || '').toLowerCase().replace(/\s+/g, '');
        return text === val || aria === val || text.includes(val) || aria.includes(val);
      });
      if (match) {
        clickElement(match);
        await delay(300);
        return true;
      }
    }

    return false;
  }

  async function setFlowAspectRatio(ratio) {
    const cleaned = String(ratio).trim();
    // Match 16:9, 9:16, 1:1, or material icon names like crop_16_9, crop_9_16
    const iconName = 'crop_' + cleaned.replace(':', '_');
    const ok = await selectOptionInSettingsPanel(['aspect', 'ratio', 'crop', 'orientation'], cleaned) ||
               await selectOptionInSettingsPanel(['aspect', 'ratio', 'crop'], iconName);
    return { ok, aspectRatio: cleaned };
  }

  async function setFlowCount(count) {
    const num = Number(count);
    if (!num || num < 1) return { ok: false, error: 'Count must be a positive integer.' };
    const countStr = 'x' + num;
    const ok = await selectOptionInSettingsPanel(['count', 'number', 'outputs', 'batch', 'variations'], countStr) ||
               await selectOptionInSettingsPanel(['count', 'number', 'outputs'], String(num));
    return { ok, count: num };
  }

  async function selectFlowModel(modelName) {
    const name = String(modelName).trim();
    const val = name.toLowerCase().replace(/\s+/g, '');

    // Look for the "Select model family" trigger button
    const overlay = document.querySelector('.cdk-overlay-container') || document;
    const modelFamilyBtn = [...overlay.querySelectorAll('button')].find((b) => {
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      return aria.includes('select model family') || aria.includes('model family');
    });

    if (modelFamilyBtn) {
      clickElement(modelFamilyBtn);
      await delay(400);

      // Select the specific model from the dropdown menu
      const modelMenuItems = [...document.querySelectorAll('.cdk-overlay-container [role="menuitem"], .cdk-overlay-container [role="option"], mat-option, .mat-mdc-menu-item')].filter(visible);
      const match = modelMenuItems.find((item) => {
        const text = (item.textContent || '').trim().toLowerCase().replace(/\s+/g, '');
        return text.includes(val) || val.includes(text);
      });

      if (match) {
        clickElement(match);
        await delay(300);
        return { ok: true, model: name };
      }
    }

    const ok = await selectOptionInSettingsPanel(['select model family', 'model', 'banana', 'veo', 'imagen'], name);
    return { ok, model: name };
  }

  async function configureFlowSettings(options) {
    const results = {};
    if (options.agent !== undefined) {
      results.agent = await toggleFlowAgent(options.agent);
    }

    const needsPanel = options.mode || options.aspectRatio || options.count || options.model;
    if (needsPanel) {
      results.panel = await openFlowSettingsPanel();
      if (options.mode) {
        results.mode = await selectFlowMode(options.mode);
      }
      if (options.aspectRatio) {
        results.aspectRatio = await setFlowAspectRatio(options.aspectRatio);
      }
      if (options.count) {
        results.count = await setFlowCount(options.count);
      }
      if (options.model) {
        results.model = await selectFlowModel(options.model);
      }

      await closeFlowSettingsPanel();
    }

    return results;
  }

  function getFlowState() {
    const buttons = [...document.querySelectorAll('button, [role="button"], mat-button-toggle, mat-select, [role="tab"], [role="switch"]')].filter(visible);

    const elementsInfo = buttons.map((btn) => {
      const text = (btn.textContent || '').trim().replace(/\s+/g, ' ');
      const aria = btn.getAttribute('aria-label') || '';
      const isSelected = btn.getAttribute('aria-pressed') === 'true' ||
                         btn.getAttribute('aria-checked') === 'true' ||
                         btn.classList.contains('mat-button-toggle-checked') ||
                         btn.classList.contains('active') ||
                         btn.classList.contains('selected');
      return {
        tag: btn.tagName,
        text: text.slice(0, 40),
        ariaLabel: aria,
        selected: isSelected
      };
    }).filter((item) => item.text || item.ariaLabel);

    return {
      activeToggles: elementsInfo.filter((item) => item.selected).map((i) => i.text || i.ariaLabel),
      visibleControls: elementsInfo.slice(0, 30),
      hasPromptBox: Boolean(findVisible(adapter().inputs))
    };
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

    // Method 1: ClipboardEvent paste
    try {
      const transfer = new DataTransfer();
      transfer.setData('text/plain', value);
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: transfer,
        bubbles: true,
        cancelable: true,
        composed: true
      });
      slate.dispatchEvent(pasteEvent);
    } catch {}

    // Method 2: beforeinput / insertText if not populated
    slate.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      composed: true,
      inputType: 'insertText',
      data: value
    }));

    try {
      document.execCommand('insertText', false, value);
    } catch {}
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
      element.focus();
      try {
        if (document.queryCommandSupported?.('insertText')) {
          element.select?.();
          document.execCommand('insertText', false, value);
        }
      } catch {}

      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      element.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true,
        composed: true,
        cancelable: true,
        inputType: 'insertText',
        data: value
      }));
      try {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
        if (descriptor?.set) {
          descriptor.set.call(element, value);
        } else {
          element.value = value;
        }
      } catch {
        element.value = value;
      }
      element.value = value;

      try {
        const tracker = element._valueTracker;
        if (tracker && typeof tracker.setValue === 'function') {
          tracker.setValue('__prompt_pilot_reset__');
        }
      } catch {}

      element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: value }));
      element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Unidentified', bubbles: true, composed: true }));
      element.dispatchEvent(new FocusEvent('blur', { bubbles: true, composed: true }));
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
    if (current.name === 'Google Flow') {
      await ensureFlowProject();
    }
    const input = findVisible(current.inputs);
    if (!input) return { ok: false, error: `No message box found on ${current.name}. Make sure you are inside an active project.` };
    focusComposer(input);
    setComposerValue(input, prompt);
    const inserted = await waitForComposerValue(input, prompt);
    if (!inserted) {
      // Fallback: try direct execCommand or text injection if Slate event wasn't picked up
      try {
        document.execCommand('insertText', false, prompt);
      } catch {}
      const retryInserted = await waitForComposerValue(input, prompt);
      if (!retryInserted) {
        return { ok: false, error: `${current.name} did not accept the pasted prompt.` };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
    if (!autoSend) return { ok: true };
    const button = await waitForSendButton(current);
    if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true') {
      const btnDetails = {
        tag: button.tagName,
        text: button.textContent?.trim(),
        ariaLabel: button.getAttribute('aria-label'),
        className: button.className
      };
      clickElement(button);
      return { ok: true, submitted: 'button', button: btnDetails };
    }

    // Try Enter key submission on the input / Slate editor
    const targetInput = getSlateEditor(input) || input;
    targetInput.focus();
    const enterOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true };
    targetInput.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
    targetInput.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
    targetInput.dispatchEvent(new KeyboardEvent('keyup', enterOpts));

    const form = targetInput.closest('form');
    if (form) {
      try { form.requestSubmit?.(); } catch {}
    }

    return { ok: true, submitted: 'enter' };
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

  async function waitForCondition(predicate, timeout = 6000, interval = 150) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const result = predicate();
      if (result) return result;
      await delay(interval);
    }
    return predicate();
  }

  function findCustomToggle() {
    const candidates = [
      ...document.querySelectorAll('button, [role="button"], [role="switch"], [role="tab"], input[type="checkbox"], label, div, span')
    ];
    for (const el of candidates) {
      if (!visible(el)) continue;
      if (el.closest('nav, aside, footer')) continue;
      const text = (el.textContent || '').trim();
      const ariaLabel = el.getAttribute('aria-label') || '';
      const name = el.getAttribute('name') || '';
      if (/^custom(\s+mode)?$/i.test(text) || /^custom$/i.test(ariaLabel) || name === 'custom') {
        return el;
      }
    }
    return null;
  }

  function isCustomModeActive() {
    const styleInput = findVisible([
      'textarea[placeholder*="style" i]',
      'input[placeholder*="style" i]',
      'textarea[aria-label*="style" i]',
      'input[aria-label*="style" i]'
    ]);
    const titleInput = findVisible([
      'input[placeholder*="title" i]',
      'textarea[placeholder*="title" i]',
      'input[aria-label*="title" i]'
    ]);
    return Boolean(styleInput || titleInput);
  }

  function isExcludeField(el) {
    if (!el) return false;
    const ph = (el.getAttribute('placeholder') || '').toLowerCase();
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const name = (el.getAttribute('name') || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const title = (el.title || '').toLowerCase();
    if (ph.includes('exclude') || aria.includes('exclude') || name.includes('exclude') || id.includes('exclude') || title.includes('exclude')) {
      return true;
    }
    const label = el.closest('label');
    if (label && (label.innerText || label.textContent || '').toLowerCase().includes('exclude')) {
      return true;
    }
    return false;
  }

  function findSunoTitleInput() {
    const candidates = [...document.querySelectorAll('input, textarea')].filter((el) => visible(el) && !isExcludeField(el));
    return candidates.find((el) => {
      const ph = (el.getAttribute('placeholder') || '').toLowerCase();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      const name = (el.getAttribute('name') || '').toLowerCase();
      return ph.includes('title') || aria.includes('title') || name.includes('title');
    }) || null;
  }

  function getSunoFormTextareas() {
    const textareas = [...document.querySelectorAll('main textarea, form textarea, [role="main"] textarea, textarea')]
      .filter((el) => visible(el) && !isExcludeField(el));
    const unique = Array.from(new Set(textareas));
    unique.sort((a, b) => {
      const topA = a.getBoundingClientRect().top;
      const topB = b.getBoundingClientRect().top;
      return topA - topB;
    });
    return unique;
  }

  function findSunoStyleInput() {
    const explicit = [...document.querySelectorAll('textarea, input')].find((el) => {
      if (!visible(el) || isExcludeField(el)) return false;
      const ph = (el.getAttribute('placeholder') || '').toLowerCase();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      const name = (el.getAttribute('name') || '').toLowerCase();
      return (ph.includes('style') || aria.includes('style') || name.includes('style') || ph.includes('genre') || ph.includes('describe'))
        && !ph.includes('lyric') && !aria.includes('lyric') && !ph.includes('title') && !aria.includes('title');
    });
    if (explicit) return explicit;

    const textareas = getSunoFormTextareas();
    if (textareas.length >= 2) {
      return textareas[1];
    }

    const labels = [...document.querySelectorAll('label, div, h2, h3, h4, span')].filter(visible);
    for (const label of labels) {
      const text = (label.textContent || '').trim();
      if (/^styles?(\s+of\s+music)?$/i.test(text) && !isExcludeField(label)) {
        let sibling = label.nextElementSibling;
        while (sibling) {
          const input = sibling.matches('textarea, input') ? sibling : sibling.querySelector('textarea, input');
          if (input && visible(input) && !isExcludeField(input)) return input;
          sibling = sibling.nextElementSibling;
        }
      }
    }

    return textareas[0] || null;
  }

  function findSunoLyricsInput() {
    const explicit = [...document.querySelectorAll('textarea, [contenteditable="true"]')].find((el) => {
      if (!visible(el) || isExcludeField(el)) return false;
      const ph = (el.getAttribute('placeholder') || '').toLowerCase();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      return (ph.includes('lyric') || aria.includes('lyric') || ph.includes('write your own') || ph.includes('enter your own') || ph.includes('verse'))
        && !ph.includes('style') && !aria.includes('style') && !ph.includes('title') && !aria.includes('title');
    });
    if (explicit) return explicit;

    const textareas = getSunoFormTextareas();
    if (textareas.length >= 2) {
      return textareas[0];
    }

    const labels = [...document.querySelectorAll('label, div, h2, h3, h4, span')].filter(visible);
    for (const label of labels) {
      const text = (label.textContent || '').trim();
      if (/^lyrics$/i.test(text) && !isExcludeField(label)) {
        let sibling = label.nextElementSibling;
        while (sibling) {
          const input = sibling.matches('textarea, [contenteditable="true"]') ? sibling : sibling.querySelector('textarea, [contenteditable="true"]');
          if (input && visible(input) && !isExcludeField(input)) return input;
          sibling = sibling.nextElementSibling;
        }
      }
    }

    return textareas[0] || null;
  }

  function isBtnDisabled(btn) {
    if (!btn) return true;
    if (btn.disabled) return true;
    if (btn.getAttribute('aria-disabled') === 'true') return true;
    if (btn.hasAttribute('data-trigger-disabled')) return true;
    if (btn.hasAttribute('data-disabled')) return true;
    if (btn.classList?.contains('disabled')) return true;
    return false;
  }

  function isSunoCreateButton(btn, referenceInput) {
    if (!visible(btn)) return false;
    if (btn.closest('nav, aside, [class*="sidebar" i], [class*="nav" i], [aria-label*="sidebar" i]')) return false;
    if (btn.getAttribute('role') === 'tab') return false;
    if (btn.tagName === 'A') return false;

    const btnRect = btn.getBoundingClientRect();
    if (btnRect.width === 0 || btnRect.height === 0) return false;

    if (referenceInput) {
      const refRect = referenceInput.getBoundingClientRect();
      if (btnRect.right < refRect.left - 20) return false;
    }

    const text = (btn.textContent || '').replace(/\s+/g, ' ').trim();
    const aria = (btn.getAttribute('aria-label') || '').trim();
    const testId = (btn.getAttribute('data-testid') || '').trim();
    const name = (btn.getAttribute('name') || '').trim();

    if (/playlist|folder|account|profile|library|upload|clear/i.test(text)) return false;
    if (/clear all/i.test(aria)) return false;

    if (/^create\s*song/i.test(aria) || aria === 'Create song') return true;
    if (/^create(\s|$|\()/i.test(text) || /^create/i.test(aria)) return true;
    if (/create\s*song/i.test(aria) || /create/i.test(testId) || /create/i.test(name)) return true;
    if (btn.type === 'submit' && /\b(create|generate)\b/i.test(text)) return true;
    if (/\b(create|generate)\b/i.test(text)) return true;
    return false;
  }

  function findSunoCreateButton(onlyEnabled = false) {
    const titleInput = findSunoTitleInput();
    const styleInput = findSunoStyleInput();
    const lyricsInput = findSunoLyricsInput();
    const referenceInput = titleInput || styleInput || lyricsInput;

    const exactMatches = [...document.querySelectorAll('button[aria-label="Create song"]')].filter((btn) => {
      if (!visible(btn)) return false;
      if (referenceInput) {
        const refRect = referenceInput.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();
        if (btnRect.right < refRect.left - 20) return false;
      }
      return true;
    });

    if (exactMatches.length > 0) {
      if (onlyEnabled) {
        const enabled = exactMatches.find((btn) => !isBtnDisabled(btn));
        if (enabled) return enabled;
      } else {
        return exactMatches[0];
      }
    }

    const root = referenceInput?.closest('main, form, [class*="create" i]') || document;
    const allButtons = [
      ...root.querySelectorAll('button, [role="button"]')
    ].filter((btn) => isSunoCreateButton(btn, referenceInput));

    const unique = Array.from(new Set(allButtons));

    if (referenceInput) {
      const refTop = referenceInput.getBoundingClientRect().top;
      unique.sort((a, b) => {
        const aBelow = a.getBoundingClientRect().top > refTop ? 1 : 0;
        const bBelow = b.getBoundingClientRect().top > refTop ? 1 : 0;
        if (aBelow !== bBelow) return bBelow - aBelow;
        return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
      });
    }

    if (onlyEnabled) {
      return unique.find((btn) => !isBtnDisabled(btn)) || null;
    }
    return unique.find((btn) => !isBtnDisabled(btn))
      || exactMatches[0]
      || unique.find((btn) => btn.type === 'submit')
      || unique[0]
      || null;
  }

  function clickElement(el) {
    if (!el) return false;
    try {
      el.scrollIntoView?.({ block: 'center', behavior: 'instant' });
    } catch {}
    el.focus?.();
    const opts = { bubbles: true, cancelable: true, composed: true, view: window };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1, isPrimary: true, button: 0 }));
    el.dispatchEvent(new MouseEvent('mousedown', { ...opts, button: 0 }));
    el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1, isPrimary: true, button: 0 }));
    el.dispatchEvent(new MouseEvent('mouseup', { ...opts, button: 0 }));
    el.dispatchEvent(new MouseEvent('click', { ...opts, button: 0 }));

    const child = el.querySelector('span, div, p');
    if (child) {
      try {
        child.dispatchEvent(new MouseEvent('click', { ...opts, button: 0 }));
        child.click?.();
      } catch {}
    }

    if (typeof el.click === 'function') el.click();

    const form = el.closest('form');
    if (form) {
      try {
        form.requestSubmit?.(el);
      } catch {}
    }
    return true;
  }

  function findInstrumentalToggle() {
    const candidates = [
      ...document.querySelectorAll('button, [role="switch"], [role="button"], input[type="checkbox"], label')
    ];
    for (const el of candidates) {
      if (!visible(el) || el.closest('nav, aside, footer')) continue;
      const text = (el.textContent || '').trim();
      const aria = el.getAttribute('aria-label') || '';
      const name = el.getAttribute('name') || '';
      if (/^instrumental$/i.test(text) || /^instrumental$/i.test(aria) || name === 'instrumental') {
        return el;
      }
    }
    return null;
  }

  function isInstrumentalActive() {
    const toggle = findInstrumentalToggle();
    if (!toggle) return false;
    if (toggle instanceof HTMLInputElement && toggle.type === 'checkbox') return toggle.checked;
    if (toggle.getAttribute('aria-checked') === 'true') return true;
    if (toggle.getAttribute('data-state') === 'checked') return true;
    const checkbox = toggle.querySelector('input[type="checkbox"]');
    if (checkbox) return checkbox.checked;
    return false;
  }

  async function setInstrumental(wantedActive) {
    const toggle = findInstrumentalToggle();
    if (!toggle) return;
    const currentlyActive = isInstrumentalActive();
    if (currentlyActive !== wantedActive) {
      clickElement(toggle);
      await delay(300);
    }
  }


  async function applySunoVocalGender(gender) {
    if (!gender) return;
    const g = gender.toLowerCase().trim();
    const wanted = g === 'male' || (g.includes('male') && !g.includes('female')) ? 'male' : (g === 'female' || g.includes('female') ? 'female' : null);
    if (!wanted) return;

    const advancedToggle = [...document.querySelectorAll('button, [role="button"], summary')].find((el) => {
      if (!visible(el)) return false;
      const text = (el.textContent || '').trim();
      return /advanced options|more options|vocal gender/i.test(text);
    });
    if (advancedToggle && (advancedToggle.getAttribute('aria-expanded') === 'false' || !document.querySelector('[role="radiogroup"], input[name*="gender" i]'))) {
      advancedToggle.click();
      await delay(300);
    }

    const genderBtns = [...document.querySelectorAll('button, [role="radio"], label')].filter(visible);
    const targetBtn = genderBtns.find((el) => {
      const text = (el.textContent || '').trim().toLowerCase();
      const val = (el.getAttribute('value') || el.getAttribute('aria-label') || '').toLowerCase();
      return text === wanted || val === wanted || text === `${wanted} vocals` || text === `${wanted} voice`;
    });
    if (targetBtn) {
      targetBtn.click();
      await delay(150);
    }
  }

  async function createSunoSong(song, autoCreate) {
    if (location.hostname.includes('suno') && !location.pathname.includes('/create')) {
      const createNav = document.querySelector('a[href*="/create"], button[aria-label*="create" i]');
      if (createNav) {
        createNav.click();
        await delay(1200);
      }
    }

    if (!isCustomModeActive()) {
      const toggle = await waitForCondition(() => findCustomToggle() || (isCustomModeActive() ? true : null), 5000);
      if (toggle && toggle !== true) {
        toggle.click();
        await delay(600);
      }
    }
    const ready = await waitForCondition(() => isCustomModeActive() || findSunoLyricsInput(), 6000);
    if (!ready) {
      return { ok: false, error: 'Could not access Suno Custom Mode. Make sure you are on suno.com/create and logged in.' };
    }
    const lyricsInput = findSunoLyricsInput();
    let targetLyrics = (song.lyrics || '').trim();
    if (targetLyrics) {
      await setInstrumental(false);
      if (lyricsInput) {
        setComposerValue(lyricsInput, targetLyrics);
        await waitForComposerValue(lyricsInput, targetLyrics.slice(0, 20));
        await delay(200);
      }
    } else if (song.gender) {
      await setInstrumental(false);
      if (lyricsInput) {
        const titleWords = song.title || 'Music';
        const autoStructure = `[Verse 1]\n${titleWords} in the morning light\nRunning fast into the night\n\n[Chorus]\n${titleWords} break away\nLiving for another day`;
        setComposerValue(lyricsInput, autoStructure);
        await waitForComposerValue(lyricsInput, autoStructure.slice(0, 20));
        await delay(200);
      }
    } else {
      await setInstrumental(true);
    }

    const styleInput = findSunoStyleInput();
    let targetStyle = (song.styles || '').trim();
    if (song.gender) {
      const g = song.gender.toLowerCase().trim();
      const isMale = g === 'male' || (g.includes('male') && !g.includes('female'));
      const isFemale = g === 'female' || g.includes('female');
      if (isMale || isFemale) {
        const vocalLabel = isMale ? 'male vocals' : 'female vocals';
        if (!/(male|female)\s*(vocals?|voice|singer)?/i.test(targetStyle)) {
          targetStyle = targetStyle ? `${targetStyle}, ${vocalLabel}` : vocalLabel;
        }
      }
    }
    if (styleInput && targetStyle) {
      setComposerValue(styleInput, targetStyle);
      await waitForComposerValue(styleInput, targetStyle.slice(0, 30));
      await delay(200);
    }

    const titleInput = findSunoTitleInput();
    if (titleInput && song.title) {
      setComposerValue(titleInput, song.title);
      await waitForComposerValue(titleInput, song.title);
      await delay(200);
    }

    if (song.gender) {
      try {
        await applySunoVocalGender(song.gender);
      } catch {}
    }

    await delay(350);

    if (!autoCreate) {
      return { ok: true, created: false, message: 'Song parameters populated in Suno.' };
    }

    [titleInput, styleInput, lyricsInput].forEach((input) => {
      if (input) {
        input.focus?.();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      }
    });
    await delay(300);

    let createBtn = await waitForCondition(() => findSunoCreateButton(true), 8000, 200) || findSunoCreateButton(false);
    if (!createBtn) {
      return { ok: false, error: 'Song fields populated, but could not locate the Create button.' };
    }

    if (createBtn.hasAttribute('data-trigger-disabled')) {
      createBtn.removeAttribute('data-trigger-disabled');
    }
    if (createBtn.hasAttribute('data-disabled')) {
      createBtn.removeAttribute('data-disabled');
    }
    createBtn.disabled = false;

    clickElement(createBtn);
    await delay(1000);
    return { ok: true, created: true, message: 'Song creation started in Suno.' };
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
          clickElement(button);
          sendResponse({ ok: true, method: 'clickElement' });
          return;
        }
        input.focus();
        const enterOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true };
        input.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
        input.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
        input.dispatchEvent(new KeyboardEvent('keyup', enterOpts));
        sendResponse({ ok: true, method: 'enterKey' });
      });
      return true;
    }
    if (message.type === 'PROMPT_PILOT_OPEN_FLOW_PROJECT') {
      ensureFlowProject().then((ready) => {
        sendResponse({ ok: ready, hasPromptBox: Boolean(findVisible(adapter().inputs)) });
      });
      return true;
    }
    if (message.type === 'PROMPT_PILOT_FLOW_CONFIG') {
      configureFlowSettings(message.options || {}).then((result) => {
        sendResponse({ ok: true, result, state: getFlowState() });
      });
      return true;
    }
    if (message.type === 'PROMPT_PILOT_FLOW_STATE') {
      sendResponse({ ok: true, state: getFlowState() });
      return;
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
    if (message.type === 'PROMPT_PILOT_CREATE_SUNO') {
      createSunoSong(message.song, message.autoCreate).then(sendResponse);
      return true;
    }
  });
})();
