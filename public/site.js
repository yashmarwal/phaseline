/**
 * Phaseline - Global Client Logic & Interactions
 */

(function () {
  'use strict';

  // Web3Forms access key (public by design; it can only send to the email it was created for). Set it in site.config.json, then run npm run config.
  const WEB3FORMS_KEY = '9e12a97a-d2f2-420a-820b-17f3acac00eb';

  // 1. Toast Notification Utility
  window.showToast = function (message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast bg-[#F7F4EE] text-[#0F1521] px-5 py-3 rounded-lg flex items-center gap-3 font-body-sm text-sm';
    
    let icon = 'check_circle';
    let iconColor = 'text-[#B8935A]';
    if (type === 'error') {
      icon = 'error';
      iconColor = 'text-red-600';
    } else if (type === 'copy') {
      icon = 'content_copy';
      iconColor = 'text-[#B8935A]';
    }

    toast.innerHTML = `
      <span class="material-symbols-outlined ${iconColor} text-[20px]" aria-hidden="true">${icon}</span>
      <span class="font-medium">${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s, transform 0.3s';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3800);
  };

  // 2. Active Link Highlighting & Route Linking
  function initNavigation() {
    const currentPath = window.location.pathname.toLowerCase().replace(/\.html$/, "");
    const navLinks = document.querySelectorAll('header nav a');

    navLinks.forEach((link) => {
      const href = link.getAttribute('href');
      if (!href) return;

      const isCurrent = 
        (href === '/' && (currentPath.endsWith('/') || currentPath.endsWith('/index') || currentPath === '')) ||
        (href !== '/' && currentPath.endsWith(href.replace('.html', '')));

      if (isCurrent) {
        link.classList.add('text-surface-bright', 'font-bold');
        link.classList.remove('text-on-primary-container');
        link.setAttribute('aria-current', 'page');
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  // Liquid-glass refraction: SVG displacement map used as a backdrop-filter (Chromium only; others keep the plain glass)
  function initLens(bar, id, minWidth) {
    if (!navigator.userAgentData?.brands.some((b) => /Chromium/.test(b.brand))) return;
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("style", "position:absolute;width:0;height:0");
    document.body.appendChild(svg);
    const build = () => {
      const on = !minWidth || matchMedia(`(min-width: ${minWidth}px)`).matches;
      bar.classList.toggle("lens", on);
      const { width: w, height: h } = bar.getBoundingClientRect();
      if (!w || !on) return;
      const ex = (h / 2) / w, ey = 0.32;
      const ramp = (id, dir, e, ch) => `<linearGradient id="${id}" ${dir}><stop offset="0" stop-color="${ch(255)}"/><stop offset="${e}" stop-color="${ch(128)}"/><stop offset="${1 - e}" stop-color="${ch(128)}"/><stop offset="1" stop-color="${ch(0)}"/></linearGradient>`;
      const map = `<svg xmlns="${NS}" width="${w}" height="${h}"><defs>${ramp("x", 'x1="0" x2="1" y1="0" y2="0"', ex, (v) => `rgb(${v},0,0)`)}${ramp("y", 'x1="0" x2="0" y1="0" y2="1"', ey, (v) => `rgb(0,${v},0)`)}</defs><rect width="100%" height="100%" fill="#000"/><rect width="100%" height="100%" fill="url(#x)" style="mix-blend-mode:screen"/><rect width="100%" height="100%" fill="url(#y)" style="mix-blend-mode:screen"/></svg>`;
      svg.innerHTML = `<filter id="${id}" x="0" y="0" width="${w}" height="${h}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feImage href="data:image/svg+xml;charset=utf-8,${encodeURIComponent(map)}" x="0" y="0" width="${w}" height="${h}" result="map"/><feDisplacementMap in="SourceGraphic" in2="map" scale="26" xChannelSelector="R" yChannelSelector="G"/></filter>`;
    };
    build();
    addEventListener("resize", build);
  }

  // Desktop pill nav: slide the glass bubble to the active link
  function moveNavBubble() {
    const nav = document.querySelector(".topbar nav");
    const bubble = nav?.querySelector(".nav-bubble");
    if (!bubble) return;
    const link = nav.querySelector("a[aria-current]");
    if (!link) { bubble.style.opacity = 0; return; }
    bubble.classList.add("slide");
    bubble.style.left = link.offsetLeft + "px";
    bubble.style.width = link.offsetWidth + "px";
    bubble.style.opacity = 1;
  }

  // header polish: hover lens that glides between links, light that follows the pointer, condensed state on scroll
  function initTopbarFX() {
    const bar = document.querySelector(".topbar");
    const nav = bar?.querySelector("nav");
    if (!bar) return;
    addEventListener("scroll", () => bar.classList.toggle("scrolled", scrollY > 24), { passive: true });
    bar.classList.toggle("scrolled", scrollY > 24);
    bar.addEventListener("pointermove", (e) => {
      const r = bar.getBoundingClientRect();
      bar.style.setProperty("--hx", ((e.clientX - r.left) / r.width) * 100 + "%");
    }, { passive: true });
    if (!nav || !matchMedia("(hover: hover)").matches) return;
    const lens = document.createElement("i");
    lens.className = "nav-hover";
    nav.prepend(lens);
    nav.querySelectorAll("a").forEach((a) => a.addEventListener("pointerenter", () => {
      lens.style.left = a.offsetLeft + "px";
      lens.style.width = a.offsetWidth + "px";
      lens.style.opacity = 1;
    }));
    nav.addEventListener("pointerleave", () => (lens.style.opacity = 0));
  }

  function initTopNav() {
    const nav = document.querySelector(".topbar nav");
    const bubble = nav?.querySelector(".nav-bubble");
    const link = nav?.querySelector("a[aria-current]");
    initLens(document.querySelector(".topbar"), "lens-top");
    if (!link) return;
    const links = [...nav.querySelectorAll("a")];
    const put = (a) => {
      bubble.style.left = a.offsetLeft + "px";
      bubble.style.width = a.offsetWidth + "px";
      bubble.style.opacity = 1;
    };
    let prev = link;
    try { prev = links[+sessionStorage.getItem("navIdx")] || link; } catch (_) {}
    const settle = () => { bubble.classList.remove("slide"); put(link); };
    put(prev);
    requestAnimationFrame(() => requestAnimationFrame(() => { bubble.classList.add("slide"); put(link); }));
    try { sessionStorage.setItem("navIdx", links.indexOf(link)); } catch (_) {}
    addEventListener("resize", settle);
    document.fonts?.ready.then(settle);
  }

  // 2b. Phone UI: bottom tab bar, carousel dots, matrix tier tabs
  function initTabbar() {
    // slide the glass bubble from the previous tab to this one
    const bar = document.getElementById("tabbar");
    const bubble = bar.querySelector(".tab-bubble");
    const cur = [...bar.querySelectorAll("a")].findIndex((a) => a.hasAttribute("aria-current"));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (cur >= 0) bubble.style.setProperty("--i", cur);
    }));
    try { if (cur >= 0) sessionStorage.setItem("tabIdx", cur); } catch (_) {}
    initLens(bar, "lens");
  }

  // 2c-0. Work videos: play only while visible; reduced-motion visitors keep the still poster
  let videoIO;
  function initVideos() {
    videoIO?.disconnect();
    const vids = [...document.querySelectorAll("video[data-brag]")];
    if (!vids.length || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    videoIO = new IntersectionObserver((entries) => entries.forEach((e) => {
      const v = e.target;
      if (e.isIntersecting) { v.preload = "auto"; if (!window.__bpOpen) v.play().catch(() => {}); } else v.pause();
    }), { threshold: 0.35 });
    vids.forEach((v) => videoIO.observe(v));
  }

  // 2c. Per-page UI (re-run after every page swap): carousel dots, matrix tabs, services tier tabs
  function initPageUI() {
    initVideos();
    document.querySelectorAll(".m-rail").forEach((rail) => {
      const n = rail.children.length;
      const dots = document.createElement("div");
      dots.className = "m-dots";
      dots.innerHTML = "<i></i>".repeat(n);
      rail.after(dots);
      const mark = () => {
        const i = Math.round(rail.scrollLeft / (rail.scrollWidth / n));
        [...dots.children].forEach((d, j) => d.classList.toggle("on", j === i));
      };
      rail.addEventListener("scroll", mark, { passive: true });
      mark();
    });

    const matrix = document.getElementById("matrix");
    const matrixTabs = document.querySelectorAll("#matrix-tabs button");
    const pick = (t) => {
      matrix.dataset.tier = t;
      matrixTabs.forEach((b) => b.setAttribute("aria-pressed", b.dataset.tier === t));
    };
    matrixTabs.forEach((b) => b.addEventListener("click", () => pick(b.dataset.tier)));
    if (matrix) pick("2");

    const tiers = [0, 1, 2].map((i) => document.getElementById("card-" + i));
    if (tiers[0]) {
      window.switchCard = (active) => {
        tiers.forEach((c, i) => c.classList.toggle("max-lg:hidden", i !== active));
        document.querySelectorAll("#tier-tabs button").forEach((b, i) => b.setAttribute("aria-pressed", i === active));
      };
      switchCard(0);
    }
  }

  window.copyDeskEmail = function () {
    navigator.clipboard.writeText("connect@phaseline.in").then(() => {
      const icon = document.getElementById("copy-icon");
      if (icon) {
        icon.textContent = "done";
        setTimeout(() => { icon.textContent = "content_copy"; }, 2000);
      }
      showToast("Desk email copied to clipboard", "copy");
    });
  };

  // 3. Case Study Blueprint Modal (Work Page & Featured Work)
  const caseStudyBlueprints = {
      "mapps": {
          "title": "Mapps Creation",
          "category": "B2B Textile & Export",
          "location": "Surat, Gujarat",
          "stack": [],
          "challenge": "Buyers flipped through PDF catalogs, and overseas buyers had no way to browse fabrics or ask for a quote.",
          "solution": "A searchable fabric catalog with a quote request on every fabric, so each enquiry lands straight in their WhatsApp.",
          "video": "work/mapps"
      },
      "tanish": {
          "title": "Tanish Creation",
          "category": "Manufacturing & Screen Printing",
          "location": "Jaipur, Rajasthan",
          "stack": [],
          "challenge": "Orders and quotes started with a phone call or a visit, and buyers could not see the designs, the minimum order or how to book a factory visit beforehand.",
          "solution": "A bulk order form where buyers pick a design, quantity and colour and send the request straight to WhatsApp, the minimum order shown on every design, a factory-visit booking form, and the full design library online.",
          "video": "work/tanish"
      },
      "taj": {
          "title": "Taj Attire",
          "category": "Ladies’ Wear Manufacturing",
          "location": "Jaipur, Rajasthan",
          "stack": [],
          "challenge": "Wholesale buyers searching for suppliers could not find them, or see what they make.",
          "solution": "One store with a retail and bulk switch, a Royal Lookbook of full looks, and product cards with price and a Buy Now button.",
          "video": "work/taj"
      },
      "qotn": {
          "title": "QOTN",
          "category": "D2C Apparel",
          "location": "Jaipur, Rajasthan",
          "stack": [],
          "challenge": "A young brand that needed a store shoppers could sign in to.",
          "solution": "A store with customer accounts that keep shoppers signed in, and a security check on how customer data is accessed.",
          "video": "work/qotn"
      },
      "fitness": {
          "title": "Fitness Future Gym",
          "category": "Fitness & Community",
          "location": "Nangloi, Delhi",
          "stack": [],
          "challenge": "Attendance and fees were tracked on paper, so overdue fees went unnoticed, trial visitors were never followed up, and there was no way to reach members between visits.",
          "solution": "Members sign up themselves and check in by QR code. Fee due dates are tracked per member with automatic WhatsApp and email reminders. The admin panel flags overdue fees, inactive members and trial visitors who never joined, and sends offers to everyone at once. Members get their own dashboard with a workout planner and food log.",
          "video": "work/fitness"
      },
      "ins": {
          "title": "INS Overseas",
          "category": "Handmade Leather & Paper Exporter",
          "location": "Sanganer, Jaipur",
          "stack": [],
          "challenge": "Buyers abroad could not browse the range or see minimum orders without asking, and the team had no simple way to keep products and photos up to date.",
          "solution": "A catalogue of seven product ranges with the minimum order on every card and an Enquire button, a wholesale partner page, WhatsApp and email enquiry, and a private admin where the team uploads photos and manages products, the gallery and the homepage themselves.",
          "video": "work/ins"
      }
  };

  window.openBlueprintModal = function (caseKey, srcEl) {
    const data = caseStudyBlueprints[caseKey] || caseStudyBlueprints['mapps'];
    let modal = document.getElementById('blueprint-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'blueprint-modal';
      modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F1521]/75 modal-overlay hidden';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="relative w-full max-w-3xl bg-[#F7F4EE] rounded-xl overflow-hidden shadow-2xl border-2 border-[#0F1521] modal-content max-h-[90vh] flex flex-col">
        <!-- Modal Header -->
        <div class="bp-head relative bg-[#0F1521] text-[#F7F4EE] px-6 py-4 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="w-2.5 h-2.5 rounded-full bg-[#B8935A]"></span>
            <div>
              <span class="text-xs uppercase font-bold tracking-widest text-[#B8935A]">Project</span>
              <h3 class="font-headline-sm text-lg text-white font-semibold leading-tight">${data.title}</h3>
            </div>
          </div>
          <button onclick="closeModal()" class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
            <span class="material-symbols-outlined text-[20px]" aria-hidden="true">close</span>
          </button>
        </div>

        <!-- Modal Body Scrollable -->
        <div data-lenis-prevent class="p-6 md:p-8 overflow-y-auto space-y-6">
          <div class="bp-video w-full aspect-[16/10] rounded-lg overflow-hidden border border-[#0F1521]/20 relative bg-[#0F1521]">
            <video src="${data.video}.mp4" poster="${data.video}.jpg" autoplay muted loop playsinline class="w-full h-full object-cover" aria-label="15 second video tour of the ${data.title} website"></video>
          </div>

          <div class="bp-item flex flex-wrap items-center gap-2">
            <span class="px-3 py-1 rounded-full bg-[#0F1521] text-white text-xs font-semibold tracking-wide">${data.location}</span>
            <span class="px-3 py-1 rounded-full bg-[#EDE9DF] border border-[#0F1521]/10 text-[#0F1521] text-xs font-semibold tracking-wide">${data.category}</span>
          </div>

          <div class="grid grid-cols-1 gap-3">
            <div class="bp-item bg-[#EDE9DF] p-3 rounded-lg border border-[#0F1521]/10">
              <span class="text-[10px] uppercase font-bold tracking-wider text-[#76777C] block">Approach</span>
              <span class="text-sm font-bold text-[#0F1521]">Custom built, never a template</span>
            </div>
          </div>

          <div class="bp-item space-y-2">
            <h4 class="text-xs uppercase font-bold tracking-wider text-[#B8935A]">Before</h4>
            <p class="text-sm text-[#45474C] leading-relaxed">${data.challenge}</p>
          </div>

          <div class="bp-item space-y-2">
            <h4 class="text-xs uppercase font-bold tracking-wider text-[#B8935A]">What we built</h4>
            <p class="text-sm text-[#45474C] leading-relaxed">${data.solution}</p>
          </div>

          ${data.stack.length ? `<div class="space-y-2">
            <h4 class="text-xs uppercase font-bold tracking-wider text-[#76777C]">Built With</h4>
            <div class="flex flex-wrap gap-2">
              ${data.stack.map(s => `<span class="px-2.5 py-1 bg-white text-[#0F1521] border border-[#0F1521]/20 rounded text-xs font-medium">${s}</span>`).join('')}
            </div>
          </div>` : ''}
        </div>

        <!-- Modal Footer -->
        <div class="bp-foot bg-[#E5E0D5] px-6 py-4 border-t border-[#0F1521]/15 flex items-center justify-between gap-4">
          <span class="hidden sm:inline text-xs text-[#45474C]">Client project</span>
          <a href="/contact?project=${encodeURIComponent(data.title)}" class="bp-cta h-10 px-5 whitespace-nowrap max-sm:w-full max-sm:justify-center rounded-full bg-[#B8935A] text-[#0F1521] text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow hover:bg-[#A6814B] transition-colors">
            <span>Get Something Like This</span>
            <span class="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_forward</span>
          </a>
        </div>
      </div>
    `;

    modal.onclick = (e) => { if (e.target === modal) closeModal(); };
    const src = srcEl || (window.event && window.event.currentTarget instanceof Element ? window.event.currentTarget : null);
    // the card can be clicked anywhere (its video, the View Full Project button, the card itself): find its video
    const host = src ? (src.closest('article[id]') || src) : null;
    modalSrcVideo = host ? (host.matches('video') ? host : host.querySelector('video[data-brag]')) : null;
    modalClosing = false;
    window.__bpOpen = true; // background videos stay paused while a project is open
    document.querySelectorAll('video[data-brag]').forEach((v) => v.pause());
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    const g = window.gsap;
    const panel = modal.querySelector('.modal-content');
    const vbox = modal.querySelector('.bp-video');
    if (!g || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    g.killTweensOf([modal, panel]);
    const q = (sel) => modal.querySelectorAll(sel);
    const S = visibleRect(modalSrcVideo);
    const P = panel.getBoundingClientRect(), V = vbox.getBoundingClientRect();
    const clean = () => g.set([modal, panel, vbox, ...q('.bp-head, .bp-item, .bp-foot')], { clearProps: 'all' });
    if (!S) { // no card to grow from: a soft rise
      g.timeline({ defaults: { ease: 'power3.out' }, onComplete: clean })
        .fromTo(modal, { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0)
        .fromTo(panel, { y: 36, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 }, 0);
      return;
    }
    // the card's own video travels into the popup while the panel unfolds around it
    const real = vbox.querySelector('video');
    const ghost = makeGhost(modalSrcVideo, S);
    const seek = () => { try { real.currentTime = modalSrcVideo.currentTime; } catch (e) {} };
    real.readyState ? seek() : real.addEventListener('loadedmetadata', seek, { once: true });
    const ins = (r) => 'inset(' + [r.top - P.top, P.right - r.right, P.bottom - r.bottom, r.left - P.left].map((n) => Math.max(0, n) + 'px').join(' ') + ' round 10px)';
    const E = 'power3.inOut', D = 0.8;
    g.set(vbox, { opacity: 0 });
    g.set(q('.bp-head, .bp-item, .bp-foot'), { opacity: 0 });
    let landed = false;
    const land = () => { if (landed) return; landed = true; g.set(vbox, { opacity: 1 }); g.to(ghost, { opacity: 0, duration: 0.2, ease: 'power1.out', onComplete: () => { ghost.remove(); clean(); } }); };
    g.timeline({ onComplete: () => { if (real.readyState >= 2) land(); else { real.addEventListener('loadeddata', land, { once: true }); setTimeout(land, 800); } } })
      .fromTo(modal, { opacity: 0, backdropFilter: 'blur(0px)' }, { opacity: 1, backdropFilter: 'blur(10px)', duration: 0.6, ease: 'power2.out' }, 0)
      .fromTo(panel, { clipPath: ins(S) }, { clipPath: 'inset(0px 0px 0px 0px round 12px)', duration: D, ease: E }, 0)
      .to(ghost, { left: V.left, top: V.top, width: V.width, height: V.height, borderRadius: 8, duration: D, ease: E }, 0)
      .to(q('.bp-head'), { opacity: 1, duration: 0.4, ease: 'power2.out' }, 0.3)
      .fromTo(q('.bp-item'), { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out', stagger: 0.06 }, 0.42)
      .to(q('.bp-foot'), { opacity: 1, duration: 0.4, ease: 'power2.out' }, 0.6)
      ;
  };

  // the part of an element that is actually on screen, or null
  function visibleRect(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return null;
    return r;
  }
  // a fixed still of the video's current frame that can fly between the card and the popup (a still never flashes while it loads)
  function makeGhost(v, r) {
    let url = null;
    try {
      if (v.readyState >= 2 && v.videoWidth) {
        const c = document.createElement('canvas');
        c.width = v.videoWidth; c.height = v.videoHeight;
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        url = c.toDataURL('image/jpeg', 0.86);
      }
    } catch (e) {}
    url = url || v.poster;
    const gh = document.createElement('div');
    gh.className = 'bp-ghost';
    gh.setAttribute('aria-hidden', 'true');
    const rad = parseFloat(getComputedStyle(v.parentElement).borderRadius) || 8;
    Object.assign(gh.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', background: '#0F1521 url("' + url + '") center / cover no-repeat', zIndex: 70, pointerEvents: 'none', borderRadius: rad + 'px', boxShadow: '0 20px 50px -20px rgba(0,0,0,.6)', willChange: 'left, top, width, height' });
    document.body.appendChild(gh);
    return gh;
  }

  let modalClosing = false, modalSrcVideo = null;
  window.closeModal = function () {
    const modal = document.getElementById('blueprint-modal');
    if (!modal || modal.classList.contains('hidden') || modalClosing) return;
    const g = window.gsap;
    const panel = modal.querySelector('.modal-content');
    const vbox = modal.querySelector('.bp-video');
    const q = (sel) => modal.querySelectorAll(sel);
    const done = (gh) => { if (gh) gh.remove(); modal.classList.add('hidden'); document.body.style.overflow = ''; modalClosing = false; window.__bpOpen = false; document.querySelectorAll('video[data-brag]').forEach((v) => { if (visibleRect(v)) v.play().catch(() => {}); }); if (g) g.set([modal, panel, vbox, ...q('.bp-head, .bp-item, .bp-foot')], { clearProps: 'all' }); };
    if (!g || matchMedia('(prefers-reduced-motion: reduce)').matches) { done(); return; }
    modalClosing = true;
    g.killTweensOf([modal, panel]);
    const S = visibleRect(modalSrcVideo), P = panel.getBoundingClientRect(), V = vbox.getBoundingClientRect();
    if (!S || V.bottom < 0 || V.top > innerHeight) {
      g.timeline({ onComplete: () => done() })
        .to(panel, { y: 30, opacity: 0, duration: 0.3, ease: 'power3.in' }, 0)
        .to(modal, { opacity: 0, duration: 0.32, ease: 'power2.in' }, 0.05);
      return;
    }
    document.querySelectorAll('body > .bp-ghost').forEach((e) => e.remove());
    const ghost = makeGhost(vbox.querySelector('video'), V);
    const E = 'power3.inOut', D = 0.6;
    g.set(vbox, { opacity: 0 });
    g.timeline({ onComplete: () => done(ghost) })
      .to(q('.bp-head, .bp-item, .bp-foot'), { opacity: 0, duration: 0.2, ease: 'power2.in' }, 0)
      .to(panel, { opacity: 0, duration: 0.3, ease: 'power2.in' }, 0.02) // the card dissolves around the video as it lifts out
      .to(ghost, { left: S.left, top: S.top, width: S.width, height: S.height, duration: D, ease: E }, 0.04)
      .to(modal, { opacity: 0, backdropFilter: 'blur(0px)', duration: 0.4, ease: 'power2.in' }, D - 0.3)
      .to(ghost, { opacity: 0, duration: 0.15, ease: 'power1.out' }, D + 0.04);
  };

  // clicking a project video opens its project (cards on the home page already open it themselves)
  if (!window.__bpVideoClick) {
    window.__bpVideoClick = true;
    document.addEventListener('click', (e) => {
      const v = e.target.closest && e.target.closest('video[data-brag]');
      if (!v || v.closest('[onclick*="openBlueprintModal"]') || v.closest('#blueprint-modal')) return;
      const card = v.closest('article[id]');
      if (card && caseStudyBlueprints[card.id]) openBlueprintModal(card.id, card);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const v = document.activeElement;
      if (v && v.matches && v.matches('article[id] video[data-brag]')) { e.preventDefault(); v.click(); }
    });
  }

  // 4. Work Page Filter Engine
  window.filterWork = function (category, buttonEl) {
    const articles = document.querySelectorAll('main article[data-category]');
    const buttons = document.querySelectorAll('#work-filters button');

    buttons.forEach(btn => {
      btn.classList.remove('bg-[#0F1521]', 'text-white');
      btn.classList.add('bg-white', 'text-[#0F1521]');
    });
    if (buttonEl) {
      buttonEl.classList.remove('bg-white', 'text-[#0F1521]');
      buttonEl.classList.add('bg-[#0F1521]', 'text-white');
    }

    articles.forEach(article => {
      const artCat = article.getAttribute('data-category');
      if (category === 'all' || artCat.includes(category)) {
        article.style.display = 'block';
        article.style.opacity = '1';
      } else {
        article.style.display = 'none';
        article.style.opacity = '0';
      }
    });
  };

  // 5. Contact Page Intake Dossier & WhatsApp Forwarder
  // note when someone first touches the contact form; the server uses it to tell people from bots that post instantly
  ['focusin', 'input', 'change'].forEach((ev) => document.addEventListener(ev, (e) => {
    const f = e.target.closest && e.target.closest('#project-intake-form, .pa-form');
    if (f && !f.dataset.t0) f.dataset.t0 = Date.now();
  }, true));

  // consent box on the contact form: required before anything is sent
  window.showConsentError = function (e) {
    if (e) e.preventDefault(); // use our message instead of the browser bubble
    const box = document.getElementById('consent'), msg = document.getElementById('consent-error');
    if (msg) msg.classList.remove('hidden');
    if (box) { box.setAttribute('aria-invalid', 'true'); box.focus(); }
  };
  window.hideConsentError = function () {
    document.getElementById('consent-error')?.classList.add('hidden');
    document.getElementById('consent')?.removeAttribute('aria-invalid');
  };

  // Sends an enquiry by two routes at once: our own database (api/contact.js) and an email to the team through Web3Forms.
  // It resolves as soon as either one works (the other keeps going in the background) and rejects only if both fail.
  // Used by the contact form and by the Phase AI chat.
  window.sendLead = function ({ name, company, email, phone, details, elapsed, trap }) {
    const saved = fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, company, email, phone, details, consent: true, elapsed, website: trap }),
      signal: AbortSignal.timeout(15000),
    }).then((r) => { if (!r.ok) throw new Error(r.status); });
    const emailed = (WEB3FORMS_KEY.startsWith('YOUR_') || trap || elapsed < 2000)
      ? Promise.reject(new Error('email route off'))
      : fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          keepalive: true, // the email still goes if the visitor closes the page right away
          body: JSON.stringify({
            access_key: WEB3FORMS_KEY,
            subject: `New enquiry from ${company} (${name})`,
            from_name: 'Phaseline website',
            name, email, phone, company,
            message: details,
            consent: `Agreed to the Privacy Policy on ${new Date().toISOString()}`,
            botcheck: '',
          }),
          signal: AbortSignal.timeout(45000), // generous: a slow reply must not be reported as a failure while the email is still on its way
        }).then(async (r) => { if (!r.ok || !(await r.json()).success) throw new Error(r.status); });
    return Promise.any([saved, emailed]).then(() => undefined);
  };

  window.submitProjectBrief = async function (e) {
    if (e) e.preventDefault();

    const name = document.getElementById('full-name')?.value.trim();
    const company = document.getElementById('company-name')?.value.trim();
    const email = document.getElementById('email')?.value.trim();
    const phone = document.getElementById('phone')?.value.trim();
    const details = document.getElementById('project-details')?.value.trim();

    if (!name || !company || !email || !phone || !details) {
      window.showToast('Please complete all required fields (*)', 'error');
      return;
    }
    if (!document.getElementById('consent')?.checked) { window.showConsentError(); return; }

    // one send at a time: extra clicks while it is going are ignored
    const sendForm = e?.target;
    if (sendForm?.dataset?.sending) return;
    if (sendForm?.dataset) sendForm.dataset.sending = '1';
    const btn = e?.submitter;
    const label = btn?.querySelector('span');
    const labelText = label?.textContent;
    if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
    if (label) label.textContent = 'Sending...';
    const done = () => {
      if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); }
      if (label) label.textContent = labelText;
      if (sendForm?.dataset) delete sendForm.dataset.sending;
    };

    try {
      await window.sendLead({ name, company, email, phone, details, elapsed: Date.now() - Number(sendForm?.dataset?.t0 || Date.now()), trap: document.getElementById('website')?.value });
    } catch (_) {
      done();
      window.showToast('Could not send. Please WhatsApp or email us directly.', 'error');
      return;
    }
    done();

    const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));

    // Show confirmation
    let confModal = document.getElementById('confirmation-modal');
    if (!confModal) {
      confModal = document.createElement('div');
      confModal.id = 'confirmation-modal';
      confModal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F1521]/80 backdrop-blur-sm hidden';
      document.body.appendChild(confModal);
    }

    const whatsappText = encodeURIComponent(
      `Hi, I'd like to discuss a project.\n` +
      `Name: ${name}\n` +
      `Company: ${company}\n` +
      `Phone: ${phone}\n` +
      `Details: ${details}`
    );
    const whatsappUrl = `https://wa.me/918595475007?text=${whatsappText}`;

    confModal.innerHTML = `
      <div class="relative w-full max-w-xl bg-[#F7F4EE] rounded-xl overflow-hidden shadow-2xl border-2 border-[#0F1521] modal-content flex flex-col">
        <div class="bg-[#0F1521] text-[#F7F4EE] px-6 py-4 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <span class="material-symbols-outlined text-[#B8935A]" aria-hidden="true">verified</span>
            <span class="text-sm uppercase font-bold tracking-wider text-white">Message Received</span>
          </div>
          
        </div>
        <div class="p-6 md:p-8 space-y-5">
          <div class="space-y-1">
            <h3 class="font-headline-sm text-2xl font-bold text-[#0F1521]" style="font-family: 'Fraunces', serif;">Message Received</h3>
            <p class="text-sm text-[#45474C]">Thank you, ${esc(name)}. Your project details for <strong class="text-[#0F1521]">${esc(company)}</strong> have been received.</p>
          </div>

          <div class="bg-[#EDE9DF] p-4 rounded-lg border border-[#0F1521]/15 space-y-2 text-xs">
            <div class="flex justify-between pb-1 border-b border-[#0F1521]/10">
              <span class="text-[#76777C] font-semibold uppercase">Direct Channel</span>
              <span class="text-[#0F1521] font-bold">${esc(phone)} / ${esc(email)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-[#76777C] font-semibold uppercase">Response</span>
              <span class="text-[#B8935A] font-bold">Within 1 hour</span>
            </div>
          </div>

          <div class="space-y-3 pt-2">
            <a href="${whatsappUrl}" target="_blank" rel="noopener noreferrer" class="w-full h-12 rounded-full bg-[#25D366] hover:bg-[#20BA5A] text-white font-bold text-sm flex items-center justify-center gap-2 shadow transition-transform hover:-translate-y-0.5">
              <span>Send via WhatsApp</span>
              <span class="material-symbols-outlined text-[18px]" aria-hidden="true">chat</span>
            </a>

            <button onclick="copyDossier()" class="w-full h-11 rounded-full bg-white hover:bg-slate-50 text-[#0F1521] border border-[#0F1521] font-semibold text-xs flex items-center justify-center gap-2 transition-colors">
              <span class="material-symbols-outlined text-[16px]" aria-hidden="true">content_copy</span>
              <span>Copy Summary</span>
            </button>
          </div>
        </div>
        <div class="bg-[#E5E0D5] px-6 py-3 border-t border-[#0F1521]/15 flex items-center justify-end">
          <button onclick="closeConfirmationModal()" class="px-5 py-1.5 rounded-full bg-[#0F1521] text-white text-xs font-semibold hover:bg-opacity-90 transition-colors">Close</button>
        </div>
      </div>
    `;

    confModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Reset Form
    const form = document.getElementById('project-intake-form');
    if (form) form.reset();
  };

  window.closeConfirmationModal = function () {
    const confModal = document.getElementById('confirmation-modal');
    if (confModal) {
      confModal.classList.add('hidden');
      document.body.style.overflow = '';
    }
  };

  window.copyDossier = function () {
    const text = `Phaseline project brief\nResponse within 1 hour\nEmail: connect@phaseline.in\nWhatsApp: +91 85954 75007`;
    navigator.clipboard.writeText(text).then(() => {
      window.showToast('Summary copied to clipboard!', 'copy');
    });
  };

  // 6. Prefill Form from URL Params (e.g. ?tier=presence or ?project=Mapps)
  function handleUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const tier = params.get('tier');
    const project = params.get('project');
    const detailsField = document.getElementById('project-details');
    const interest = { presence: "I'm interested in the Web Presence service.", operations: "I'm interested in the Business Systems service.", commerce: "I'm interested in the Custom Software & AI service.", audit: "I'd like to book a feasibility audit." };
    if (tier && interest[tier] && detailsField && !detailsField.value) detailsField.value = interest[tier] + ' ';

    if (project && detailsField) {
      detailsField.value = `Interested in a project similar to the "${project}" build.`;
    }
  }

  // ---------- client-side navigation: swap <main> and <footer>, keep header, tab bar and scroll engine alive ----------
  const pages = new Map();
  const load = (url) => {
    const key = new URL(url, location.href).pathname;
    if (!pages.has(key)) {
      pages.set(key, fetch(key).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); }).catch((e) => { pages.delete(key); throw e; }));
    }
    return pages.get(key);
  };
  const internal = (a) => a && a.origin === location.origin && !a.target && !a.hasAttribute("download");
  let lastPath = location.pathname;

  ["pointerenter", "touchstart"].forEach((ev) =>
    document.addEventListener(ev, (e) => {
      const a = e.target.closest?.("a[href]");
      if (internal(a) && a.pathname !== location.pathname) load(a.href).catch(() => {});
    }, { capture: true, passive: true })
  );
  (window.requestIdleCallback || setTimeout)(() => document.querySelectorAll("#tabbar a").forEach((a) => load(a.href).catch(() => {})));

  function syncChrome(doc) {
    ["header nav a", "#tabbar a"].forEach((sel) => {
      const cur = [...document.querySelectorAll(sel)], next = [...doc.querySelectorAll(sel)];
      cur.forEach((el, i) => {
        if (!next[i]) return;
        el.className = next[i].className;
        if (next[i].hasAttribute("aria-current")) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current");
      });
    });
    const tabs = [...document.querySelectorAll("#tabbar a")];
    const i = tabs.findIndex((a) => a.hasAttribute("aria-current"));
    const bubble = document.querySelector("#tabbar .tab-bubble");
    if (bubble) { if (i >= 0) bubble.style.setProperty("--i", i); bubble.style.opacity = i < 0 ? 0 : 1; }
    moveNavBubble();
  }

  // ---------- Back / Forward: every history entry remembers where the page was scrolled ----------
  let navigating = false, saveTimer = 0, overlayBack = null, resolveBack = null;
  const jump = (y) => (window.lenis ? window.lenis.scrollTo(y, { immediate: true }) : scrollTo(0, y));
  const saveY = () => {
    if (navigating) return; // while a page is being swapped the old position must not be written onto the entry we are going to
    try { history.replaceState({ ...(history.state || {}), y: Math.round(window.scrollY) }, ""); } catch (_) { /* ignore */ }
  };
  addEventListener("scroll", () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveY, 120); }, { passive: true });
  addEventListener("pagehide", saveY);

  // a reload (or coming back from another website) returns to the same place, not the top
  const navType = (performance.getEntriesByType("navigation")[0] || {}).type;
  if (history.state && history.state.overlay) history.replaceState({ ...history.state, overlay: false }, "");
  if (history.state && history.state.y > 0 && !location.hash && (navType === "reload" || navType === "back_forward")) {
    addEventListener("load", () => setTimeout(() => jump(history.state.y), 500), { once: true });
  }

  // an open project popup or the chat drawer gets its own history entry, so Back closes it first and leaves the page where it is
  const overlayOpen = () =>
    ["blueprint-modal", "confirmation-modal"].some((id) => { const m = document.getElementById(id); return m && !m.classList.contains("hidden"); }) ||
    document.getElementById("phase-ai")?.dataset.state === "open";
  let overlayWasOpen = false;
  new MutationObserver((recs) => {
    if (!recs.some((r) => ["blueprint-modal", "confirmation-modal", "phase-ai"].includes(r.target.id))) return;
    const open = overlayOpen();
    if (open && !overlayWasOpen) {
      saveY();
      if (!(history.state && history.state.overlay)) history.pushState({ ...(history.state || {}), overlay: true }, "");
    } else if (!open && overlayWasOpen && history.state && history.state.overlay) {
      overlayBack = new Promise((r) => { resolveBack = r; setTimeout(r, 400); });
      history.back(); // closed with the X, Esc or a tap outside: remove the entry we added
    }
    overlayWasOpen = open;
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class", "data-state"] });

  async function go(url, push = true, restoreY = 0) {
    if (push) saveY();
    navigating = true;
    try { await swap(url, push, restoreY); } finally { navigating = false; }
  }

  async function swap(url, push, restoreY) {
    const u = new URL(url, location.href);
    const root = document.documentElement;
    root.classList.add("leaving");
    let html;
    try {
      [html] = await Promise.all([load(u.href), new Promise((r) => setTimeout(r, 180))]);
    } catch (_) { location.href = u.href; return; }
    if (overlayBack) await overlayBack;
    const doc = new DOMParser().parseFromString(html, "text/html");
    const main = doc.querySelector("main"), foot = doc.querySelector("footer");
    if (!main) { location.href = u.href; return; }

    window.pageMotion?.teardown();
    closeModal(); closeConfirmationModal();
    if (push) {
      // from inside an open popup or the chat drawer the new page takes over that entry, so no leftover entry is left behind
      if (history.state && history.state.overlay) history.replaceState({ y: 0 }, "", u.href); else history.pushState({ y: 0 }, "", u.href);
    }
    lastPath = u.pathname;
    document.title = doc.title;
    document.querySelector("meta[name=description]")?.setAttribute("content", doc.querySelector("meta[name=description]")?.content || "");

    if (window.pageMotion) { root.classList.add("motion"); setTimeout(() => root.classList.remove("motion"), 2500); }
    document.querySelector("main").replaceWith(main);
    if (foot) document.querySelector("footer")?.replaceWith(foot);
    syncChrome(doc);
    if (window.lenis) window.lenis.scrollTo(0, { immediate: true }); else scrollTo(0, 0);
    initPageUI();
    handleUrlParams();
    window.pageMotion?.enter();
    // a link to work.html#tanish jumps straight to that card while the page is still hidden, so the page never shows the top first
    const target = u.hash && document.querySelector(u.hash);
    if (target) {
      if (window.lenis) window.lenis.scrollTo(target, { immediate: true, offset: -100 }); else { target.scrollIntoView(); scrollBy(0, -100); }
    } else if (restoreY > 0) {
      jump(restoreY); // Back / Forward: return to exactly where the visitor was on that page
    }
    root.classList.remove("leaving");
  }

  history.scrollRestoration = "manual";
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!internal(a) || a.pathname === location.pathname) return;
    e.preventDefault();
    go(a.href);
  });
  addEventListener("popstate", (e) => {
    if (resolveBack) { resolveBack(); resolveBack = null; overlayBack = null; }
    // Back on an open popup closes the popup (the chat drawer closes itself); the page stays where it was
    if (location.pathname === lastPath) { closeModal(); closeConfirmationModal(); return; }
    go(location.href, false, (e.state && e.state.y) || 0);
  });

  // DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initTabbar();
    initPageUI();
    initTopNav();
    initTopbarFX();
    handleUrlParams();
  });
})();
