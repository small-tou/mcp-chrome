/* eslint-disable */
// element-marker.js — content script overlay for marking elements with selectors
(function () {
  if (window.__ELEMENT_MARKER_INSTALLED__) return;
  window.__ELEMENT_MARKER_INSTALLED__ = true;
  const IS_MAIN = window === window.top;

  const STATE = {
    active: false,
    hoverEl: null,
    selectedEl: null,
    box: null,
    highlighter: null,
    rectsHost: null,
    listMode: false,
    selectorType: 'css', // 'css' | 'xpath'
    hoveredList: [],
    prefs: {
      preferId: true,
      preferStableAttr: true,
      preferClass: true,
    },
  };

  // Heuristic selector generator inspired by Automa elementSelector and the recorder SelectorEngine
  function generateSelector(el) {
    if (!(el instanceof Element)) return '';

    // 1) Unique ID
    if (
      STATE.prefs.preferId &&
      el.id &&
      document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1
    ) {
      return `#${CSS.escape(el.id)}`;
    }

    // 2) Stable attributes preferred
    const attrNames = [
      'data-testid',
      'data-testId',
      'data-test',
      'data-qa',
      'data-cy',
      'name',
      'title',
      'alt',
      'aria-label',
    ];
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    for (const attr of STATE.prefs.preferStableAttr ? attrNames : []) {
      const v = el.getAttribute && el.getAttribute(attr);
      if (!v) continue;
      const attrSel = `[${attr}="${CSS.escape(v)}"]`;
      const testSel = tag && /^(input|textarea|select)$/i.test(tag) ? `${tag}${attrSel}` : attrSel;
      try {
        if (document.querySelectorAll(testSel).length === 1) return testSel;
      } catch {}
    }

    // 3) Unique class-based selectors
    try {
      const classes = STATE.prefs.preferClass
        ? Array.from(el.classList || []).filter((c) => c && /^[a-zA-Z0-9_-]+$/.test(c))
        : [];
      for (const cls of classes) {
        const sel = `.${CSS.escape(cls)}`;
        if (document.querySelectorAll(sel).length === 1) return sel;
      }
      if (tag) {
        for (const cls of classes) {
          const sel = `${tag}.${CSS.escape(cls)}`;
          if (document.querySelectorAll(sel).length === 1) return sel;
        }
      }
      for (let i = 0; i < Math.min(classes.length, 3); i++) {
        for (let j = i + 1; j < Math.min(classes.length, 3); j++) {
          const sel = `.${CSS.escape(classes[i])}.${CSS.escape(classes[j])}`;
          if (document.querySelectorAll(sel).length === 1) return sel;
        }
      }
    } catch {}

    // 4) Build relative path from nearest unique anchor (id/attr)
    try {
      let cur = el;
      const anchorAttrs = [
        'id',
        'data-testid',
        'data-testId',
        'data-test',
        'data-qa',
        'data-cy',
        'name',
      ];
      while (cur && cur !== document.body) {
        if (cur.id && document.querySelectorAll(`#${CSS.escape(cur.id)}`).length === 1) {
          const anchor = `#${CSS.escape(cur.id)}`;
          const rel = buildPathFromAncestor(cur, el);
          const composed = rel ? `${anchor} ${rel}` : anchor;
          if (document.querySelector(composed)) return composed;
        }
        for (const a of STATE.prefs.preferStableAttr ? anchorAttrs : []) {
          const val = cur.getAttribute && cur.getAttribute(a);
          if (!val) continue;
          const aSel = `[${a}="${CSS.escape(val)}"]`;
          if (document.querySelectorAll(aSel).length === 1) {
            const rel = buildPathFromAncestor(cur, el);
            const composed = rel ? `${aSel} ${rel}` : aSel;
            if (document.querySelector(composed)) return composed;
          }
        }
        cur = cur.parentElement;
      }
    } catch {}

    // 5) Fallback full path
    let path = '';
    let current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE && current.tagName !== 'BODY') {
      let sel = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          sel += `:nth-of-type(${index})`;
        }
      }
      path = path ? `${sel} > ${path}` : sel;
      current = parent;
    }
    return path ? `body > ${path}` : 'body';
  }

  function buildPathFromAncestor(ancestor, target) {
    const segs = [];
    let cur = target;
    while (cur && cur !== ancestor && cur !== document.body) {
      let seg = cur.tagName.toLowerCase();
      const parent = cur.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === cur.tagName);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(cur) + 1;
          seg += `:nth-of-type(${idx})`;
        }
      }
      segs.unshift(seg);
      cur = parent;
    }
    return segs.join(' > ');
  }

  function getAccessibleName(el) {
    try {
      const labelledby = el.getAttribute('aria-labelledby');
      if (labelledby) {
        const labelEl = document.getElementById(labelledby);
        if (labelEl) return (labelEl.textContent || '').trim();
      }
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel.trim();
      if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label) return (label.textContent || '').trim();
      }
      const parentLabel = el.closest('label');
      if (parentLabel) return (parentLabel.textContent || '').trim();
      return (
        el.getAttribute('placeholder') ||
        el.getAttribute('value') ||
        el.textContent ||
        ''
      ).trim();
    } catch {
      return '';
    }
  }

  function ensureUi() {
    if (!IS_MAIN) return null;
    if (STATE.box) return STATE.box;
    const box = document.createElement('div');
    box.id = '__element_marker_overlay';
    Object.assign(box.style, {
      position: 'fixed',
      top: '10px',
      right: '10px',
      zIndex: 2147483646,
      fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,Arial',
    });
    box.innerHTML = `
      <div style="background: rgba(17,24,39,0.92); color:#F9FAFB; padding:10px 12px; border-radius:8px; width: 360px; box-shadow:0 6px 18px rgba(0,0,0,0.3);">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px;">
          <strong>元素标注模式</strong>
          <button id="__em_close" style="background:#dc2626; color:#fff; border:none; border-radius:6px; padding:4px 8px; cursor:pointer;">关闭</button>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px;">
          <label style="font-size:12px; opacity:0.85;">名称</label>
          <input id="__em_name" style="padding:6px 8px; border-radius:6px; border:1px solid rgba(255,255,255,0.2); background:#111827; color:#F9FAFB;" placeholder="如：登录按钮" />
          <label style="font-size:12px; opacity:0.85;">选择器</label>
          <input id="__em_selector" style="padding:6px 8px; border-radius:6px; border:1px solid rgba(255,255,255,0.2); background:#111827; color:#F9FAFB;" placeholder="点击页面元素自动填充" />
          <div style="display:flex; gap:8px; margin-top:6px;">
            <button id="__em_save" style="flex:1; background:#10b981; color:#111; border:none; border-radius:6px; padding:6px 8px; cursor:pointer;">保存</button>
            <button id="__em_cancel" style="flex:1; background:#374151; color:#fff; border:none; border-radius:6px; padding:6px 8px; cursor:pointer;">取消</button>
          </div>
          <p style="font-size:12px; opacity:0.75; margin:6px 0 0;">提示：移动鼠标高亮元素，点击自动填充选择器</p>
        </div>
      </div>
    `;
    document.documentElement.appendChild(box);
    const onClose = () => stop();
    box.querySelector('#__em_close').addEventListener('click', onClose);
    box.querySelector('#__em_cancel').addEventListener('click', onClose);
    box.querySelector('#__em_save').addEventListener('click', () => save());
    STATE.box = box;
    return box;
  }

  function ensureHighlighter() {
    if (STATE.highlighter) return STATE.highlighter;
    const hl = document.createElement('div');
    hl.id = '__element_marker_highlight';
    Object.assign(hl.style, {
      position: 'fixed',
      zIndex: 2147483645,
      pointerEvents: 'none',
      border: '2px solid #10b981',
      borderRadius: '4px',
      boxShadow: '0 0 0 2px rgba(16,185,129,0.2)',
    });
    document.documentElement.appendChild(hl);
    STATE.highlighter = hl;
    return hl;
  }

  function ensureRectsHost() {
    if (STATE.rectsHost) return STATE.rectsHost;
    const host = document.createElement('div');
    host.id = '__element_marker_rects';
    Object.assign(host.style, {
      position: 'fixed',
      zIndex: 2147483644,
      pointerEvents: 'none',
      left: '0',
      top: '0',
      right: '0',
      bottom: '0',
    });
    document.documentElement.appendChild(host);
    STATE.rectsHost = host;
    return host;
  }

  function clearRects() {
    if (!STATE.rectsHost) return;
    try {
      STATE.rectsHost.innerHTML = '';
    } catch {}
  }

  function moveHighlighterTo(el) {
    const hl = ensureHighlighter();
    const r = el.getBoundingClientRect();
    hl.style.left = r.left + 'px';
    hl.style.top = r.top + 'px';
    hl.style.width = r.width + 'px';
    hl.style.height = r.height + 'px';
    hl.style.display = 'block';
  }

  function clearHighlighter() {
    if (STATE.highlighter) STATE.highlighter.style.display = 'none';
    clearRects();
  }

  function onMouseMove(ev) {
    if (!STATE.active) return;
    const target = ev.target;
    if (!(target instanceof Element)) {
      clearHighlighter();
      return;
    }
    // Avoid interacting with the overlay itself
    const box = STATE.box;
    if (
      box &&
      (target === box || (target.closest && target.closest('#__element_marker_overlay')))
    ) {
      clearHighlighter();
      return;
    }
    STATE.hoverEl = target;
    if (!IS_MAIN) {
      // Delegate to top for unified overlay
      try {
        const rects = [];
        const list = STATE.listMode ? computeElementList(target) || [target] : [target];
        for (const el of list) {
          const r = el.getBoundingClientRect();
          rects.push({ x: r.left, y: r.top, width: r.width, height: r.height });
        }
        window.top.postMessage(
          { type: 'em_hover', rects, innerSel: generateSelector(target) },
          '*',
        );
      } catch {}
      return;
    }
    if (STATE.listMode) {
      // compute siblings list
      STATE.hoveredList = computeElementList(target) || [target];
      // draw rects for list
      const host = ensureRectsHost();
      clearRects();
      for (const el of STATE.hoveredList) {
        const r = el.getBoundingClientRect();
        const box = document.createElement('div');
        Object.assign(box.style, {
          position: 'fixed',
          left: r.left + 'px',
          top: r.top + 'px',
          width: r.width + 'px',
          height: r.height + 'px',
          border: '2px dashed #22c55e',
          borderRadius: '4px',
          boxShadow: '0 0 0 2px rgba(34,197,94,0.15)',
        });
        host.appendChild(box);
      }
    } else {
      moveHighlighterTo(target);
    }
  }

  function onClick(ev) {
    if (!STATE.active) return;
    const target = ev.target;
    const box = STATE.box;
    if (
      box &&
      (target === box || (target.closest && target.closest('#__element_marker_overlay')))
    ) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    if (!(target instanceof Element)) return;
    if (!IS_MAIN) {
      // Send inner selector to top
      try {
        const sel =
          STATE.selectorType === 'xpath'
            ? generateXPath(target)
            : STATE.listMode
              ? generateListSelector(target)
              : generateSelector(target);
        window.top.postMessage({ type: 'em_click', innerSel: sel }, '*');
      } catch {}
      return;
    }
    STATE.selectedEl = target;
    const sel =
      STATE.selectorType === 'xpath'
        ? generateXPath(target)
        : STATE.listMode
          ? generateListSelector(target)
          : generateSelector(target);
    const name = getAccessibleName(target) || target.tagName.toLowerCase();
    const inputSel = box?.querySelector('#__em_selector');
    const inputName = box?.querySelector('#__em_name');
    if (inputSel) inputSel.value = sel;
    if (inputName && !inputName.value) inputName.value = name;
    moveHighlighterTo(target);
  }

  function start() {
    if (STATE.active) return;
    STATE.active = true;
    if (IS_MAIN) {
      ensureUi();
      ensureUiEnhancements();
    }
    ensureHighlighter();
    ensureRectsHost();
    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKeyDown, true);
  }

  function stop() {
    STATE.active = false;
    window.removeEventListener('mousemove', onMouseMove, true);
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('keydown', onKeyDown, true);
    try {
      STATE.highlighter && STATE.highlighter.remove();
    } catch {}
    try {
      STATE.rectsHost && STATE.rectsHost.remove();
    } catch {}
    try {
      STATE.box && STATE.box.remove();
    } catch {}
    STATE.highlighter = null;
    STATE.rectsHost = null;
    STATE.box = null;
    STATE.hoveredList = [];
  }

  async function save() {
    try {
      const name = STATE.box.querySelector('#__em_name').value.trim();
      const selector = STATE.box.querySelector('#__em_selector').value.trim();
      if (!selector) return;
      const url = location.href;
      let selectorType = STATE.selectorType;
      if (STATE.listMode && selectorType === 'xpath') selectorType = 'css';
      chrome.runtime.sendMessage(
        {
          type: 'element_marker_save',
          marker: { url, name: name || selector, selector, selectorType },
        },
        function () {
          /* ignore errors */
        },
      );
    } catch {}
    stop();
  }

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request && request.action === 'element_marker_start') {
      start();
      sendResponse({ ok: true });
      return true;
    } else if (request && request.action === 'element_marker_ping') {
      sendResponse({ status: 'pong' });
      return false;
    }
    return false;
  });

  // Cross-frame bridge: top collects child frame hover/click
  if (IS_MAIN) {
    window.addEventListener(
      'message',
      (ev) => {
        try {
          const data = ev && ev.data;
          if (!data || !STATE.active) return;
          const iframes = Array.from(document.querySelectorAll('iframe'));
          const host = iframes.find((f) => {
            try {
              return f.contentWindow === ev.source;
            } catch {
              return false;
            }
          });
          if (!host) return;
          const base = host.getBoundingClientRect();
          if (data.type === 'em_hover' && Array.isArray(data.rects)) {
            const overlay = ensureRectsHost();
            clearRects();
            for (const r of data.rects) {
              const box = document.createElement('div');
              Object.assign(box.style, {
                position: 'fixed',
                left: base.left + r.x + 'px',
                top: base.top + r.y + 'px',
                width: r.width + 'px',
                height: r.height + 'px',
                border: '2px dashed #22c55e',
                borderRadius: '4px',
                boxShadow: '0 0 0 2px rgba(34,197,94,0.15)',
              });
              overlay.appendChild(box);
            }
          } else if (data.type === 'em_click' && data.innerSel) {
            const frameSel = generateSelector(host);
            const composite = frameSel ? `${frameSel} |> ${data.innerSel}` : data.innerSel;
            const inputSel = STATE.box?.querySelector('#__em_selector');
            if (inputSel) inputSel.value = composite;
          }
        } catch {}
      },
      true,
    );
  }

  // --- UI enhancements: selector type toggle, list mode, verify and copy ---
  function ensureUiEnhancements() {
    const root = ensureUi();
    if (!root) return;
    // Add toolbar controls if not exists
    if (root.querySelector('#__em_type_css')) return;
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.marginTop = '8px';
    row.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <label style="font-size:12px; opacity:0.85;">类型:</label>
        <label style="display:inline-flex; align-items:center; gap:4px; font-size:12px;">
          <input id="__em_type_css" name="__em_type" type="radio" value="css" checked /> CSS
        </label>
        <label style="display:inline-flex; align-items:center; gap:4px; font-size:12px;">
          <input id="__em_type_xpath" name="__em_type" type="radio" value="xpath" /> XPath
        </label>
      </div>
      <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px; margin-left:auto;">
        <input id="__em_list_mode" type="checkbox" /> 列表模式
      </label>
    `;
    root.querySelector('div > div').appendChild(row);

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '8px';
    actions.style.marginTop = '8px';
    actions.innerHTML = `
      <div style="display:flex; align-items:center; gap:6px; flex: 2;">
        <label style="font-size:12px; opacity:0.85;">验证动作:</label>
        <select id="__em_action" style="flex:1; padding:4px 6px; border-radius:6px; border:1px solid #d1d5db; background:#111827; color:#F9FAFB;">
          <option value="hover">Hover</option>
          <option value="left_click">Left click</option>
          <option value="double_click">Double click</option>
          <option value="right_click">Right click</option>
          <option value="type_text">Type text</option>
          <option value="press_keys">Press keys</option>
          <option value="scroll">Scroll</option>
        </select>
        <input id="__em_action_text" placeholder="text/keys" style="flex:1; padding:4px 6px; border-radius:6px; border:1px solid #d1d5db; background:#111827; color:#F9FAFB;" />
      </div>
      <div style="display:flex; align-items:center; gap:10px; flex-wrap: wrap;">
        <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px;">
          <span>Button</span>
          <select id="__em_btn" style="padding:2px 6px; border-radius:6px; border:1px solid #d1d5db; background:#111827; color:#F9FAFB;">
            <option value="left">Left</option>
            <option value="middle">Middle</option>
            <option value="right">Right</option>
          </select>
        </label>
        <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px;">
          <input id="__em_opt_bubbles" type="checkbox" checked /> Bubbles
        </label>
        <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px;">
          <input id="__em_opt_cancelable" type="checkbox" checked /> Cancelable
        </label>
        <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px;">
          <input id="__em_mod_alt" type="checkbox" /> altKey
        </label>
        <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px;">
          <input id="__em_mod_ctrl" type="checkbox" /> ctrlKey
        </label>
        <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px;">
          <input id="__em_mod_meta" type="checkbox" /> metaKey
        </label>
        <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px;">
          <input id="__em_mod_shift" type="checkbox" /> shiftKey
        </label>
      </div>
      <div id="__em_scroll_opts" style="display:flex; align-items:center; gap:10px; flex-wrap: wrap; margin-top:6px;">
        <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px;">
          <span>Direction</span>
          <select id="__em_scroll_dir" style="padding:2px 6px; border-radius:6px; border:1px solid #d1d5db; background:#111827; color:#F9FAFB;">
            <option value="down">Down</option>
            <option value="up">Up</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </label>
        <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px;">
          amount(px):<input id="__em_scroll_amt" type="number" value="300" style="width:100px; padding:2px 6px; border-radius:6px; border:1px solid #d1d5db; background:#111827; color:#F9FAFB;" />
        </label>
      </div>
      <div id="__em_nav_opts" style="display:flex; align-items:center; gap:10px; flex-wrap: wrap; margin-top:6px;">
        <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px;">
          <input id="__em_wait_nav" type="checkbox" /> 等待导航
        </label>
        <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px;">
          timeout(ms):<input id="__em_nav_timeout" type="number" value="3000" style="width:120px; padding:2px 6px; border-radius:6px; border:1px solid #d1d5db; background:#111827; color:#F9FAFB;" />
        </label>
      </div>
      <div style="display:flex; align-items:center; gap:10px; flex-wrap: wrap; margin-top:6px;">
        <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px;">
          <input id="__em_use_abs" type="checkbox" /> 使用绝对坐标
        </label>
        <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px;">
          dx:<input id="__em_dx" type="number" value="0" style="width:80px; padding:2px 6px; border-radius:6px; border:1px solid #d1d5db; background:#111827; color:#F9FAFB;" />
        </label>
        <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px;">
          dy:<input id="__em_dy" type="number" value="0" style="width:80px; padding:2px 6px; border-radius:6px; border:1px solid #d1d5db; background:#111827; color:#F9FAFB;" />
        </label>
        <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px;">
          x:<input id="__em_absx" type="number" value="0" style="width:80px; padding:2px 6px; border-radius:6px; border:1px solid #d1d5db; background:#111827; color:#F9FAFB;" />
        </label>
        <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px;">
          y:<input id="__em_absy" type="number" value="0" style="width:80px; padding:2px 6px; border-radius:6px; border:1px solid #d1d5db; background:#111827; color:#F9FAFB;" />
        </label>
      </div>
      <button id="__em_verify" style="flex:1; background:#60a5fa; color:#111; border:none; border-radius:6px; padding:6px 8px; cursor:pointer;">验证</button>
      <button id="__em_copy" style="flex:1; background:#e5e7eb; color:#111; border:1px solid #d1d5db; border-radius:6px; padding:6px 8px; cursor:pointer;">复制</button>
    `;
    root.querySelector('div > div').appendChild(actions);

    // Preferences row
    const prefs = document.createElement('div');
    prefs.style.display = 'flex';
    prefs.style.gap = '12px';
    prefs.style.marginTop = '6px';
    prefs.innerHTML = `
      <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px;">
        <input id="__em_pref_id" type="checkbox" checked /> Prefer ID
      </label>
      <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px;">
        <input id="__em_pref_attr" type="checkbox" checked /> Prefer data/name
      </label>
      <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px;">
        <input id="__em_pref_class" type="checkbox" checked /> Prefer class
      </label>
    `;
    root.querySelector('div > div').appendChild(prefs);

    const typeCss = root.querySelector('#__em_type_css');
    const typeXpath = root.querySelector('#__em_type_xpath');
    const listModeChk = root.querySelector('#__em_list_mode');
    typeCss.addEventListener('change', () => {
      if (typeCss.checked) STATE.selectorType = 'css';
    });
    typeXpath.addEventListener('change', () => {
      if (typeXpath.checked) STATE.selectorType = 'xpath';
    });
    listModeChk.addEventListener('change', () => {
      STATE.listMode = !!listModeChk.checked;
      clearHighlighter();
    });
    // Prefs handlers
    const prefId = root.querySelector('#__em_pref_id');
    const prefAttr = root.querySelector('#__em_pref_attr');
    const prefClass = root.querySelector('#__em_pref_class');
    prefId.addEventListener('change', () => (STATE.prefs.preferId = !!prefId.checked));
    prefAttr.addEventListener('change', () => (STATE.prefs.preferStableAttr = !!prefAttr.checked));
    prefClass.addEventListener('change', () => (STATE.prefs.preferClass = !!prefClass.checked));
    root.querySelector('#__em_verify').addEventListener('click', verifySelectorNow);
    root.querySelector('#__em_copy').addEventListener('click', copySelectorNow);
    // Toggle visibility of options based on action
    const actionSel = root.querySelector('#__em_action');
    const navOpts = root.querySelector('#__em_nav_opts');
    const scrollOpts = root.querySelector('#__em_scroll_opts');
    const onActionChange = () => {
      const val = actionSel.value;
      const isClick = val === 'left_click' || val === 'double_click' || val === 'right_click';
      navOpts.style.display = isClick ? 'flex' : 'none';
      scrollOpts.style.display = val === 'scroll' ? 'flex' : 'none';
    };
    actionSel.addEventListener('change', onActionChange);
    onActionChange();
  }

  function verifySelectorNow() {
    try {
      const sel = STATE.box.querySelector('#__em_selector').value.trim();
      if (!sel) return;
      // 1) Visual verification in content world for quick feedback
      const matches = STATE.selectorType === 'xpath' ? evaluateXPathAll(sel) : queryAllDeep(sel);
      clearRects();
      const host = ensureRectsHost();
      for (const el of matches) {
        const r = el.getBoundingClientRect();
        const box = document.createElement('div');
        Object.assign(box.style, {
          position: 'fixed',
          left: r.left + 'px',
          top: r.top + 'px',
          width: r.width + 'px',
          height: r.height + 'px',
          border: '2px solid #3b82f6',
          borderRadius: '4px',
          boxShadow: '0 0 0 2px rgba(59,130,246,0.15)',
        });
        host.appendChild(box);
      }
      // 2) End-to-end validation via background using the same helper/tools pipeline
      const action = document.getElementById('__em_action').value;
      const actionText = document.getElementById('__em_action_text').value;
      const payload = {
        type: 'element_marker_validate',
        selector: sel,
        selectorType: STATE.selectorType,
        action,
      };
      if (action === 'type_text') payload.text = actionText || '';
      if (action === 'press_keys') payload.keys = actionText || '';
      // include modifiers and event flags for click actions
      payload.modifiers = {
        altKey: !!document.getElementById('__em_mod_alt')?.checked,
        ctrlKey: !!document.getElementById('__em_mod_ctrl')?.checked,
        metaKey: !!document.getElementById('__em_mod_meta')?.checked,
        shiftKey: !!document.getElementById('__em_mod_shift')?.checked,
      };
      payload.bubbles = !!document.getElementById('__em_opt_bubbles')?.checked;
      payload.cancelable = !!document.getElementById('__em_opt_cancelable')?.checked;
      payload.button = String(document.getElementById('__em_btn').value || 'left');
      if (action === 'scroll') {
        payload.scrollDirection = String(
          document.getElementById('__em_scroll_dir').value || 'down',
        );
        const amt = Number(document.getElementById('__em_scroll_amt').value || 300);
        if (Number.isFinite(amt)) payload.scrollAmount = amt;
      }
      if (action === 'left_click' || action === 'double_click' || action === 'right_click') {
        payload.waitForNavigation = !!document.getElementById('__em_wait_nav')?.checked;
        const tmo = Number(document.getElementById('__em_nav_timeout').value || 3000);
        if (Number.isFinite(tmo)) payload.timeoutMs = tmo;
      }
      const useAbs = !!document.getElementById('__em_use_abs')?.checked;
      if (useAbs) {
        const ax = Number(document.getElementById('__em_absx').value || 0);
        const ay = Number(document.getElementById('__em_absy').value || 0);
        if (Number.isFinite(ax) && Number.isFinite(ay)) payload.coordinates = { x: ax, y: ay };
        payload.relativeTo = 'viewport';
      } else {
        const dx = Number(document.getElementById('__em_dx').value || 0);
        const dy = Number(document.getElementById('__em_dy').value || 0);
        if (Number.isFinite(dx)) payload.offsetX = dx;
        if (Number.isFinite(dy)) payload.offsetY = dy;
        payload.relativeTo = 'element';
      }
      chrome.runtime.sendMessage(payload, function (_res) {
        /* end-to-end validation */
      });
    } catch {}
  }

  function copySelectorNow() {
    try {
      const sel = STATE.box.querySelector('#__em_selector').value.trim();
      if (!sel) return;
      navigator.clipboard && navigator.clipboard.writeText(sel).catch(() => {});
    } catch {}
  }

  // Ensure enhancements on load (top frame only)
  if (IS_MAIN) setTimeout(ensureUiEnhancements, 0);

  // Hotkeys: Space select, Esc close, ArrowUp/Down adjust ancestor/child
  function setSelection(el) {
    if (!(el instanceof Element)) return;
    STATE.selectedEl = el;
    const sel =
      STATE.selectorType === 'xpath'
        ? generateXPath(el)
        : STATE.listMode
          ? generateListSelector(el)
          : generateSelector(el);
    const name = getAccessibleName(el) || el.tagName.toLowerCase();
    const inputSel = STATE.box.querySelector('#__em_selector');
    const inputName = STATE.box.querySelector('#__em_name');
    inputSel.value = sel;
    if (!inputName.value) inputName.value = name;
    moveHighlighterTo(el);
  }
  function onKeyDown(e) {
    if (!STATE.active) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      stop();
    } else if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      const t = STATE.hoverEl || STATE.selectedEl;
      if (t) setSelection(t);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const base = STATE.selectedEl || STATE.hoverEl;
      if (base && base.parentElement) setSelection(base.parentElement);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const base = STATE.selectedEl || STATE.hoverEl;
      if (base && base.firstElementChild) setSelection(base.firstElementChild);
    }
  }

  // --- List utilities (simplified from Automa) ---
  function getAllSiblings(el, selector) {
    const siblings = [el];
    const validate = (element) => {
      const isSameTag = el.tagName === element.tagName;
      let ok = isSameTag;
      if (selector) {
        try {
          ok = ok && !!element.querySelector(selector);
        } catch {}
      }
      return ok;
    };
    let next = el,
      prev = el;
    let elementIndex = 1;
    while ((prev = prev && prev.previousElementSibling)) {
      if (validate(prev)) {
        elementIndex += 1;
        siblings.unshift(prev);
      }
    }
    while ((next = next && next.nextElementSibling)) {
      if (validate(next)) siblings.push(next);
    }
    return { elements: siblings, index: elementIndex };
  }

  function getElementList(el, maxDepth = 50, paths = []) {
    if (maxDepth === 0 || !el || el.tagName === 'BODY') return null;
    let selector = el.tagName.toLowerCase();
    const { elements, index } = getAllSiblings(el, paths.join(' > '));
    let siblings = elements;
    if (index !== 1) selector += `:nth-of-type(${index})`;
    paths.unshift(selector);
    if (siblings.length === 1) {
      siblings = getElementList(el.parentElement, maxDepth - 1, paths);
    }
    return siblings;
  }

  function computeElementList(target) {
    try {
      return getElementList(target) || [target];
    } catch {
      return [target];
    }
  }

  function generateListSelector(target) {
    // Similar approach: choose parent as list anchor and produce child selector within
    const list =
      STATE.hoveredList && STATE.hoveredList.length
        ? STATE.hoveredList
        : computeElementList(target);
    const selected = list && list[0] ? list[0] : target;
    const parent = selected.parentElement || target.parentElement;
    if (!parent) return generateSelector(target);
    const parentSel = generateSelector(parent);
    const childRel = generateSelectorWithinRoot(selected, parent);
    return parentSel && childRel ? `${parentSel} ${childRel}` : generateSelector(target);
  }

  function generateSelectorWithinRoot(el, root) {
    // Reduce scope to root for uniqueness checks
    if (!(el instanceof Element)) return '';
    const tag = el.tagName.toLowerCase();
    // unique id under doc still valid
    if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) {
      return `#${CSS.escape(el.id)}`;
    }
    const attrNames = [
      'data-testid',
      'data-testId',
      'data-test',
      'data-qa',
      'data-cy',
      'name',
      'title',
      'alt',
      'aria-label',
    ];
    for (const attr of attrNames) {
      const v = el.getAttribute && el.getAttribute(attr);
      if (!v) continue;
      const aSel = `[${attr}="${CSS.escape(v)}"]`;
      const testSel = /^(input|textarea|select)$/i.test(tag) ? `${tag}${aSel}` : aSel;
      try {
        if (root.querySelectorAll(testSel).length === 1) return testSel;
      } catch {}
    }
    try {
      const classes = Array.from(el.classList || []).filter((c) => c && /^[a-zA-Z0-9_-]+$/.test(c));
      for (const cls of classes) {
        const sel = `.${CSS.escape(cls)}`;
        if (root.querySelectorAll(sel).length === 1) return sel;
      }
      const t = tag;
      for (const cls of classes) {
        const sel = `${t}.${CSS.escape(cls)}`;
        if (root.querySelectorAll(sel).length === 1) return sel;
      }
    } catch {}
    // fallback: relative path to root
    const segs = [];
    let cur = el;
    while (cur && cur !== root && cur !== document.body) {
      let seg = cur.tagName.toLowerCase();
      const parent = cur.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === cur.tagName);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(cur) + 1;
          seg += `:nth-of-type(${idx})`;
        }
      }
      segs.unshift(seg);
      cur = parent;
    }
    return segs.join(' > ');
  }

  // --- XPath generator (basic, stable where possible) ---
  function generateXPath(el) {
    if (!(el instanceof Element)) return '';
    if (el.id) return `//*[@id=${JSON.stringify(el.id)}]`;
    const segs = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      const tag = cur.tagName.toLowerCase();
      if (cur.id) {
        segs.unshift(`//*[@id=${JSON.stringify(cur.id)}]`);
        break;
      }
      let i = 1;
      let sib = cur;
      while ((sib = sib.previousElementSibling)) {
        if (sib.tagName.toLowerCase() === tag) i++;
      }
      segs.unshift(`${tag}[${i}]`);
      cur = cur.parentElement;
    }
    return segs[0]?.startsWith('//*') ? segs.join('/') : '//' + segs.join('/');
  }

  // --- Deep query across shadow roots (minimal) ---
  function* walkAllNodesDeep(root) {
    const stack = [root];
    let count = 0;
    const MAX = 10000;
    while (stack.length) {
      const node = stack.pop();
      if (!node) continue;
      if (++count > MAX) break;
      yield node;
      try {
        const children = node.children ? Array.from(node.children) : [];
        for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
        const any = node;
        const sr = any && any.shadowRoot ? any.shadowRoot : null;
        if (sr && sr.children) {
          const srChildren = Array.from(sr.children);
          for (let i = srChildren.length - 1; i >= 0; i--) stack.push(srChildren[i]);
        }
      } catch {}
    }
  }
  function queryAllDeep(selector) {
    const results = [];
    for (const node of walkAllNodesDeep(document)) {
      if (!(node instanceof Element)) continue;
      try {
        if (node.matches && node.matches(selector)) results.push(node);
      } catch {}
    }
    return results;
  }
  function evaluateXPathAll(xpath) {
    try {
      const arr = [];
      const res = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null,
      );
      for (let i = 0; i < res.snapshotLength; i++) {
        const n = res.snapshotItem(i);
        if (n && n.nodeType === 1) arr.push(n);
      }
      return arr;
    } catch {
      return [];
    }
  }
})();
