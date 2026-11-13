// Races between overlapping state machines (see STATE-MACHINES.md). Prints 'ok' when the site behaves and 'BUG' when a race is real; exits 1 on any BUG.
// Optional check, not part of npm test: it needs a running site and a browser.  Usage:  BASE=http://localhost:3000 node scripts/test-state-races.js
// One-off setup: npm i --no-save playwright && npx playwright install chromium
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { console.error('Playwright is not installed. Run: npm i --no-save playwright && npx playwright install chromium'); process.exit(2); }
const base = process.env.BASE || 'http://localhost:3000';
const res = []; const rep = (good, m) => { console.log(good ? 'ok  ' : 'BUG ', m); res.push(good); };
const fresh = async (b, path, opts = {}) => {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('pa-nudge', '1'); } catch (_) {} });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(String(e)));
  if (opts.before) await opts.before(pg);
  await pg.goto(base + path, { waitUntil: 'load' }); await pg.waitForTimeout(2600);
  return { ctx, pg, errs };
};
(async () => {
  const b = await chromium.launch();

  // 1. two quick clicks: a slow page (not preloaded) must not overwrite the page asked for last
  { const { ctx, pg } = await fresh(b, '/');
    await pg.route(/\/blog$/, async (r) => { await new Promise((x) => setTimeout(x, 1500)); r.continue(); });
    await pg.evaluate(() => { document.querySelector('footer a[href="/blog"]').click(); setTimeout(() => document.querySelector('header nav a[href="/services"]').click(), 150); });
    await pg.waitForTimeout(3500);
    const s = await pg.evaluate(() => ({ path: location.pathname, h1: document.querySelector('main h1')?.textContent.trim().slice(0, 40), cur: document.querySelector('header nav a[aria-current]')?.getAttribute('href'), hist: history.length }));
    rep(s.path === '/services' && s.cur === '/services' && /services/i.test(s.h1 || ''), `navigation: asked Blog, then Services -> ends on ${s.path}, nav highlights ${s.cur}, h1 "${s.h1}"`);
    await ctx.close(); }

  // 2. scroll lock shared by chat and popup: closing one must not unlock the page while the other is open
  { const { ctx, pg } = await fresh(b, '/work');
    const ov = () => pg.evaluate(() => document.body.style.overflow);
    await pg.evaluate(() => document.querySelector('.pa-lip').click()); await pg.waitForTimeout(900);
    await pg.evaluate(() => window.openBlueprintModal('mapps')); await pg.waitForTimeout(1200);
    await pg.evaluate(() => window.closeModal()); await pg.waitForTimeout(1200);
    rep((await ov()) === 'hidden', `scroll lock: chat open, popup opened then closed -> page overflow "${await ov()}" (must stay hidden)`);
    await pg.evaluate(() => document.querySelector('.pa-lip').click()); await pg.waitForTimeout(1200);
    rep((await ov()) === '', `scroll lock: everything closed -> page overflow "${await ov()}" (must be unlocked)`);
    await pg.evaluate(() => window.openBlueprintModal('mapps')); await pg.waitForTimeout(1200);
    await pg.evaluate(() => document.querySelector('.pa-lip').click()); await pg.waitForTimeout(900);
    await pg.evaluate(() => document.querySelector('.pa-lip').click()); await pg.waitForTimeout(1200);
    rep((await ov()) === 'hidden', `scroll lock: popup open, chat opened then closed -> page overflow "${await ov()}" (must stay hidden)`);
    await pg.evaluate(() => window.closeModal()); await pg.waitForTimeout(1200);
    rep((await ov()) === '', `scroll lock: both closed -> page overflow "${await ov()}" (must be unlocked)`);
    await ctx.close(); }

  // 3a. chat closed, reopened, closed again within 200 ms: the first close timer must not cut the second close short
  { const { ctx, pg } = await fresh(b, '/');
    await pg.evaluate(() => document.querySelector('.pa-lip').click()); await pg.waitForTimeout(1500);
    const mid = await pg.evaluate(() => new Promise((res) => { const lip = document.querySelector('.pa-lip'), d = document.getElementById('phase-ai');
      lip.click(); setTimeout(() => lip.click(), 100); setTimeout(() => lip.click(), 200);
      setTimeout(() => res({ hidden: d.hidden, state: d.dataset.state }), 560); }));
    rep(mid.state === 'closing' && !mid.hidden, `chat: close, reopen, close quickly -> at 560 ms the drawer is "${mid.state}", hidden=${mid.hidden} (second close must still be playing)`);
    await pg.waitForTimeout(900);
    const end = await pg.evaluate(() => ({ hidden: document.getElementById('phase-ai').hidden, ov: document.body.style.overflow }));
    rep(end.hidden && end.ov === '', `chat: ends closed and unlocked (hidden=${end.hidden}, overflow "${end.ov}")`);
    await ctx.close(); }

  // 3b. popup closed then another card opened quickly: the new popup must stay open
  for (const withCard of [true, false]) {
    const { ctx, pg } = await fresh(b, '/work');
    await pg.evaluate((w) => window.openBlueprintModal('mapps', w ? document.querySelector('article#mapps') : undefined), withCard); await pg.waitForTimeout(1500);
    await pg.evaluate((w) => { window.closeModal(); setTimeout(() => window.openBlueprintModal('taj', w ? document.querySelector('article#taj') : undefined), 150); }, withCard);
    await pg.waitForTimeout(2200);
    const s = await pg.evaluate(() => { const m = document.getElementById('blueprint-modal'); return { hidden: m.classList.contains('hidden'), title: m.querySelector('h3')?.textContent, ghosts: document.querySelectorAll('.bp-ghost').length, ov: document.body.style.overflow, op: getComputedStyle(m.querySelector('.modal-content')).opacity }; });
    rep(!s.hidden && s.title === 'Taj Attire' && s.ghosts === 0 && s.ov === 'hidden' && s.op === '1', `popup (${withCard ? 'from a card' : 'no card'}): close then open another at 150 ms -> hidden=${s.hidden}, shows "${s.title}", stray ghosts ${s.ghosts}, overflow "${s.ov}", panel opacity ${s.op}`);
    await pg.evaluate(() => window.closeModal()); await pg.waitForTimeout(1500);
    const e = await pg.evaluate(() => ({ hidden: document.getElementById('blueprint-modal').classList.contains('hidden'), ov: document.body.style.overflow, ghosts: document.querySelectorAll('.bp-ghost').length }));
    rep(e.hidden && e.ov === '' && e.ghosts === 0, `popup (${withCard ? 'from a card' : 'no card'}): closes cleanly afterwards (hidden=${e.hidden}, overflow "${e.ov}", ghosts ${e.ghosts})`);
    await ctx.close(); }

  // 3c. popup closed in the middle of opening: no stray ghost or half-shown video afterwards
  { const { ctx, pg } = await fresh(b, '/work');
    await pg.evaluate(() => { window.openBlueprintModal('mapps', document.querySelector('article#mapps')); setTimeout(() => window.closeModal(), 250); });
    await pg.waitForTimeout(2500);
    const e = await pg.evaluate(() => ({ hidden: document.getElementById('blueprint-modal').classList.contains('hidden'), ov: document.body.style.overflow, ghosts: document.querySelectorAll('.bp-ghost').length, bp: window.__bpOpen }));
    rep(e.hidden && e.ov === '' && e.ghosts === 0 && e.bp === false, `popup: closed 250 ms into opening -> hidden=${e.hidden}, overflow "${e.ov}", ghosts ${e.ghosts}, __bpOpen=${e.bp}`);
    await ctx.close(); }

  // 4. chat form sending while a typed question is answered: the lock must hold until the form is done too
  { const { ctx, pg } = await fresh(b, '/', { before: async (p) => {
      await p.route('**/api/chat', async (r) => { await new Promise((x) => setTimeout(x, 1200)); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: 'Test reply.', actions: [], left: 9 }) }); });
      await p.route('**/api/contact', async (r) => { await new Promise((x) => setTimeout(x, 4000)); r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
      await p.route('**/api.web3forms.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' })); } });
    await pg.evaluate(() => document.querySelector('.pa-lip').click()); await pg.waitForTimeout(1500);
    await pg.locator('.pa-chip.is-primary').first().click(); await pg.waitForSelector('.pa-form'); await pg.waitForTimeout(500);
    await pg.fill('#pa-name', 'Test'); await pg.fill('#pa-co', 'Test Co'); await pg.fill('#pa-em', 'a@b.co'); await pg.fill('#pa-ph', '9999999999'); await pg.fill('#pa-de', 'Test details'); await pg.check('#pa-ok');
    await pg.fill('.pa-input input', 'zxqv blorb quux wibble'); await pg.keyboard.press('Enter');   // question goes out (answer due in 1.2 s)
    await pg.waitForTimeout(200);
    await pg.click('.pa-form button[type=submit]');                                                    // form starts sending (done in ~4 s)
    await pg.waitForTimeout(1800);                                                                      // the answer has arrived, the form is still sending
    const s = await pg.evaluate(() => ({ busy: document.getElementById('phase-ai').dataset.busy, send: document.querySelector('.pa-send').disabled, sending: !!document.querySelector('.pa-form')?.dataset.sending, answered: !![...document.querySelectorAll('.pa-ai')].some((n) => /Test reply/.test(n.textContent)) }));
    rep(s.answered && s.sending && s.busy === '1' && s.send === true, `chat form: answer arrived while form still sending -> busy=${s.busy}, send disabled=${s.send} (answered ${s.answered}, form sending ${s.sending})`);
    await pg.waitForTimeout(3500);
    const e = await pg.evaluate(() => ({ busy: document.getElementById('phase-ai').dataset.busy, send: document.querySelector('.pa-send').disabled, done: !document.querySelector('.pa-form') }));
    rep(e.busy === '0' && e.send === false && e.done, `chat form: once the form is done the chat unlocks (busy=${e.busy}, send disabled=${e.send}, form gone=${e.done})`);
    await ctx.close(); }

  await b.close();
  const bad = res.filter((x) => !x).length; console.log(bad ? bad + ' RACES STILL REAL' : 'ALL RACES HANDLED'); process.exit(bad ? 1 : 0);
})();
