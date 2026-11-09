#!/usr/bin/env node
// Builds the blog: public/blog/index.html, one page per post (public/blog/<slug>.html) and the RSS feed (public/blog/feed.xml).
//   Posts:   content/blog/<slug>.md  (see scripts/lib-blog.js for the format)
//   Layout:  content/legal/_layout.html  (the site header, footer and scripts)
// The SEO head (canonical, Open Graph, schema) is added afterwards by build-seo.js. The blog is linked from the footer only.
// Run with: node scripts/build-blog.js   (also runs as part of `npm run build`)
const fs = require('fs');
const path = require('path');
const { CATEGORIES, loadPosts, esc, longDate } = require('./lib-blog.js');

const root = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'site.config.json'), 'utf8'));
const site = config.siteUrl.replace(/\/$/, '');
const layout = fs.readFileSync(path.join(root, 'content/legal/_layout.html'), 'utf8');
const outDir = path.join(root, 'public/blog');
const posts = loadPosts();

// ---------- checks (the build fails on any of these)
const problems = [];
const known = new Set(['/', '/work', '/services', '/process', '/about', '/contact', '/privacy', '/terms', '/cookies', '/cancellation-and-refunds', '/blog', ...posts.map((p) => '/blog/' + p.slug)]);
const seenT = {}, seenD = {};
const INDEX = { seoTitle: 'Blog: Websites, Software & AI for Indian B2B', description: 'Guides and case studies from the Phaseline team on websites, business systems, AI and growing a B2B business online in India.' };
for (const p of posts) {
  const full = `${p.seoTitle} | Phaseline`;
  if (full.length > 60) problems.push(`${p.file}: seoTitle makes a ${full.length}-character title (limit 60): ${full}`);
  if (p.description.length > 155 || p.description.length < 70) problems.push(`${p.file}: description is ${p.description.length} characters (70 to 155)`);
  if (seenT[full]) problems.push(`${p.file}: same title as ${seenT[full]}`); else seenT[full] = p.file;
  if (seenD[p.description]) problems.push(`${p.file}: same description as ${seenD[p.description]}`); else seenD[p.description] = p.file;
  if (p.words < 600) problems.push(`${p.file}: only ${p.words} words (minimum 600)`);
  if (p.heads.filter((h) => h.level === 2).length < 3) problems.push(`${p.file}: needs at least 3 "##" sections`);
  for (const u of p.links) {
    if (/^https?:/.test(u)) continue;
    const clean = u.split('#')[0].split('?')[0];
    if (!u.startsWith('/') || !known.has(clean)) problems.push(`${p.file}: broken internal link ${u}`);
  }
}

// ---------- page pieces
const chipCls = 'inline-flex items-center px-3 py-1 rounded-full bg-[#EDE9DF] border border-[#0F1521]/15 font-label-sm text-xs uppercase tracking-wider text-[#785926] font-bold';
const pageFrom = (title, description, main) => layout
  .replace('{{TITLE}}', esc(title))
  .replace('{{DESCRIPTION}}', esc(description))
  .replace('{{MAIN}}', main)
  .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)} | Phaseline</title>`)
  .replace(/(<meta name="description"[^>]*>\r?\n)/, `$1  <link rel="alternate" type="application/rss+xml" title="Phaseline Blog" href="/blog/feed.xml">\n`);

const card = (p) => `<li><a href="/blog/${p.slug}" class="group flex h-full flex-col rounded-xl border border-[#0F1521]/12 bg-[#F7F4EE] p-6 transition-colors hover:border-[#B8935A] hover:bg-white">
  <span class="font-label-sm text-xs uppercase tracking-wider text-[#785926] font-bold">${esc(CATEGORIES[p.category].label)}</span>
  <h3 class="font-headline-sm mt-2 text-[22px] font-semibold leading-snug text-[#0F1521] group-hover:text-[#785926]">${esc(p.title)}</h3>
  <p class="mt-2 font-body-sm text-sm leading-relaxed text-[#45474c]">${esc(p.description)}</p>
  <span class="mt-auto pt-4 font-body-sm text-xs text-gray-500">${p.minutes} min read</span>
