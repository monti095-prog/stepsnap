(() => {
  // Remove listeners from any earlier copy (e.g. left over after reloading the extension).
  window.__stepsnapCleanup?.();
  const off = [];
  const listen = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); off.push(() => t.removeEventListener(ev, fn, o)); };
  window.__stepsnapCleanup = () => off.forEach(f => f());

  const isTop = window === window.top;
  let on = false;
  const apply = r => (on = !!(r && r.on && !r.paused));
  try {
    chrome.storage.local.get('rec', d => apply(d.rec));
    chrome.storage.onChanged.addListener((c, a) => a === 'local' && c.rec && apply(c.rec.newValue));
  } catch (e) {}

  const INTERACTIVE = 'a,button,input,select,textarea,summary,label,[role=button],[role=link],[role=tab],[role=menuitem],[role=menuitemradio],[role=menuitemcheckbox],[role=checkbox],[role=switch],[role=option],[role=treeitem],[onclick],[tabindex]';
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const short = (s, n = 60) => { s = clean(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const rectOf = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const valOf = el => (el.isContentEditable ? el.innerText : el.value) || '';

  function labelOf(el) {
    const aria = el.getAttribute('aria-label');
    if (aria) return short(aria);
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = clean(by.split(' ').map(id => document.getElementById(id)?.textContent || '').join(' '));
      if (t) return short(t);
    }
    if (el.labels && el.labels[0]) { const t = clean(el.labels[0].textContent); if (t) return short(t); }
    if (el.tagName === 'INPUT' && ['button', 'submit', 'reset'].includes(el.type) && el.value) return short(el.value);
    if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
      const t = short(el.innerText || el.textContent);
      if (t) return t;
      const img = el.querySelector('img[alt]');
      if (img && clean(img.alt)) return short(img.alt);
      if (el.title) return short(el.title);
    }
    return short(el.placeholder || el.title || el.alt || el.name || '');
  }

  function kindOf(el) {
    const role = el.getAttribute('role'), t = (el.type || '').toLowerCase();
    if (el.tagName === 'A' || role === 'link') return 'link';
    if (el.tagName === 'BUTTON' || role === 'button' || ['button', 'submit', 'reset', 'image'].includes(t)) return 'button';
    if (t === 'checkbox' || role === 'checkbox' || role === 'switch') return 'checkbox';
    if (t === 'radio') return 'option';
    if (role === 'tab') return 'tab';
    if (role && role.startsWith('menuitem')) return 'menu item';
    return '';
  }

  // Small confirmation toast (top frame only). Removed on every new pointerdown so it never lands in a screenshot.
  let toastEl;
  function toast(text, warn) {
    if (!isTop) return;
    toastEl?.remove();
    toastEl = document.createElement('div');
    toastEl.textContent = text;
    toastEl.style.cssText = `all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647;background:${warn ? '#b45309' : '#111827'};color:#fff;font:600 13px system-ui,sans-serif;padding:8px 12px;border-radius:8px;pointer-events:none`;
    document.documentElement.appendChild(toastEl);
    const mine = toastEl;
    setTimeout(() => mine.remove(), warn ? 3500 : 900);
  }

  function send(step) {
    try {
      chrome.runtime.sendMessage(
        { type: 'step', step: { ...step, url: location.href, pageTitle: document.title, vw: innerWidth, vh: innerHeight } },
        n => { if (chrome.runtime.lastError) return; if (n) toast('● Step ' + n + ' captured'); }
      );
    } catch (e) { toast('StepSnap was reloaded: refresh this page', true); }
  }

  // Iframes pass steps up to their parent, which adds the iframe's offset, until the top frame sends it.
  const emit = step => (isTop ? send(step) : window.parent.postMessage({ __ss: 1, step }, '*'));
  listen(window, 'message', e => {
    const d = e.data;
    if (!on || !d || d.__ss !== 1 || !d.step) return;
    const f = [...document.querySelectorAll('iframe,frame')].find(x => x.contentWindow === e.source);
    if (!f) return;
    const r = f.getBoundingClientRect(), ox = r.left + f.clientLeft, oy = r.top + f.clientTop, s = d.step;
    if (s.x != null) { s.x += ox; s.y += oy; }
    if (s.rect) { s.rect.x += ox; s.rect.y += oy; }
    emit(s);
  });

  let lastEmit = 0;
  function recordClick(target, x, y) {
    if (!(target instanceof Element) || target === document.documentElement || target === document.body) return;
    const active = document.activeElement;
    if (active && active !== document.body && !active.contains(target)) flushTyping(active); // typed text comes before the click
    const el = target.closest(INTERACTIVE) || target;
    const t = (el.type || '').toLowerCase();
    const textField = (el.tagName === 'INPUT' && !['button', 'submit', 'reset', 'checkbox', 'radio', 'image', 'file'].includes(t)) || el.tagName === 'TEXTAREA' || el.isContentEditable;
    if (textField || el.tagName === 'SELECT') return; // typing / select steps cover these
    const rect = rectOf(el);
    if (x == null) { x = rect.x + rect.w / 2; y = rect.y + rect.h / 2; }
    const name = labelOf(el), kind = kindOf(el);
    lastEmit = Date.now();
    emit({ type: 'click', text: name ? `Click “${name}”${kind ? ' ' + kind : ''}` : 'Click here', x, y, rect });
  }

  // pointerdown (not click): menus and popovers often remove themselves before "click" ever fires.
  listen(window, 'pointerdown', e => {
    toastEl?.remove();
    if (!on || !e.isTrusted || e.button !== 0 || !e.isPrimary) return;
    const de = document.documentElement;
    if (e.clientX >= de.clientWidth || e.clientY >= de.clientHeight) return; // scrollbar
    recordClick(e.composedPath()[0], e.clientX, e.clientY);
  }, true);

  // Keyboard-activated clicks (Enter/Space on a focused button).
  listen(window, 'click', e => {
    if (!on || !e.isTrusted || e.detail !== 0 || Date.now() - lastEmit < 600) return;
    recordClick(e.composedPath()[0]);
  }, true);

  function flushTyping(el) {
    if (!on || !el) return;
    const editable = el.isContentEditable;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || editable)) return;
    const t = (el.type || 'text').toLowerCase();
    if (['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'image'].includes(t)) return;
    const value = valOf(el);
    if (!clean(value) || el.__ssLast === value) return;
    el.__ssLast = value;
    const hint = (el.name || '') + (el.id || '') + (el.autocomplete || '');
    const sensitive = t === 'password' || /pass|pwd|cvv|cvc|card|ssn|otp/i.test(hint);
    const name = labelOf(el);
    emit({
      type: 'type',
      text: sensitive ? `Enter your ${name || 'password'}` : `Type “${short(value, 80)}”${name ? ` in the “${name}” field` : ''}`,
      rect: rectOf(el)
    });
  }

  listen(window, 'focusout', e => flushTyping(e.composedPath()[0]), true);
  listen(window, 'pagehide', () => flushTyping(document.activeElement));
  listen(window, 'change', e => {
    const el = e.composedPath()[0];
    if (on && el.tagName === 'SELECT') {
      const opt = el.selectedOptions[0], name = labelOf(el);
      emit({ type: 'select', text: `Select “${short(opt ? opt.text : el.value)}”${name ? ` from “${name}”` : ''}`, rect: rectOf(el) });
    } else flushTyping(el);
  }, true);

  // Enter: save what was typed BEFORE the page clears the box (chat apps), then record the key press.
  listen(window, 'keydown', e => {
    if (!on || e.key !== 'Enter' || e.isComposing || e.shiftKey) return;
    const el = e.composedPath()[0];
    if (!(el instanceof Element)) return;
    const isInput = el.tagName === 'INPUT' && !['button', 'submit', 'checkbox', 'radio', 'image'].includes(el.type);
    const multi = el.tagName === 'TEXTAREA' || el.isContentEditable;
    if (!isInput && !multi) return;
    const rect = rectOf(el), before = valOf(el);
    flushTyping(el);
    if (isInput) emit({ type: 'key', text: 'Press Enter', rect });
    else setTimeout(() => { if (clean(before) && !clean(valOf(el))) emit({ type: 'key', text: 'Press Enter to send', rect }); }, 80);
  }, true);
})();
