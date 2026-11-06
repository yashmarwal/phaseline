/**
 * Phaseline - motion layer
 * GSAP + ScrollTrigger + SplitText (headings, reveals, parallax, counters, marquee),
 * Lenis (smooth scroll), plus ink-line SVG drawing for the comic panels.
 */
(function () {
  'use strict';
  const root = document.documentElement;
  const done = () => root.classList.remove('motion');
  if (!window.gsap || matchMedia('(prefers-reduced-motion: reduce)').matches) return done();

  gsap.registerPlugin(ScrollTrigger, SplitText);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  let main = document.querySelector('main');

  // ---------- Lenis smooth scroll (wheel only; touch keeps native momentum) ----------
  let lenis;
  if (window.Lenis) {
    lenis = new Lenis({ lerp: 0.1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(100, 16); // a long frame (page boot) must not eat into the entrance animations
    window.lenis = lenis;
    // modals lock the body; keep Lenis in step
    new MutationObserver(() => (document.body.style.overflow === 'hidden' ? lenis.stop() : lenis.start()))
      .observe(document.body, { attributes: true, attributeFilter: ['style'] });
  }

  // ---------- helpers ----------
  const VERT = 0.85; // scroll-to-reveal travel is 15% gentler on vertical scroll (phone swipe reveals keep full strength)
  const once = (el, fn, start = 'top 88%') => ScrollTrigger.create({ trigger: el, start, once: true, onEnter: fn });

  function revealLines(el, delay = 0) {
    SplitText.create(el, {
      type: 'lines',
      mask: 'lines',
      autoSplit: true,
      onSplit: (self) =>
        gsap.from(self.lines, { yPercent: 140 * VERT, duration: 1, ease: 'expo.out', stagger: 0.08, delay }),
    });
  }

  function init() {
    // hero headline
    const h1 = main.querySelector('h1');
    if (h1) {
      const hero = h1.closest('section');
      const home = !!hero?.querySelector('.comic-panel');
      if (home) heroHome(h1, hero);
      else {
        gsap.set(h1, { opacity: 1 });
        SplitText.create(h1, {
          type: 'lines,words', mask: 'lines', autoSplit: true,
          onSplit: (self) => gsap.from(self.words, { yPercent: 140, rotate: 4, duration: 1.1, ease: 'expo.out', stagger: 0.06, delay: 0.15 }),
        });
        gsap.from([...h1.parentElement.children].filter((n) => n !== h1 && !n.querySelector(".comic-panel")), {
          y: 24, opacity: 0, duration: 0.9, ease: "power3.out", stagger: 0.1, delay: 0.5, clearProps: "all",
        });
      }
    }
    // section headings: masked line reveal as they scroll in
    $$('h2', main).forEach((h) => once(h, () => revealLines(h), 'top 90%'));

    // cards and panels: batched fade-up (stack cards on Services are driven by their own script)
    const all = $$(".comic-panel, article, .m-rail > *, section .grid > div", main).filter((el) => !el.closest(".card-item, #matrix"));
    const cards = all.filter((el) => !all.some((o) => o !== el && o.contains(el)));
    gsap.set(cards, { opacity: 0, y: 48 * VERT, transition: "none" });
    ScrollTrigger.batch(cards, {
      start: "top 90%",
      once: true,
      onEnter: (batch) => gsap.to(batch, { y: 0, opacity: 1, duration: 0.9, ease: "power3.out", stagger: 0.12, clearProps: "opacity,transform,transition" }),
    });

    // body copy: gentle rise
    $$('section > div > p, section > div > div > p', main)
      .filter((p) => !p.dataset.typed && !p.closest('.comic-panel, article, .m-rail, .card-item, #matrix'))
      .forEach((p) => {
        gsap.set(p, { opacity: 0, y: 22 * VERT });
        once(p, () => gsap.to(p, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', clearProps: 'all' }), 'top 92%');
      });

    // count-up stats
    $$('span, p, div', main)
      .filter((n) => !n.children.length && /^\d[\d,.]*[+%]?$/.test(n.textContent.trim()))
      .forEach((n) => {
        const txt = n.textContent.trim();
        const end = parseFloat(txt.replace(/,/g, ''));
        const suffix = txt.replace(/^[\d,.]+/, '');
        const state = { v: 0 };
        n.textContent = '0' + suffix;
        once(n, () =>
          gsap.to(state, {
            v: end, duration: 1.8, ease: 'power2.out',
            onUpdate: () => (n.textContent = Math.round(state.v) + suffix),
          })
        );
      });

    // parallax: images that live in an overflow-hidden frame
    $$('main img').forEach((img) => {
      if (getComputedStyle(img.parentElement).overflow === 'visible') return;
      gsap.fromTo(img, { yPercent: -7, scale: 1.16 }, {
        yPercent: 7, ease: 'none',
        scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });

    // trusted-by strip becomes a marquee
    const label = $$('span', main).find((s) => /TRUSTED BY/i.test(s.textContent));
    const track = label && label.nextElementSibling;
    if (track) {
      const row = document.createElement('div');
      row.className = 'marquee-track';
      row.append(...track.children);
      row.append(...[...row.children].map((c) => c.cloneNode(true)));
      track.className = 'marquee';
      track.append(row);
      gsap.to(row, { xPercent: -50, duration: 28, ease: 'none', repeat: -1 });
    }

    draftCards();
    const stopInk = inkLines();
    ScrollTrigger.refresh();
    done(); // every start state is set: reveal the page
    return () => stopInk();
  }

  // ---------- text cards: blueprint drafting marks + editorial text reveal, scrubbed by scroll ----------
  // one timeline per card, tied to scroll position (scrolling back un-sets it): corner marks close in,
  // the label tightens, the headline and description rise line by line, the footer row fades up
  function draftCards() {
    $$(".m-rail > *, section .grid > div, .card-item, .text-card", main)
      .filter((c) => !c.matches(".no-draft") && c.querySelector("h2, h3, h4") && c.querySelector("p") && !c.querySelector("img, video") && !c.querySelector("svg.w-full") && !c.closest("#matrix"))
      .forEach((card) => {
        card.classList.add("draft");
        // corner marks only on real cards (own padding of 20px+); plain text columns just get the text animation
        const cs0 = getComputedStyle(card);
        if (parseFloat(cs0.paddingLeft) >= 20 && parseFloat(cs0.paddingTop) >= 20) card.classList.add("marks");
        // plain label only: pills (rounded-full chips) keep their own width, so the dimension line is never added inside them
        const eyebrow = [...card.querySelectorAll("span.uppercase, p.uppercase")].find((e) => !e.classList.contains("rounded-full") && !e.closest(".rounded-full"));
        eyebrow?.classList.add("rule");
        const head = card.querySelector("h2, h3, h4");
        const para = card.querySelector("p:not(.uppercase)");
        const foot = card.querySelector(".border-t");

        SplitText.create([head, para], {
          type: "lines",
          mask: "lines",
          autoSplit: true,
          onSplit: (self) => {
            const hl = self.lines.filter((l) => head.contains(l));
            const pl = self.lines.filter((l) => para.contains(l));
            const swipe = matchMedia("(max-width: 767px)").matches && card.parentElement.classList.contains("m-rail");
            const tl = gsap.timeline(swipe ? { paused: true } : { scrollTrigger: { trigger: card, start: "top 90%", end: "top 40%", scrub: 0.7 } });
            tl.to(card, { "--p": 1, ease: "none", duration: 0.7 }, 0);
            if (eyebrow) tl.from(eyebrow, { letterSpacing: "0.45em", opacity: 0, duration: 0.35, ease: "power2.out" }, 0.05);
            const k = swipe ? 1 : VERT; // swipe cards on phones are revealed by horizontal movement: unchanged
            tl.from(hl, { yPercent: 140 * k, duration: 0.4, ease: "power3.out", stagger: 0.08 }, 0.15);
            tl.from(pl, { yPercent: 140 * k, duration: 0.4, ease: "power3.out", stagger: 0.07 }, 0.32);
            if (foot) tl.from(foot, { opacity: 0, y: 14 * k, duration: 0.3, ease: "power2.out" }, 0.7);
            if (swipe) {
              // phones: the card draws itself as it slides in horizontally; vertical position only gates it
              let v = 0;
              const vt = ScrollTrigger.create({ trigger: card, start: "top 92%", end: "top 55%", onUpdate: (s) => { v = s.progress; card._upd(); } });
              card._upd = () => {
                const vw = innerWidth, left = card.getBoundingClientRect().left;
                const h = gsap.utils.clamp(0, 1, (vw * 0.9 - left) / (vw * 0.7));
                gsap.to(tl, { progress: Math.min(v, h), duration: 0.3, ease: "power2.out", overwrite: true });
              };
              card._upd();
              return { revert: () => { vt.kill(); tl.revert(); card._upd = null; } };
            }
            return tl;
          },
        });
      });
    $$(".m-rail").forEach((rail) =>
      rail.addEventListener("scroll", () => [...rail.children].forEach((c) => c._upd?.()), { passive: true })
    );
  }

  // ---------- ink-line drawing for the comic-panel illustrations ----------
  function inkLines() {
    const shapes = 'path,line,rect,circle,ellipse,polygon,polyline';
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        const tl = gsap.timeline();
        e.target._ink.forEach(({ el, len, dashed }, i) => {
          if (dashed) tl.to(el, { opacity: 1, duration: 0.5 }, 0.5 + i * 0.01);
          else tl.fromTo(el, { strokeDashoffset: len, fillOpacity: 0 }, { strokeDashoffset: 0, fillOpacity: 1, duration: 0.9, ease: 'power2.inOut' }, i * 0.035);
        });
        $$('text', e.target).forEach((t) => tl.to(t, { opacity: 1, duration: 0.6 }, 0.8));
      });
    }, { threshold: 0.5 });

    $$('main svg').forEach((svg) => {
      if (svg.closest('button, a, .material-symbols-outlined') || svg.getBoundingClientRect().width < 60) return;
      svg._ink = $$(shapes, svg).map((el) => {
        const dashed = el.hasAttribute('stroke-dasharray') || el.getAttribute('stroke') === 'none';
        const len = dashed ? 0 : el.getTotalLength?.() || 0;
        if (!dashed && len) { el.style.strokeDasharray = len; el.style.strokeDashoffset = len; el.style.fillOpacity = 0; }
        else if (dashed) el.style.opacity = 0;
        return { el, len, dashed: dashed || !len };
      });
      $$('text', svg).forEach((t) => (t.style.opacity = 0));
      io.observe(svg);
    });
    return () => io.disconnect();
  }

  // ---------- home hero: words rise, brass marker under the gold phrase, paragraph is typed ----------
  function heroHome(h1, hero) {
    const host = h1.parentElement;
    const para = host.querySelector("p");
    const others = [...host.children].filter((n) => n !== h1 && n !== para && !n.querySelector(".comic-panel"));

    gsap.set(h1, { opacity: 1 });
    SplitText.create(h1, {
      type: "lines,words",
      mask: "lines",
      autoSplit: true,
      onSplit: (self) => {
        const tl = gsap.timeline();
        tl.from(self.words, { yPercent: 140, rotate: 4, duration: 1.1, ease: "expo.out", stagger: 0.06, delay: 0.15 }, 0);
        const mark = self.words.filter((w) => w.closest("span.italic"));
        if (mark.length) {
          mark.forEach((w) => w.classList.add("hl-word"));
          tl.fromTo(mark, { backgroundSize: "0% 11%" }, { backgroundSize: "100% 11%", duration: 0.9, ease: "power3.inOut", stagger: 0.18 }, 1.3);
        }
        return tl;
      },
    });

    // paragraph: set up for typing (letters hidden, layout untouched)
    let chars = [];
    const caret = document.createElement("span");
    caret.className = "tw-caret";
    if (para) {
      para.dataset.typed = "1";
      para.classList.add("tw-host");
      chars = SplitText.create(para, { type: "words,chars" }).chars;
      gsap.set(chars, { opacity: 0 });
      para.appendChild(caret);
    }
    gsap.set(others, { opacity: 0, y: 24 });

    const tl = gsap.timeline({ delay: 0.9 });
    tl.to(others, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", stagger: 0.1, clearProps: "all" }, 0.4);
    if (para && chars.length) {
      const step = 0.014;
      chars.forEach((c, i) => {
        tl.set(c, { opacity: 1 }, i * step);
        if (i % 2 === 0 || i === chars.length - 1) tl.add(() => {
          const pr = para.getBoundingClientRect(), r = c.getBoundingClientRect();
          caret.style.left = r.right - pr.left + 1 + "px";
          caret.style.top = r.top - pr.top + "px";
          caret.style.height = r.height + "px";
          caret.style.opacity = 1;
        }, i * step);
      });
      const end = chars.length * step;
      tl.to(caret, { opacity: 0, duration: 0.2, repeat: 5, yoyo: true, ease: "none" }, end + 0.05);
      tl.set(caret, { opacity: 0 }, end + 1.4);
    }

    // headline drifts down and softens as the hero scrolls away
    gsap.to(h1, { yPercent: 16, opacity: 0.35, ease: "none", scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true } });
  }

  // ---------- page lifecycle: runs on first load and again after every client-side page swap ----------
  let ctx;
  const teardown = () => {
    ctx?.revert();
    ctx = null;
    ScrollTrigger.getAll().forEach((t) => t.kill());
  };
  const enter = () => {
    teardown();
    main = document.querySelector('main');
    ctx = gsap.context(() => init());
  };
  window.pageMotion = { enter, teardown };
  Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 700))]).then(enter);
})();