</a></li>`;

function indexMain() {
  const cats = Object.keys(CATEGORIES).filter((c) => posts.some((p) => p.category === c));
  const jump = cats.map((c) => `<a href="#${c}" class="${chipCls} hover:border-[#B8935A] transition-colors">${esc(CATEGORIES[c].label)}</a>`).join('\n          ');
  const sections = cats.map((c) => `      <section id="${c}" class="w-full max-w-[1280px] mx-auto px-4 sm:px-8 lg:px-12 pb-14">
        <h2 class="font-headline-md text-[28px] md:text-[32px] font-semibold text-[#0F1521]">${esc(CATEGORIES[c].label)}</h2>
        <p class="mt-2 max-w-2xl font-body-md text-body-md text-on-surface-variant">${esc(CATEGORIES[c].blurb)}</p>
        <ul class="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
${posts.filter((p) => p.category === c).map(card).join('\n')}
        </ul>
      </section>`).join('\n');
  return `  <main class="w-full pt-[78px] lg:pt-28 bg-background">
    <div class="flex flex-col w-full">
      <section class="w-full max-w-[1280px] mx-auto px-4 sm:px-8 lg:px-12 pt-14 pb-10">
        <nav aria-label="Breadcrumb"><ol class="flex items-center gap-2 font-body-sm text-sm text-gray-500"><li><a href="/" class="hover:text-black">Home</a></li><li aria-hidden="true">/</li><li aria-current="page" class="text-[#0F1521]">Blog</li></ol></nav>
        <h1 class="font-headline-xl mt-6 text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight text-[#0F1521]">The Phaseline Blog</h1>
        <p class="mt-4 max-w-3xl font-body-lg text-body-lg leading-relaxed text-on-surface-variant">Notes from the Phaseline team on websites, business systems, AI and growing a B2B business online in India. Plain language, no hype, and every claim about our own work comes from projects we have actually built.</p>
        <div class="mt-6 flex flex-wrap gap-2">
          ${jump}
        </div>
      </section>
${sections}
    </div>
  </main>`;
}

function postMain(p, i) {
  const cat = CATEGORIES[p.category];
  const h2 = p.heads.filter((h) => h.level === 2);
  const tocLinks = h2.map((h) => `<li><a href="#${h.id}" class="block py-1 text-sm text-gray-600 hover:text-black transition-colors">${esc(h.text)}</a></li>`).join('');
  const toc = h2.length >= 4 ? tocLinks : '';
  const sameCat = posts.filter((x) => x.category === p.category);
  const at = sameCat.findIndex((x) => x.slug === p.slug);
  const related = [];
  for (let k = 1; related.length < 3 && k < posts.length; k++) {
    const cand = sameCat.length > 3 ? sameCat[(at + k) % sameCat.length] : posts[(i + k) % posts.length];
    if (cand.slug !== p.slug && !related.includes(cand)) related.push(cand);
  }
  return `  <main class="w-full pt-[78px] lg:pt-28 bg-background">
    <article>
      <header class="w-full max-w-[1100px] mx-auto px-4 sm:px-8 pt-14 pb-8">
        <nav aria-label="Breadcrumb"><ol class="flex flex-wrap items-center gap-2 font-body-sm text-sm text-gray-500"><li><a href="/" class="hover:text-black">Home</a></li><li aria-hidden="true">/</li><li><a href="/blog" class="hover:text-black">Blog</a></li><li aria-hidden="true">/</li><li aria-current="page" class="text-[#0F1521]">${esc(p.seoTitle)}</li></ol></nav>
        <a href="/blog#${p.category}" class="${chipCls} mt-6 hover:border-[#B8935A] transition-colors">${esc(cat.label)}</a>
        <h1 class="font-headline-xl mt-4 max-w-3xl text-4xl sm:text-5xl font-semibold leading-[1.1] tracking-tight text-[#0F1521]">${esc(p.title)}</h1>
        <p class="mt-5 max-w-3xl font-body-lg text-body-lg leading-relaxed text-on-surface-variant">${esc(p.description)}</p>
        <p class="mt-6 font-body-sm text-sm text-gray-500">By the Phaseline team &middot; <time datetime="${p.date}">${longDate(p.date)}</time>${p.updated !== p.date ? ` &middot; Updated <time datetime="${p.updated}">${longDate(p.updated)}</time>` : ''} &middot; ${p.minutes} min read</p>
      </header>
      <div class="w-full max-w-[1100px] mx-auto px-4 sm:px-8 pb-16 grid gap-12 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div class="min-w-0 max-w-3xl">
