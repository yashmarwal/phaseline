#!/usr/bin/env node
// Builds the four legal pages (public/<slug>.html), public/sitemap.xml and public/robots.txt.
//   Text:    content/legal/<slug>.md   (edit these; no layout code in them)
//   Layout:  content/legal/_layout.html (site header, footer and scripts)
//   Values:  site.config.json           (business name, email, WhatsApp, hours, location, site URL)
// Run with: node scripts/build-legal.js   (also runs as part of `npm run build`)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'site.config.json'), 'utf8'));
const layout = fs.readFileSync(path.join(root, 'content/legal/_layout.html'), 'utf8');
const dir = path.join(root, 'content/legal');
const slugs = ['privacy', 'terms', 'cookies', 'cancellation-and-refunds'];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const link = 'underline decoration-[#B8935A] decoration-2 underline-offset-2 hover:text-[#785926] transition-colors';

// {{email}} and friends are filled from site.config.json so a changed address only needs editing there
function fill(text) {
  return text
    .replace(/\{\{email\}\}/g, `[${config.contactEmail}](mailto:${config.contactEmail})`)
    .replace(/\{\{whatsapp\}\}/g, `[${config.whatsappNumber}](${config.whatsappLink})`)
    .replace(/\{\{business\}\}/g, config.businessName)
    .replace(/\{\{hours\}\}/g, config.hours)
    .replace(/\{\{location\}\}/g, config.location);
}

// inline: **bold** and [text](url)
function inline(text) {
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-on-surface font-semibold">$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => {
      const external = /^https?:/.test(u);
      return `<a href="${u}" class="${link}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${t}</a>`;
    });
}

function parse(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error('Missing front matter in ' + file);
  const meta = {};
  m[1].split('\n').forEach((l) => { const i = l.indexOf(':'); if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
  const sections = [];
  m[2].split(/^## /m).slice(1).forEach((chunk) => {
    const nl = chunk.indexOf('\n');
    sections.push({ title: chunk.slice(0, nl).trim(), body: fill(chunk.slice(nl + 1).trim()) });
  });
  return { meta, sections };
}

function body(md) {
  return md.split(/\n{2,}/).map((block) => {
    const lines = block.split('\n');
    if (lines.every((l) => /^- /.test(l))) {
      return `<ul class="list-disc pl-6 space-y-2 mb-5 marker:text-[#B8935A]">\n${lines.map((l) => `  <li class="font-body-md text-body-md text-on-surface-variant leading-relaxed pl-1">${inline(l.slice(2))}</li>`).join('\n')}\n</ul>`;
    }
    return `<p class="font-body-md text-body-md text-on-surface-variant leading-relaxed mb-5">${inline(block.replace(/\n/g, ' '))}</p>`;
  }).join('\n');
}

const longDate = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function page({ meta, sections }) {
  // contents numbers come from data-n and a ::before; heading numbers end in a zero-width space, so the site count-up animation never mistakes either for a statistic
  const num = 'before:content-[attr(data-n)] before:mr-1.5 before:text-[#B8935A] before:font-semibold';
  const toc = sections.map((s, i) => `<li><a href="#section-${i + 1}" data-n="${i + 1}." class="block py-1 font-body-sm text-sm text-gray-600 hover:text-black transition-colors ${num}">${esc(s.title)}</a></li>`).join('\n');
  const secs = sections.map((s, i) => `<section id="section-${i + 1}" class="scroll-mt-28 mb-10">
  <h2 class="text-2xl font-bold text-on-surface mb-4" style="font-family: 'Fraunces', serif;"><span class="text-[#B8935A] mr-2">${i + 1}.&#8203;</span>${esc(s.title)}</h2>
${body(s.body)}
</section>`).join('\n');
  const main = `  <main class="w-full pt-[78px] lg:pt-28 bg-background">
    <div class="flex flex-col w-full">
      <section class="w-full max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-12 pt-16 pb-8">
        <div class="max-w-4xl">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EDE9DF] mb-4 border border-[#0F1521]/15 shadow-sm">
            <span class="w-2 h-2 rounded-full bg-[#B8935A]"></span>
            <span class="font-label-sm text-xs uppercase tracking-wider text-[#B8935A] font-bold">Legal</span>
          </div>
          <h1 class="text-4xl sm:text-5xl font-bold tracking-tight text-on-surface" style="font-family: 'Fraunces', serif;">${esc(meta.title)}</h1>
          <p class="font-body-lg text-body-lg text-on-surface-variant max-w-3xl mt-4 leading-relaxed">${esc(meta.intro)}</p>
          <p class="font-body-sm text-xs text-gray-500 mt-4">Last updated: ${longDate(meta.updated)}</p>
        </div>
      </section>
      <section class="w-full max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-12 pb-20">
        <div class="legal-layout flex flex-col lg:flex-row gap-8 lg:gap-14 items-start">
          <nav aria-label="Contents" class="w-full lg:w-72 lg:shrink-0 lg:sticky lg:top-28 bg-[#F7F4EE] rounded-xl border border-[#0F1521]/15 p-5">
            <p class="font-label-sm text-xs uppercase tracking-wider text-[#B8935A] font-bold mb-2">Contents</p>
            <ol class="list-none">
${toc}
            </ol>
          </nav>
          <div class="w-full max-w-3xl min-w-0">
${secs}
          </div>
        </div>
      </section>
    </div>
  </main>`;
  return layout
    .replace('{{TITLE}}', esc(meta.title))
    .replace('{{DESCRIPTION}}', esc(meta.description))
    .replace('{{CANONICAL}}', `${config.siteUrl}/${meta.slug}`)
    .replace('{{MAIN}}', main);
}

slugs.forEach((slug) => {
  const parsed = parse(path.join(dir, slug + '.md'));
  if (parsed.meta.slug !== slug) throw new Error(`${slug}.md has slug "${parsed.meta.slug}"`);
  fs.writeFileSync(path.join(root, 'public', slug + '.html'), page(parsed));
  console.log('built public/' + slug + '.html');
});

// sitemap and robots (the four legal pages plus the site's own pages)
const pages = ['', 'work', 'services', 'process', 'about', 'contact', ...slugs];
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(root, 'public/sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${config.siteUrl}/${p}</loc>${slugs.includes(p) ? `<lastmod>${parse(path.join(dir, p + '.md')).meta.updated}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(root, 'public/robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`);
console.log('built public/sitemap.xml and public/robots.txt');
