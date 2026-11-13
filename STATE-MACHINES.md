# State machines in the site

The site has no framework, so its "state" lives in booleans, CSS classes, `data-*` attributes and timers. Each machine below is where one of those groups of state is kept, the states it moves through, and the rule that keeps it safe. Read the row before changing the code it names. Search the file for the quoted `STATE "..."` comments to jump to the code.

## Rules that apply to all of them

1. **One owner per piece of state.** If two places can set it, give each its own name in a set or counter (see scroll lock and chat busy) instead of a shared boolean.
2. **Anything that finishes later must check it is still wanted.** A fetch, timer or animation that completes after the user moved on must stop quietly (see page swap, popup, chat close).
3. **Overlays use the shared scroll lock**, `window.lockScroll(name, on)` in `public/site.js`. Never set `document.body.style.overflow` directly: `motion.js` watches that value to pause smooth scrolling.
4. **Reduced motion** is read once when a script loads, in `motion.js` and `phase-ai.js`. A change to the system setting applies on the next page load.

## The machines

| Machine | File | States | Where the state lives | The rule |
|---|---|---|---|---|
| **Page swap** (in-site navigation) | `site.js` `go()` / `swap()` | idle → leaving (fetching) → swapped → idle | `navSeq`, `navigating`, `html.leaving`, `html.motion`, `pages` (promise cache), `history.state.y` | Only the latest `go()` may finish. A swap that is no longer current returns before touching the page. |
| **Overlay ↔ history** | `site.js` MutationObserver | no overlay ↔ some overlay open | `overlayWasOpen`, `history.state.overlay`, `overlayBack`, popstate handlers in `site.js` and `phase-ai.js` | One history entry for any number of overlays. Opening adds it, closing removes it. `closing` counts as closed. |
| **Scroll lock** | `site.js` `lockScroll()` | unlocked ↔ locked | `scrollHolders` set (`project`, `thanks`, `chat`) | Locked while any holder exists. Lenis stops/starts from the same value in `motion.js`. |
| **Project popup** | `site.js` `openBlueprintModal()` / `closeModal()` | hidden → opening → open → closing → hidden | `.hidden` class, `modalClosing`, `bpSession`, `bpTl`, `window.__bpOpen` | `bpSession` increments on every open and close. Late callbacks (`land`) check it. `bpTl` is the only animation allowed to run, and a new open or close kills the old one. |
| **Contact form** | `site.js` `submitProjectBrief()` / `sendLead()` | idle → sending → success popup or error toast | `form.dataset.sending`, button `disabled`, `aria-busy` | One send at a time. Succeeds if either the database save or the email works. |
| **Video playback** | `site.js` `initVideos()`, `phase-ai.js` `holdVideos()` | playing ↔ paused | IntersectionObserver, `window.__bpOpen`, `held[]` | Three controllers: visible → play, popup open → pause all, chat open → pause and later resume the ones it paused. |
| **Chat drawer** | `phase-ai.js` `open()` / `close()` | closed → open → closing → closed | `S.open`, `drawer.dataset.state`, `drawer.hidden`, `scrim.hidden`, `closeTimer` | A reopen or second close replaces `closeTimer`, so an old close never cuts a newer one short. |
| **Chat busy lock** | `phase-ai.js` `setBusy()` | unlocked ↔ locked | `busyBy` set (`turn`, `form`), `drawer.dataset.busy`, send button | Locked while a question is being answered or the form is sending. Each releases only its own name. |
| **Chat conversation** | `phase-ai.js` | not started → started → (form open → sent) | `S.started`, `S.formOpen`, `S.loading` / `S.data`, `S.msgs`, `S.aiUsed` | Messages live in memory only. `S.started` also stops the peek once the chat has been used. |
| **Header tab: rotation and peek** | `phase-ai.js` | `wait` → `reveal` → rotating ↔ held; peek: idle → open → closing → idle | classes `wait` `reveal` `peek` `sheen`, flags `peeking` `peekHover`, timers `lipTimer` `lipSwap` `peekT1-3` `peekSwap` | Rotation is paused by pointer, keyboard focus, chat open and a running peek. The peek runs once per page load. |
| **Chat edge light** | `phase-ai.js` `edge` | target level: busy 0.95 > speaking 0.7 > input focused 0.4 > idle 0.2 | `edge.raf`, `edge.lite` (0 → 1 → 2), frame counters | `lite` only goes up: after sustained slow frames, blur and then the moving light are dropped until reload. |
| **Page motion lifecycle** | `motion.js` `enter()` / `teardown()` | none → entered → torn down | `ctx`, `mmCards`, `main`, `window.lenis` | `enter()` always tears down first. Every reveal plays once. Swipe cards are armed on phones and plain elsewhere. |
| **Page visibility on load** | `<head>` inline script, `site.js`, `motion.js` | visible → leaving → motion hold → visible | `html.motion`, `html.leaving`, `html[data-quick]` | `motion` hides the page until `init()` finishes. A 2.5 s timer in the page head, and `motionTimer` in `swap()`, always reveal it. |
| **Hero typing** | `motion.js` `heroHome()` | hidden → typing → caret blink → done | timeline positions, `p.dataset.typed` | `data-typed` is also how the body-copy reveal knows to skip that paragraph. Change both together. |
| **Small widgets** | `site.js` | one state each | pricing matrix: `data-tier` + `aria-pressed`; Services tabs: `switchCard()` + `max-lg:hidden`; Work filter: button classes + inline `display`; nav bubble: `sessionStorage navIdx` | State is in the DOM. It resets whenever the page is swapped. |
| **Server guards** | `api/chat.js`, `api/contact.js` | request passes each guard in order or is stopped | database counts per visitor hash (hour) and global (day); in-memory counters as a floor | Chat: method → origin → key → input → counts → hourly → daily → model. Contact: honeypot → fill time → consent → validity → links → rate. Bot-shaped contact requests get a quiet 200. |

## Known, left alone on purpose

- `peekHover` is not cleared if the pointer enters during the peek's closing phase. The peek runs once per load, so the effect is nil.
- `edge.lite` never resets within a page load.
- Back during a page swap does not cancel it when the target is the page already shown.
- `sessionStorage tabIdx` is written in `initTabbar()` and never read. It is listed in `content/legal/cookies.md`, so keep or remove both together.
- Fixed since the last audit: overlapping page swaps, shared scroll lock, chat close timer, popup reopen race, chat busy flag.

## Checking a change

The races above are the ones that fail silently. After editing any machine, run `BASE=http://localhost:3000 node scripts/test-state-races.js` (needs the site running and Playwright: `npm i --no-save playwright && npx playwright install chromium`). It checks: two quick link clicks while one page is slow, the chat and a project popup opened and closed in both orders, the chat closed and reopened within 200 ms, a popup closed and another opened within 150 ms, a popup closed mid-opening, and a question answered while the chat form is sending. It prints `ok` or `BUG` for each and exits 1 on any `BUG`.