${toc ? `          <details class="lg:hidden mb-8 rounded-xl border border-[#0F1521]/12 bg-[#F7F4EE] p-4"><summary class="cursor-pointer font-label-md text-sm font-semibold text-[#0F1521]">In this article</summary><ul class="mt-2">${toc}</ul></details>\n` : ''}          <div class="blog-prose">
${p.html}
          </div>
        </div>
${toc ? `        <aside class="hidden lg:block"><nav aria-label="In this article" class="sticky top-28 rounded-xl border border-[#0F1521]/12 bg-[#F7F4EE] p-5"><p class="font-label-sm text-xs uppercase tracking-wider text-[#785926] font-bold mb-2">In this article</p><ul>${toc}</ul></nav></aside>\n` : ''}      </div>
    </article>
    <section class="w-full max-w-[1100px] mx-auto px-4 sm:px-8 pb-12">
      <div class="rounded-2xl bg-[#161C28] px-6 py-10 sm:px-10 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b-4 border-[#B8935A]">
        <div class="max-w-2xl">
          <h2 class="font-headline-md text-[28px] md:text-[32px] font-semibold text-white">Have a project in mind? Talk directly with the team.</h2>
          <p class="mt-2 font-body-md text-body-md text-gray-300">We build the website and the systems behind it, and send every enquiry to your WhatsApp.</p>
        </div>
        <a href="/contact" class="inline-flex shrink-0 items-center justify-center h-12 px-8 rounded-full bg-[#B8935A] text-[#0F1521] font-bold text-xs uppercase tracking-wider hover:bg-[#fed394] transition-colors">Talk to the Team</a>
      </div>
    </section>
    <section class="w-full max-w-[1100px] mx-auto px-4 sm:px-8 pb-20" aria-label="More from the blog">
      <h2 class="font-headline-md text-[26px] font-semibold text-[#0F1521]">Keep reading</h2>
      <ul class="mt-5 grid gap-5 md:grid-cols-3">
${related.map(card).join('\n')}
      </ul>
      <p class="mt-8"><a href="/blog" class="font-body-sm text-sm font-semibold text-[#785926] underline decoration-[#B8935A] underline-offset-4 hover:text-black">All posts</a></p>
    </section>
  </main>`;
}

// ---------- write
fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) if (f.endsWith('.html') && f !== 'index.html' && !posts.some((p) => f === p.slug + '.html')) fs.unlinkSync(path.join(outDir, f));   // a deleted post disappears
fs.writeFileSync(path.join(outDir, 'index.html'), pageFrom(INDEX.seoTitle, INDEX.description, indexMain()));
posts.forEach((p, i) => fs.writeFileSync(path.join(outDir, p.slug + '.html'), pageFrom(p.seoTitle, p.description, postMain(p, i))));

// RSS feed
const rfc = (iso) => new Date(iso + 'T09:00:00Z').toUTCString();
fs.writeFileSync(path.join(outDir, 'feed.xml'), ['<?xml version="1.0" encoding="UTF-8"?>', '<rss version="2.0"><channel>',
  `<title>Phaseline Blog</title><link>${site}/blog</link><description>${esc(INDEX.description)}</description><language>en-IN</language>`,
  ...posts.map((p) => `<item><title>${esc(p.title)}</title><link>${site}/blog/${p.slug}</link><guid isPermaLink="true">${site}/blog/${p.slug}</guid><pubDate>${rfc(p.date)}</pubDate><category>${esc(CATEGORIES[p.category].label)}</category><description>${esc(p.description)}</description></item>`),
  '</channel></rss>', ''].join('\n'));

if (problems.length) { console.error('Blog check FAILED:\n - ' + problems.join('\n - ')); process.exit(1); }
console.log(`blog: index + ${posts.length} posts + feed (all checks passed)`);
