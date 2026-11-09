// Reads the blog posts in content/blog/*.md and turns them into HTML. Used by build-blog.js (pages), build-legal.js (sitemap) and build-seo.js (schema, llms.txt).
// A post is: a front matter block (title, seoTitle, description, category, date, updated, keywords) and a body in a small Markdown subset:
//   ## heading   ### sub-heading   paragraphs   - bullets   1. numbers   > quote   **bold**   *italic*   `code`   [text](url)
// A "## Frequently asked questions" section (### question, then its answer) becomes FAQ markup as well as visible text.
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../content/blog');
const CATEGORIES = {
  'client-work': { label: 'Client Projects', blurb: 'What we built for real businesses, the problem each one had, and how we solved it.' },
  websites: { label: 'Websites for B2B', blurb: 'Plain-language guides for manufacturers, exporters, traders and service businesses planning a website.' },
  'business-systems': { label: 'Business Systems & Software', blurb: 'Admin panels, enquiry tracking, bookings and custom software: when they pay off and how to choose.' },
  ai: { label: 'AI for Business', blurb: 'AI assistants and chatbots for business websites and WhatsApp, with the limits stated honestly.' },
  ecommerce: { label: 'Online Stores & Payments', blurb: 'Selling online in India: stores, payments, customer accounts and the decisions behind them.' },
  seo: { label: 'SEO & Getting Found', blurb: 'How Indian B2B buyers search, and what makes a website easy for Google to find and understand.' },
  industry: { label: 'Industry Insights', blurb: 'How Indian manufacturers and traders win enquiries online.' },
  about: { label: 'About Phaseline', blurb: 'How we work, what you own, and how projects, quotes and support run.' }
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const slugify = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const plain = (html) => unesc(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

function inline(text) {
  let s = esc(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => {
    const external = /^https?:/.test(u);
    return `<a href="${u}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${t}</a>`;
  });
  return s;
}

function render(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [], heads = [], faq = [], links = [];
  let i = 0, inFaq = false;
  const addFaq = (html) => { if (inFaq && faq.length) faq[faq.length - 1].a += (faq[faq.length - 1].a ? ' ' : '') + plain(html); };
  const collectLinks = (html) => { for (const m of html.matchAll(/href="([^"]+)"/g)) links.push(m[1]); };
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{2,3})\s+(.*)$/))) {
      const level = m[1].length, text = m[2].trim(), id = slugify(text);
      if (level === 2) inFaq = /^frequently asked questions$/i.test(text);
      if (level === 3 && inFaq) faq.push({ q: text, a: '' });
      else heads.push({ level, text, id });
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`); i++; continue;
    }
    if (/^[-*]\s+/.test(l)) { const items = []; while (i < lines.length && /^[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^[-*]\s+/, '')); i++; } const h = '<ul>' + items.map((x) => `<li>${inline(x)}</li>`).join('') + '</ul>'; out.push(h); addFaq(h); collectLinks(h); continue; }
    if (/^\d+\.\s+/.test(l)) { const items = []; while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s+/, '')); i++; } const h = '<ol>' + items.map((x) => `<li>${inline(x)}</li>`).join('') + '</ol>'; out.push(h); addFaq(h); collectLinks(h); continue; }
    if (/^>\s?/.test(l)) { const q = []; while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; } const h = `<blockquote><p>${inline(q.join(' '))}</p></blockquote>`; out.push(h); collectLinks(h); continue; }
    const p = []; while (i < lines.length && lines[i].trim() && !/^(#{2,3}\s|[-*]\s|\d+\.\s|>)/.test(lines[i])) { p.push(lines[i].trim()); i++; }
    const h = `<p>${inline(p.join(' '))}</p>`; out.push(h); addFaq(h); collectLinks(h);
  }
  return { html: out.join('\n'), heads, faq, links };
}

function parseFront(raw, file) {
  const m = raw.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error('Missing front matter in ' + file);
  const meta = {};
  m[1].split('\n').forEach((l) => { const i = l.indexOf(':'); if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
  return { meta, body: m[2].trim() };
}

function loadPosts() {
  if (!fs.existsSync(dir)) return [];
  const posts = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort().map((f) => {
    const slug = f.replace(/\.md$/, '');
    const { meta, body } = parseFront(fs.readFileSync(path.join(dir, f), 'utf8'), f);
    for (const k of ['title', 'seoTitle', 'description', 'category', 'date']) if (!meta[k]) throw new Error(`${f}: missing "${k}"`);
    if (!CATEGORIES[meta.category]) throw new Error(`${f}: unknown category "${meta.category}"`);
    const r = render(body);
    const words = body.replace(/[#>*`\[\]()-]/g, ' ').split(/\s+/).filter(Boolean).length;
    return {
      slug, title: meta.title, seoTitle: meta.seoTitle, description: meta.description, category: meta.category,
      date: meta.date, updated: meta.updated || meta.date, keywords: (meta.keywords || '').split(',').map((s) => s.trim()).filter(Boolean),
      html: r.html, heads: r.heads, faq: r.faq, links: r.links, words, minutes: Math.max(1, Math.round(words / 220)), file: f
    };
  });
  return posts;
}

const longDate = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
module.exports = { CATEGORIES, loadPosts, render, esc, unesc, plain, slugify, longDate };
