/* eslint-disable */
// recorder.js - content script for recording user interactions into steps
// Notes: Designed to run in ISOLATED world. Communicates via chrome.runtime messages.

(function () {
  if (window.__RR_RECORDER_INSTALLED__) return;
  window.__RR_RECORDER_INSTALLED__ = true;

  const SENSITIVE_INPUT_TYPES = new Set(['password']);
  const THROTTLE_SCROLL_MS = 200;
  const sampledDrag = [];

  let isRecording = false;
  let isPaused = false;
  let hideInputValues = false;
  let highlightBox = null;
  let pendingFlow = {
    id: `flow_${Date.now()}`,
    name: '未命名录制',
    version: 1,
    steps: [],
    variables: [],
    meta: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  };

  function now() {
    return Date.now();
  }

  function toRef(el) {
    if (!window.__claudeElementMap) window.__claudeElementMap = {};
    if (!window.__claudeRefCounter) window.__claudeRefCounter = 0;
    for (const k in window.__claudeElementMap) {
      if (window.__claudeElementMap[k].deref && window.__claudeElementMap[k].deref() === el)
        return k;
    }
    const id = `ref_${++window.__claudeRefCounter}`;
    window.__claudeElementMap[id] = new WeakRef(el);
    return id;
  }

  function generateSelector(el) {
    if (!(el instanceof Element)) return '';
    if (/** @type {HTMLElement} */ (el).id) {
      const idSel = `#${CSS.escape(/** @type {HTMLElement} */ (el).id)}`;
      if (document.querySelectorAll(idSel).length === 1) return idSel;
    }
    for (const attr of ['data-testid', 'data-cy', 'name']) {
      const attrValue = el.getAttribute(attr);
      if (attrValue) {
        const s = `[${attr}="${CSS.escape(attrValue)}"]`;
        if (document.querySelectorAll(s).length === 1) return s;
      }
    }
    let path = '';
    let current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE && current.tagName !== 'BODY') {
      let selector = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (child) => child.tagName === current.tagName,
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }
      path = path ? `${selector} > ${path}` : selector;
      current = parent;
    }
    return path ? `body > ${path}` : 'body';
  }

  function buildTarget(el) {
    const ref = toRef(el);
    const candidates = [];
    const css = generateSelector(el);
    if (css) candidates.push({ type: 'css', value: css });
    const name = el.getAttribute && el.getAttribute('name');
    if (name) candidates.push({ type: 'attr', value: `[name="${name}"]` });
    const aria = el.getAttribute && el.getAttribute('aria-label');
    if (aria) candidates.push({ type: 'aria', value: `textbox[name=${aria}]` });
    // Fallback to text for clickable elements
    const tag = el.tagName.toLowerCase();
    if (['button', 'a', 'summary'].includes(tag)) {
      const text = (el.textContent || '').trim();
      if (text) candidates.push({ type: 'text', value: text.substring(0, 64) });
    }
    return { ref, candidates };
  }

  function addVariable(key, sensitive, defaultValue) {
    if (!pendingFlow.variables) pendingFlow.variables = [];
    if (pendingFlow.variables.find((v) => v.key === key)) return;
    pendingFlow.variables.push({ key, sensitive: !!sensitive, default: defaultValue || '' });
  }

  function pushStep(step) {
    step.id = step.id || `step_${now()}_${Math.random().toString(36).slice(2, 6)}`;
    pendingFlow.steps.push(step);
    pendingFlow.meta.updatedAt = new Date().toISOString();
    chrome.runtime.sendMessage({
      type: 'rr_recorder_event',
      payload: { kind: 'step', step },
    });
  }

  function onClick(e) {
    if (!isRecording || isPaused) return;
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    const target = buildTarget(el);
    pushStep({ type: e.detail >= 2 ? 'dblclick' : 'click', target, screenshotOnFail: true });
  }

  function onInput(e) {
    if (!isRecording || isPaused) return;
    const el =
      e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
        ? e.target
        : null;
    if (!el) return;
    const target = buildTarget(el);
    const isSensitive =
      hideInputValues || SENSITIVE_INPUT_TYPES.has((el.getAttribute('type') || '').toLowerCase());
    let value = el.value || '';
    if (isSensitive) {
      const varKey = el.name ? el.name : `var_${Math.random().toString(36).slice(2, 6)}`;
      addVariable(varKey, true, '');
      value = `{${varKey}}`;
    }
    pushStep({ type: 'fill', target, value, screenshotOnFail: true });
  }

  function onKeydown(e) {
    if (!isRecording || isPaused) return;
    // modifier+key or Enter/Backspace etc
    const mods = [];
    if (e.ctrlKey) mods.push('ctrl');
    if (e.metaKey) mods.push('cmd');
    if (e.altKey) mods.push('alt');
    if (e.shiftKey) mods.push('shift');
    let keyToken = e.key || '';
    // normalize
    keyToken = keyToken.length === 1 ? keyToken.toLowerCase() : keyToken.toLowerCase();
    const keys = mods.length ? `${mods.join('+')}+${keyToken}` : keyToken;
    pushStep({ type: 'key', keys, screenshotOnFail: false });
  }

  // keyup 不再记录，避免重复噪声

  // Composition IME events (record markers for analysis; playback is no-op via script step)
  function onCompositionStart() {
    if (!isRecording || isPaused) return;
    pushStep({
      type: 'script',
      world: 'ISOLATED',
      when: 'before',
      code: '/* compositionstart */',
      screenshotOnFail: false,
    });
  }
  function onCompositionEnd() {
    if (!isRecording || isPaused) return;
    pushStep({
      type: 'script',
      world: 'ISOLATED',
      when: 'before',
      code: '/* compositionend */',
      screenshotOnFail: false,
    });
  }

  let lastScrollAt = 0;
  function onScroll(e) {
    if (!isRecording || isPaused) return;
    const nowTs = now();
    if (nowTs - lastScrollAt < THROTTLE_SCROLL_MS) return;
    lastScrollAt = nowTs;
    const targetEl = e.target === document ? document.documentElement : e.target;
    const target = targetEl instanceof Element ? buildTarget(targetEl) : undefined;
    const top = window.scrollY || document.documentElement.scrollTop || 0;
    pushStep({ type: 'scroll', mode: 'offset', offset: { x: 0, y: top }, target });
  }

  let dragging = false;
  function onMouseDown(e) {
    if (!isRecording) return;
    dragging = true;
    sampledDrag.length = 0;
    sampledDrag.push({ x: e.clientX, y: e.clientY });
  }
  function onMouseMove(e) {
    if (!isRecording) return;
    if (!dragging) return;
    if (sampledDrag.length === 0 || now() - sampledDrag._lastTs > 50) {
      sampledDrag.push({ x: e.clientX, y: e.clientY });
      sampledDrag._lastTs = now();
    }
  }
  function onMouseUp(e) {
    if (!isRecording) return;
    if (!dragging) return;
    dragging = false;
    const start = sampledDrag[0];
    const end = { x: e.clientX, y: e.clientY };
    if (start) {
      pushStep({
        type: 'drag',
        start: { ref: undefined, candidates: [] },
        end: { ref: undefined, candidates: [] },
        path: sampledDrag.slice(),
      });
    }
  }

  function attach() {
    document.addEventListener('click', onClick, true);
    document.addEventListener('change', onInput, true);
    document.addEventListener('input', onInput, true);
    document.addEventListener('keydown', onKeydown, true);
    // document.addEventListener('keyup', onKeyup, true);
    document.addEventListener('compositionstart', onCompositionStart, true);
    document.addEventListener('compositionend', onCompositionEnd, true);
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseup', onMouseUp, true);
  }

  function detach() {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('change', onInput, true);
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('keydown', onKeydown, true);
    // document.removeEventListener('keyup', onKeyup, true);
    document.removeEventListener('compositionstart', onCompositionStart, true);
    document.removeEventListener('compositionend', onCompositionEnd, true);
    window.removeEventListener('scroll', onScroll, { passive: true });
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('mouseup', onMouseUp, true);
  }

  function reset(flowMeta) {
    pendingFlow = {
      id: flowMeta && flowMeta.id ? flowMeta.id : `flow_${Date.now()}`,
      name: (flowMeta && flowMeta.name) || '未命名录制',
      version: 1,
      steps: [],
      variables: [],
      meta: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        domain: location.hostname,
        bindings: [{ type: 'domain', value: location.hostname }],
      },
    };
  }

  function start(flowMeta) {
    reset(flowMeta || {});
    isRecording = true;
    isPaused = false;
    attach();
    ensureOverlay();
    chrome.runtime.sendMessage({
      type: 'rr_recorder_event',
      payload: { kind: 'start', flow: pendingFlow },
    });
  }

  function stop() {
    isRecording = false;
    detach();
    removeOverlay();
    chrome.runtime.sendMessage({
      type: 'rr_recorder_event',
      payload: { kind: 'stop', flow: pendingFlow },
    });
    return pendingFlow;
  }

  function pause() {
    isPaused = true;
    updateOverlayStatus();
  }

  function resume() {
    isRecording = true;
    isPaused = false;
    attach();
    ensureOverlay();
    updateOverlayStatus();
  }

  function ensureOverlay() {
    let root = document.getElementById('__rr_rec_overlay');
    if (root) return;
    root = document.createElement('div');
    root.id = '__rr_rec_overlay';
    Object.assign(root.style, {
      position: 'fixed',
      top: '10px',
      right: '10px',
      zIndex: 2147483646,
      fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,Arial',
    });
    root.innerHTML = `
      <div id="__rr_rec_panel" style="background: rgba(220,38,38,0.95); color: #fff; padding:8px 10px; border-radius:8px; display:flex; align-items:center; gap:8px; box-shadow:0 4px 16px rgba(0,0,0,0.2);">
        <span id="__rr_badge" style="font-weight:600;">录制中</span>
        <label style="display:inline-flex; align-items:center; gap:4px; font-size:12px;">
          <input id="__rr_hide_values" type="checkbox" style="vertical-align:middle;" />隐藏输入值
        </label>
        <button id="__rr_pause" style="background:#fff; color:#111; border:none; border-radius:6px; padding:4px 8px; cursor:pointer;">暂停</button>
        <button id="__rr_stop" style="background:#111; color:#fff; border:none; border-radius:6px; padding:4px 8px; cursor:pointer;">停止</button>
      </div>
    `;
    document.documentElement.appendChild(root);
    const btnPause = root.querySelector('#__rr_pause');
    const btnStop = root.querySelector('#__rr_stop');
    const hideChk = root.querySelector('#__rr_hide_values');
    hideChk.checked = hideInputValues;
    hideChk.addEventListener('change', () => (hideInputValues = hideChk.checked));
    btnPause.addEventListener('click', () => {
      if (!isPaused) pause();
      else resume();
    });
    btnStop.addEventListener('click', () => {
      stop();
    });
    updateOverlayStatus();
    // element highlight box
    highlightBox = document.createElement('div');
    Object.assign(highlightBox.style, {
      position: 'fixed',
      border: '2px solid rgba(59,130,246,0.9)',
      borderRadius: '4px',
      background: 'rgba(59,130,246,0.15)',
      pointerEvents: 'none',
      zIndex: 2147483645,
    });
    document.documentElement.appendChild(highlightBox);
    document.addEventListener('mousemove', onHoverMove, true);
  }

  function removeOverlay() {
    try {
      const root = document.getElementById('__rr_rec_overlay');
      if (root) root.remove();
      if (highlightBox) highlightBox.remove();
      document.removeEventListener('mousemove', onHoverMove, true);
    } catch {}
  }

  function updateOverlayStatus() {
    const badge = document.getElementById('__rr_badge');
    const pauseBtn = document.getElementById('__rr_pause');
    if (badge) badge.textContent = isPaused ? '已暂停' : '录制中';
    if (pauseBtn) pauseBtn.textContent = isPaused ? '继续' : '暂停';
  }

  function onHoverMove(e) {
    if (!highlightBox || !isRecording || isPaused) return;
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    try {
      const r = el.getBoundingClientRect();
      Object.assign(highlightBox.style, {
        left: `${Math.round(r.left)}px`,
        top: `${Math.round(r.top)}px`,
        width: `${Math.round(Math.max(0, r.width))}px`,
        height: `${Math.round(Math.max(0, r.height))}px`,
        display: r.width > 0 && r.height > 0 ? 'block' : 'none',
      });
    } catch {}
  }

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    try {
      if (request && request.action === 'rr_recorder_control') {
        const cmd = request.cmd;
        if (cmd === 'start') {
          start(request.meta || {});
          sendResponse({ success: true });
          return true;
        } else if (cmd === 'pause') {
          pause();
          sendResponse({ success: true });
          return true;
        } else if (cmd === 'resume') {
          resume();
          sendResponse({ success: true });
          return true;
        } else if (cmd === 'stop') {
          const flow = stop();
          sendResponse({ success: true, flow });
          return true;
        }
      }
    } catch (e) {
      sendResponse({ success: false, error: String(e && e.message ? e.message : e) });
      return true;
    }
    return false;
  });

  // ping handler
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request && request.action === 'rr_recorder_ping') {
      sendResponse({ status: 'pong' });
      return false;
    }
    return false;
  });

  console.log('Record & Replay recorder.js loaded');
})();
