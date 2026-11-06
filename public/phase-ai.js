/**
 * Phase AI: the chat that hangs under the header.
 * Common questions are answered here from ai-answers.json (no AI call). Anything else goes to /api/chat.
 * Nothing is stored in the browser: the conversation lives in memory and is gone when the page is reloaded.
 */
(function () {
  'use strict';

  const Match = window.PhaseAIMatch;
  const HOURLY_LIMIT = 10;           // AI messages per visitor per hour (the server enforces the same number)
  const MAX_TYPED = 300;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));

  const ORB = '<svg class="pa-orb" viewBox="10 14 236 228" aria-hidden="true" focusable="false"><g class="pa-t"><path fill="#F5EFE3" transform="translate(-13 0)" d="M28.18 122A100 100 0 0 1 227.82 122Z"/></g><g class="pa-b"><path fill="#B08D57" transform="translate(13 0)" d="M28.18 134A100 100 0 0 0 227.82 134Z"/></g></svg>';
  const BARS = '<span class="pa-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  const S = { data: null, loading: null, open: false, started: false, msgs: [], aiUsed: [], left: null, brief: '', lastQuestion: '', session: '', formOpen: false };
  let lip, scrim, drawer, log, input, sendBtn, note, leftEl, ringEl, glowEl, arcA, arcB;

  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const norm = (p) => p.replace(/\.html$/, '').replace(/\/index$/, '/').replace(/(.)\/$/, '$1');
  const pageKey = () => { const p = norm(location.pathname).replace(/^\//, ''); return ['services', 'work', 'process', 'contact'].includes(p) ? p : 'default'; };
  const isPhone = () => matchMedia('(max-width: 767px)').matches;

  function loadData() {
    if (S.data) return Promise.resolve(S.data);
    return (S.loading = S.loading || fetch('/ai-answers.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((d) => (S.data = d)).catch((e) => { S.loading = null; throw e; }));
  }

  // ---------- building the pieces ----------
  function build() {
    const header = document.querySelector('header.topbar');
    if (!header) return;

    lip = el('button', 'pa-lip', '<span>Chat with Phase AI</span>');
    lip.type = 'button';
    lip.setAttribute('aria-expanded', 'false');
    lip.setAttribute('aria-controls', 'phase-ai');
    header.appendChild(lip);

    scrim = el('div', 'pa-scrim');
    scrim.hidden = true;

    drawer = el('section', 'pa', '<div class="pa-glow" aria-hidden="true"></div><div class="pa-ring" aria-hidden="true"><i class="pa-arc"></i><i class="pa-arc pa-long"></i></div>' +
      '<div class="pa-surface">' +
        '<div class="pa-head">' + ORB + '<div class="pa-title"><strong>Phase AI</strong><span class="pa-status">Answers in English &amp; Hinglish</span></div>' + BARS +
          '<button class="pa-close" type="button" aria-label="Close chat">&#x2715;</button></div>' +
        '<div class="pa-log" data-lenis-prevent role="log" aria-live="polite" aria-label="Conversation"></div>' +
        '<div class="pa-foot">' +
          '<form class="pa-input" autocomplete="off"><input type="text" maxlength="' + MAX_TYPED + '" placeholder="Ask in English or Hinglish" aria-label="Your message" enterkeyhint="send">' +
            '<button class="pa-send" type="submit" aria-label="Send message"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></form>' +
          '<div class="pa-direct"><span class="pa-note">AI assistant. The team confirms every detail. Messages the AI answers are saved. <a href="/privacy">Privacy</a></span><span class="pa-left" aria-live="polite"></span></div>' +
          '<div class="pa-grab" aria-hidden="true"></div>' +
        '</div>' +
      '</div>');
    drawer.id = 'phase-ai';
    drawer.hidden = true;
    drawer.dataset.state = 'closed';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-label', 'Phase AI chat');
    document.body.append(scrim, drawer);

    log = drawer.querySelector('.pa-log');
    input = drawer.querySelector('.pa-input input');
    sendBtn = drawer.querySelector('.pa-send');
    leftEl = drawer.querySelector('.pa-left');
    ringEl = drawer.querySelector('.pa-ring');
    glowEl = drawer.querySelector('.pa-glow');
    [arcA, arcB] = drawer.querySelectorAll('.pa-arc');
    input.addEventListener('input', () => edgeKick(0.5));
    input.addEventListener('focus', () => { edge.focus = true; });
    input.addEventListener('blur', () => { edge.focus = false; });

    lip.addEventListener('click', () => (S.open ? close() : open()));
    lip.addEventListener('pointerenter', () => loadData().catch(() => {}), { once: true });
    scrim.addEventListener('click', () => close());
    drawer.querySelector('.pa-close').addEventListener('click', () => close());
    drawer.querySelector('.pa-input').addEventListener('submit', (e) => { e.preventDefault(); const t = input.value; input.value = ''; submit(t); });
    drawer.addEventListener('keydown', trapTab);
    drawer.addEventListener('click', onLink);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.open) close(); });
    addEventListener('popstate', () => close(true));
    addEventListener('resize', () => S.open && place());
    if (window.visualViewport) visualViewport.addEventListener('resize', () => S.open && place());

    // pull the grab handle up to close
    const grab = drawer.querySelector('.pa-grab');
    let y0 = null;
    grab.addEventListener('pointerdown', (e) => { y0 = e.clientY; grab.setPointerCapture(e.pointerId); });
    grab.addEventListener('pointerup', (e) => { if (y0 !== null && e.clientY - y0 < -40) close(); y0 = null; });
    grab.addEventListener('click', () => close());

    // the drawer grows and shrinks with the conversation: glide from the old height to the new one
    let glide = null;
    new MutationObserver(() => {
      const now = drawer.offsetHeight;                       // a running glide shows its current height here
      const live = !reduced && S.open && S.settled && drawer.dataset.state === "open";
      const from = glide ? now : S.height;
      if (glide) glide.cancel();
      const to = S.height = drawer.offsetHeight;             // the new natural height
      if (!live || from == null || Math.abs(to - from) < 3) return;
      glide = drawer.animate([{ height: from + "px" }, { height: to + "px" }], { duration: 480, easing: "cubic-bezier(0.32, 0.72, 0, 1)" });
      glide.onfinish = () => { glide = null; log.scrollTop = log.scrollHeight; };
    }).observe(log, { childList: true, subtree: true });

    const prefetch = () => loadData().catch(() => {});
    if (window.requestIdleCallback) requestIdleCallback(prefetch, { timeout: 4000 }); else setTimeout(prefetch, 2500);
  }

  // The light round the edge reacts like Bixby's: calm while idle, livelier as you type,
  // full while Phase AI thinks, and it pulses when you send and when an answer arrives.
  const edge = { e: 0, kick: 0, a: 0, t: 0, raf: 0, speakUntil: 0, focus: false, speak: false, n: 0, ema: 0, slow: 0, lite: 0 };
  function edgeSet(e) {
    ringEl.style.opacity = (0.55 + 0.45 * e).toFixed(2);
    const g = e < 0.3 ? '0' : e < 0.65 ? '1' : '2';
    if (drawer.dataset.glow !== g) drawer.dataset.glow = g;
    arcB.style.opacity = Math.max(0, (e - 0.3) / 0.7).toFixed(2);       // a longer, softer tail joins in as the light gets livelier
  }
  function edgeTick(now) {
    if (drawer.hidden) { edge.raf = 0; return; }
    const ms = now - (edge.t || now);
    const dt = Math.min(0.05, ms / 1000);
    edge.t = now;
    // frame-rate check: if a quarter of 120 frames in a row take longer than 33 ms, the machine is struggling, so the expensive
    // effects are dropped (glass blur first, then the moving light). A few slow frames on a good machine change nothing.
    if (++edge.n > 45) { edge.ema++; if (ms > 33) edge.slow++; }
    if (edge.ema >= 120) { if (edge.slow > 30 && edge.lite < 2) { edge.lite++; drawer.dataset.lite = edge.lite; } edge.ema = 0; edge.slow = 0; }
    const speaking = now < edge.speakUntil;
    const target = drawer.dataset.busy === '1' ? 0.95 : speaking ? 0.7 : edge.focus ? 0.4 : 0.2;
    edge.e += (target - edge.e) * (1 - Math.exp(-dt * 3.5));
    edge.kick *= Math.exp(-dt * 3);
    const e = Math.min(1, edge.e + edge.kick * 0.5 + 0.04 * Math.sin(now / 800));
    edge.a = (edge.a + dt * (20 + 300 * e)) % 360;
    if (edge.lite < 2) {
      arcA.style.transform = 'rotate(' + edge.a.toFixed(1) + 'deg)';
      arcB.style.transform = 'rotate(' + (120 - edge.a * 0.7).toFixed(1) + 'deg)';
    }
    edgeSet(e);
    if (speaking !== edge.speak) { edge.speak = speaking; drawer.dataset.speak = speaking ? '1' : '0'; }
    edge.raf = requestAnimationFrame(edgeTick);
  }
  function edgeStart() {
    edge.e = 0; edge.t = 0; edge.n = 0; edge.ema = 0; edge.slow = 0;
    if (reduced) edgeSet(0.3); else if (!edge.raf) edge.raf = requestAnimationFrame(edgeTick);
  }
  const edgeKick = (k) => { edge.kick = Math.min(1.2, edge.kick + k); };

  function place() {
    const top = Math.round(lip.getBoundingClientRect().bottom + 10);
    const vh = window.visualViewport ? visualViewport.height : innerHeight;
    const keyboard = window.visualViewport && vh < innerHeight - 120;
    const bottomGap = isPhone() && !keyboard ? 96 : 16;        // on phones keep the bottom tab bar visible
    drawer.style.setProperty('--pa-top', top + 'px');
    S.height = null;
    const maxH = Math.max(260, vh - top - bottomGap);
    drawer.style.setProperty('--pa-max', maxH + 'px');
    drawer.style.setProperty('--pa-d', Math.ceil(Math.hypot(Math.min(680, innerWidth - (isPhone() ? 20 : 24)), maxH)) + 'px');   // big enough that the rotating light always covers the edge
  }

  function open() {
    if (S.open) return;
    S.open = true;
    place();
    scrim.hidden = false;
    requestAnimationFrame(() => scrim.classList.add('on'));
    drawer.hidden = false;
    drawer.dataset.state = 'open';
    lip.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    S.session = S.session || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
    edgeStart();
    S.settled = false;
    setTimeout(() => { S.settled = true; S.height = drawer.offsetHeight; }, 800);
    start();
    setTimeout(() => { if (S.open && !isPhone()) input.focus(); }, 350);
  }

  function close(immediate, keepFocus, after) {
    if (!S.open) return;
    S.open = false;
    lip.setAttribute('aria-expanded', 'false');
    scrim.classList.remove('on');
    const done = () => {
      if (S.open) return;
      drawer.hidden = true; drawer.dataset.state = 'closed'; scrim.hidden = true;
      document.body.style.overflow = '';
      if (!keepFocus && !immediate) lip.focus({ preventScroll: true });
      if (after) requestAnimationFrame(after);   // runs once the page can scroll again
    };
    if (immediate || reduced) done();
    else { drawer.dataset.state = 'closing'; setTimeout(done, 400); }
  }

  function trapTab(e) {
    if (e.key !== 'Tab') return;
    const items = [...drawer.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not(.hp), textarea:not([disabled])')].filter((n) => n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // buttons that lead to a page or a section on this site: same page scrolls, another page lets the site's own navigation take over
  function onLink(e) {
    const a = e.target.closest('a[href]');
    if (!a || a.closest('.pa-form') && a.target === '_blank') return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || a.target === '_blank') return;
    if (norm(url.pathname) === norm(location.pathname)) {
      e.preventDefault();
      const target = url.hash && document.querySelector(url.hash);
      close(false, true, () => { if (target) window.lenis ? window.lenis.scrollTo(target, { offset: -100 }) : target.scrollIntoView({ behavior: 'smooth' }); });
    } else {
      close(true, true);
    }
  }

  // ---------- the conversation ----------
  function scrollLog() { requestAnimationFrame(() => { log.scrollTo({ top: log.scrollHeight, behavior: reduced ? 'auto' : 'smooth' }); }); }
  function clearChips() { log.querySelectorAll('.pa-chips').forEach((n) => n.remove()); }
  function setBusy(on) { drawer.dataset.busy = on ? '1' : '0'; sendBtn.disabled = on; }
  const fill = (s, vars = {}) => String(s).replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] != null ? vars[k] : m));

  function addUser(text) {
    const n = el('div', 'pa-msg pa-user');
    n.textContent = text;
    log.appendChild(n);
    edgeKick(0.9);
    S.msgs.push({ role: 'user', content: text });
    scrollLog();
  }

  // an answer: short text revealed word by word, then its buttons
  function addAI(text, opts = {}) {
    const wrap = el('div', 'pa-msg pa-ai');
    const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
    const total = lines.join(' ').split(/\s+/).length;
    wrap.style.setProperty('--step', Math.max(12, Math.min(30, Math.round(1400 / total))) + 'ms');
    let i = 0, list = null;
    const words = (line, node) => line.split(/\s+/).forEach((w, k, arr) => {
      const s = el('span', 'pa-w'); s.style.setProperty('--i', i++); s.textContent = w; node.appendChild(s);
      if (k < arr.length - 1) node.appendChild(document.createTextNode(' '));
    });
    lines.forEach((line) => {
      if (/^[-•]\s+/.test(line)) { list = list || wrap.appendChild(el('ul')); words(line.replace(/^[-•]\s+/, ''), list.appendChild(el('li'))); }
      else { list = null; words(line, wrap.appendChild(el('p'))); }
    });
    if (opts.icon) wrap.insertBefore(el('div', 'pa-done', CHECK), wrap.firstChild);
    log.appendChild(wrap);
    S.msgs.push({ role: 'assistant', content: text });
    const delay = reduced ? 0 : (i * (parseInt(wrap.style.getPropertyValue('--step'), 10) || 26)) / 1000 + 0.1;
    edge.speakUntil = performance.now() + delay * 1000 + 500;
    edgeKick(1);
    if (opts.actions && opts.actions.length) wrap.appendChild(actionRow(opts.actions, delay));
    if (opts.choices && opts.choices.length) wrap.appendChild(choiceRow(opts.choices, delay));
    if (opts.chips && opts.chips.length) wrap.appendChild(choiceRow(opts.chips, delay));
    scrollLog();
    return wrap;
  }

  function showTyping() {
    const n = el('div', 'pa-msg pa-typing', ORB + BARS + '<span>Thinking</span>');
    n.setAttribute('role', 'status');
    log.appendChild(n); setBusy(true); scrollLog();
    return () => { n.remove(); setBusy(false); };
  }

  const whatsappMsg = () => (S.lastQuestion ? `Hi Phaseline, I was chatting with Phase AI. My question: ${S.lastQuestion}` : "Hi, I'd like to discuss a project.");
  function actionNode(id, isFirstForm) {
    const a = S.data.actions[id];
    if (!a) return null;
    const label = a.label;
    if (a.type === 'form') { const b = el('button', 'pa-chip is-primary', label); b.type = 'button'; b.addEventListener('click', () => showForm()); return b; }
    const n = el('a', 'pa-chip', label + ' <span aria-hidden="true">&rarr;</span>');
    if (a.type === 'whatsapp') { n.href = `${S.data.contact.whatsappLink}?text=${encodeURIComponent(whatsappMsg())}`; n.target = '_blank'; n.rel = 'noopener noreferrer'; }
    else if (a.type === 'email') n.href = `mailto:${S.data.contact.email}?subject=${encodeURIComponent('Enquiry from Phase AI chat')}&body=${encodeURIComponent(whatsappMsg())}`;
    else n.href = a.href;
    return n;
  }
  function actionRow(ids, delay) {
    const row = el('div', 'pa-chips');
    row.style.setProperty('--delay', delay + 's');
    ids.forEach((id) => { const n = actionNode(id); if (n) row.appendChild(n); });
    return row;
  }
  function choiceRow(items, delay) {
    const row = el('div', 'pa-chips');
    row.style.setProperty('--delay', delay + 's');
    items.forEach((c) => { const b = el('button', 'pa-chip', c.label); b.type = 'button'; b.addEventListener('click', () => ask(c)); row.appendChild(b); });
    return row;
  }

  // a starter or choice button behaves like a typed question that always has a stored answer
  async function ask(c) {
    clearChips();
    addUser(c.label);
    S.lastQuestion = c.label;
    const entry = S.data.entries.find((e) => e.id === c.entry);
    if (entry) await replyLocal(entry, false);
  }

  async function replyLocal(entry, hinglish) {
    const stop = showTyping();
    await wait(2000);   // stored answers feel considered, not instant
    stop();
    const text = hinglish && entry.hi ? entry.hi : entry.answer;
    const choices = entry.choices ? S.data.choices[entry.choices] : null;
    addAI(text, { actions: entry.actions, choices });
    if (entry.openForm) setTimeout(() => showForm(true), reduced ? 0 : 500);
  }

  function limitReply(kind, hinglish) {
    const m = S.data[kind];
    addAI(hinglish && m.hi ? m.hi : m.answer, { actions: m.actions });
  }

  async function submit(raw) {
    const text = String(raw).replace(/\s+/g, ' ').trim().slice(0, MAX_TYPED);
    if (!text || drawer.dataset.busy === '1') return;
    try { await loadData(); } catch (_) { addUser(text); addAI("I can't load my answers right now. The team can help directly.", { actions: [] }); return; }
    clearChips();
    addUser(text);
    S.lastQuestion = text;
    const hinglish = Match ? Match.isHinglish(text) : false;
    const entry = Match ? Match.find(text, S.data.entries) : null;
    if (entry) return replyLocal(entry, hinglish);
    return askAI(text, hinglish);
  }

  async function askAI(text, hinglish) {
    const now = Date.now();
    S.aiUsed = S.aiUsed.filter((t) => now - t < 3600e3);
    if (S.aiUsed.length >= HOURLY_LIMIT) { updateLeft(0); return limitReply('limit', hinglish); }
    const stop = showTyping();
    let body = null, status = 0;
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: S.msgs.slice(-6), session: S.session, page: pageKey() }),
        signal: AbortSignal.timeout(25000),
      });
      status = r.status;
      body = await r.json().catch(() => null);
    } catch (_) { status = 0; }
    stop();
    if (status === 200 && body && body.reply) {
      S.aiUsed.push(now);
      if (body.brief) S.brief = body.brief;
      updateLeft(typeof body.left === 'number' ? body.left : HOURLY_LIMIT - S.aiUsed.length);
      const actions = (body.actions || []).filter((id) => S.data.actions[id]);
      addAI(body.reply, { actions });
      if (actions.includes('form') && !reduced) { /* the Start a project button is already shown with the reply */ }
      return;
    }
    if (status === 429 && body && body.error === 'limit') { updateLeft(0); return limitReply('limit', hinglish); }
    if (status === 429) return limitReply('busy', hinglish);
    limitReply('fallback', hinglish);
  }

  function updateLeft(n) {
    S.left = n;
    leftEl.textContent = n <= 0 ? 'Question limit reached' : n <= 3 ? `${n} question${n === 1 ? '' : 's'} left this hour` : '';
  }

  function start() {
    if (S.started) return;
    S.started = true;
    loadData().then((d) => {
      const greeting = d.entries.find((e) => e.id === 'greeting');
      const starters = (d.starters[pageKey()] || d.starters.default).concat([{ label: 'Start a project', form: true }]);
      const first = addAI(greeting.answer, {});
      const row = el('div', 'pa-chips');
      row.style.setProperty('--delay', '0.5s');
      starters.forEach((s) => {
        const b = el('button', 'pa-chip' + (s.form ? ' is-primary' : ''), s.label);
        b.type = 'button';
        b.addEventListener('click', () => (s.form ? (clearChips(), addUser(s.label), showForm()) : ask(s)));
        row.appendChild(b);
      });
      first.appendChild(row);
    }).catch(() => {
      S.started = false;
      addAI("I can't load right now. The team can help directly, and replies come within 1 hour.", {});
    });
  }

  // ---------- the in-chat form ----------
  function showForm(afterAnswer) {
    if (S.formOpen) { const f = log.querySelector('.pa-form'); if (f) { f.scrollIntoView({ block: 'nearest' }); f.querySelector('input').focus(); } return; }
    S.formOpen = true;
    clearChips();
    const userBits = S.msgs.filter((m) => m.role === 'user').map((m) => m.content).filter((t) => t.split(/\s+/).length > 2).slice(-2).join('. ');
    const details = S.brief || userBits || '';
    const hinglish = Match && Match.isHinglish(S.lastQuestion || '');
    const intro = S.data.entries.find((e) => e.id === 'start_project');
    // from the "I want a website" answer the form joins that message; from a button it comes with its own short invitation
    const holder = afterAnswer ? [...log.querySelectorAll('.pa-ai')].pop() || log.lastElementChild : addAI(hinglish && intro.hi ? intro.hi : intro.answer, {});
    const f = el('form', 'pa-form');
    f.noValidate = true;
    f.innerHTML =
      '<div class="row"><div><label for="pa-name">Your name</label><input id="pa-name" type="text" autocomplete="name" required></div>' +
      '<div><label for="pa-co">Business name</label><input id="pa-co" type="text" autocomplete="organization" required></div></div>' +
      '<div class="row"><div><label for="pa-em">Email</label><input id="pa-em" type="email" autocomplete="email" inputmode="email" required></div>' +
      '<div><label for="pa-ph">Phone or WhatsApp</label><input id="pa-ph" type="tel" autocomplete="tel" inputmode="tel" required></div></div>' +
      '<div><label for="pa-de">What do you need?</label><textarea id="pa-de" rows="3" maxlength="900" required></textarea></div>' +
      '<input class="hp" type="text" name="url2" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<label class="consent" for="pa-ok"><input id="pa-ok" type="checkbox" required><span>I agree to Phaseline using these details to reply to my enquiry, as described in the <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</span></label>' +
      '<p class="err" role="alert" hidden></p>' +
      '<button type="submit">Send to the team</button>';
    f.querySelector('#pa-de').value = details;
    holder.appendChild(f);
    f.addEventListener('submit', (e) => sendForm(e, f, holder));
    scrollLog();
    setTimeout(() => f.querySelector('#pa-name').focus({ preventScroll: true }), 300);
  }

  async function sendForm(e, f, holder) {
    e.preventDefault();
    if (f.dataset.sending) return;
    const v = (id) => f.querySelector(id).value.trim();
    const name = v('#pa-name'), company = v('#pa-co'), email = v('#pa-em'), phone = v('#pa-ph'), details = v('#pa-de');
    const err = f.querySelector('.err');
    const checks = [['#pa-name', name], ['#pa-co', company], ['#pa-em', /^\S+@\S+\.\S+$/.test(email)], ['#pa-ph', phone.replace(/\D/g, '').length >= 7], ['#pa-de', details]];
    let bad = null;
    checks.forEach(([id, ok]) => { const n = f.querySelector(id); const good = typeof ok === 'string' ? ok.length > 0 : ok; n.setAttribute('aria-invalid', good ? 'false' : 'true'); if (!good && !bad) bad = n; });
    const consent = f.querySelector('#pa-ok');
    if (!bad && !consent.checked) bad = consent;
    if (bad) { err.hidden = false; err.textContent = bad === consent ? 'Please tick the box to agree before sending.' : 'Please check the highlighted fields.'; bad.focus(); return; }
    err.hidden = true;
    f.dataset.sending = '1';
    const btn = f.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Sending...';
    setBusy(true);
    try {
      await window.sendLead({ name, company, email, phone, details: '[Via Phase AI chat] ' + details, elapsed: Date.now() - Number(f.dataset.t0 || Date.now()), trap: f.querySelector('.hp').value });
    } catch (_) {
      setBusy(false);
      delete f.dataset.sending; btn.disabled = false; btn.textContent = 'Send to the team';
      err.hidden = false; err.textContent = 'That did not go through. Please try again, or message the team directly.';
      holder.appendChild(actionRow(['whatsapp', 'email'], 0));
      scrollLog();
      return;
    }
    setBusy(false);
    S.formOpen = false;
    f.remove();
    const m = S.data.formDone;
    const hinglish = Match && Match.isHinglish(S.lastQuestion || '');
    addAI(fill(hinglish && m.hi ? m.hi : m.answer, { name }), { actions: m.actions, icon: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
