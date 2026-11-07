#!/usr/bin/env node
// Adds the SEO markup to every page in public/: canonical, robots, Open Graph, Twitter card, JSON-LD, icons, manifest link, font preloads.
//   Data:  content/seo.json (page list, FAQ and service text for the schema), site.config.json (host, email, phone, hours)
//   Title and description are NOT set here: they are read from each page's own <title> and meta description.
// Safe to run again and again: it replaces its own block (between the seo:start / seo:end comments).
// The build FAILS if: a title is over 60 characters, a description over 155, a title or description is used twice,
// a canonical is missing or on the wrong host, the JSON-LD does not parse or repeats an @id, or a sentence used in the
// schema is not visible text on the site.
// Run with: node scripts/build-seo.js   (also runs as part of `npm run build`)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'site.config.json'), 'utf8'));
const seo = JSON.parse(fs.readFileSync(path.join(root, 'content/seo.json'), 'utf8'));
const site = config.siteUrl.replace(/\/$/, '');
const ORG = `${site}/#organization`;
const SITE = `${site}/#website`;
const LANG = 'en-IN';

const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&#0?39;|&rsquo;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const norm = (s) => unesc(s).replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();
const file = (name) => path.join(root, 'public', name + '.html');
const visible = (html) => norm(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' '));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const sources = fs.readdirSync(path.join(root, 'public')).filter((f) => f.endsWith('.html')).map((f) => fs.readFileSync(path.join(root, 'public', f), 'utf8'));
const allText = sources.map(visible).join(' | ');
const problems = [];
const mustBeVisible = (text, where) => { if (!allText.includes(norm(text))) problems.push(`${where}: "${text}" is not visible text on the site`); };

mustBeVisible(seo.organization.description, 'organization.description');
mustBeVisible(seo.organization.alternateName, 'organization.alternateName');
// every sameAs profile must be a real link in the footer of every page (the schema may only point where the site itself points)
sources.forEach((h, i) => { for (const u of seo.organization.sameAs) if (!h.includes(`href="${u}"`)) problems.push(`sameAs: ${u} is not linked in the footer of page #${i}`); });
mustBeVisible(config.location, 'location');
mustBeVisible(config.hours, 'hours');
mustBeVisible(config.contactEmail, 'email');
mustBeVisible(config.whatsappNumber, 'phone');
seo.pages.forEach((p) => {
  (p.services || []).forEach((s) => { mustBeVisible(s.name, 'service name'); mustBeVisible(s.description, `service ${s.name}`); });
  (p.faq || []).forEach((f) => { mustBeVisible(f.q, 'faq question'); mustBeVisible(f.a, `faq ${f.q}`); });
});
(seo.preloadFonts || []).forEach((f) => { if (!fs.existsSync(path.join(root, 'public', f))) problems.push(`preloadFonts: public${f} does not exist`); });

const org = {
  '@type': 'Organization', '@id': ORG, name: config.businessName, alternateName: seo.organization.alternateName, url: site + '/', sameAs: seo.organization.sameAs,
  logo: site + seo.organization.logo, image: site + seo.organization.image,
  description: seo.organization.description, email: config.contactEmail, telephone: config.whatsappNumber,
  address: { '@type': 'PostalAddress', addressLocality: seo.organization.addressLocality, addressCountry: seo.organization.addressCountry },
  areaServed: { '@type': 'Country', name: 'India' },
  contactPoint: [{
    '@type': 'ContactPoint', contactType: 'sales', email: config.contactEmail, telephone: config.whatsappNumber, areaServed: 'IN',
    hoursAvailable: { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], opens: '09:00', closes: '20:00' }
  }]
};
const orgRef = { '@type': 'Organization', '@id': ORG, name: config.businessName, url: site + '/' };

// icons, manifest, theme colour and font preloads: the same on every page, including the 404
const extras = () => [
  ...(seo.preloadFonts || []).map((f) => `  <link rel="preload" href="${f}" as="font" type="font/woff2" crossorigin>`),
  `  <link rel="icon" href="/favicon.ico" sizes="48x48">`,
  `  <link rel="icon" type="image/svg+xml" href="/logo/favicon.svg" sizes="any">`,
  `  <link rel="icon" type="image/png" sizes="48x48" href="/logo/favicon-48.png">`,
  `  <link rel="icon" type="image/png" sizes="192x192" href="/logo/icon-192.png">`,
  `  <link rel="apple-touch-icon" href="/logo/icon-180.png">`,
  `  <link rel="manifest" href="/manifest.webmanifest">`,
  `  <meta name="theme-color" content="${seo.themeColor}">`
];

function graphFor(p, title, desc) {
  const url = site + (p.path === '/' ? '/' : p.path);
  const home = p.path === '/';
  const graph = [home ? org : orgRef];
  if (home) graph.push({ '@type': 'WebSite', '@id': SITE, url: site + '/', name: config.businessName, alternateName: seo.organization.alternateName, inLanguage: LANG, publisher: { '@id': ORG } });
  graph.push({ '@type': p.type, '@id': url + '#webpage', url, name: title, description: desc, inLanguage: LANG, isPartOf: { '@id': SITE }, publisher: { '@id': ORG }, ...(home ? {} : { breadcrumb: { '@id': url + '#breadcrumb' } }) });
  if (!home) graph.push({ '@type': 'BreadcrumbList', '@id': url + '#breadcrumb', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: site + '/' },
    { '@type': 'ListItem', position: 2, name: p.crumb, item: url }] });
  (p.services || []).forEach((s) => graph.push({ '@type': 'Service', '@id': `${url}#service-${slug(s.name)}`, name: s.name, description: s.description, provider: { '@id': ORG }, areaServed: { '@type': 'Country', name: 'India' } }));
  if (p.faq) graph.push({ '@type': 'FAQPage', '@id': url + '#faq', mainEntity: p.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
  return graph;
}

function blockFor(p, title, desc) {
  if (p.noindex) return [...extras(), '  <meta name="robots" content="noindex, follow">'].join('\n');
  const url = site + (p.path === '/' ? '/' : p.path);
  const img = site + seo.organization.image;
  return [
    ...extras(),
    `  <meta name="robots" content="index, follow, max-image-preview:large">`,
    `  <link rel="canonical" href="${url}">`,
    `  <meta property="og:type" content="website">`,
    `  <meta property="og:site_name" content="${esc(config.businessName)}">`,
    `  <meta property="og:locale" content="en_IN">`,
    `  <meta property="og:url" content="${url}">`,
    `  <meta property="og:title" content="${esc(title)}">`,
    `  <meta property="og:description" content="${esc(desc)}">`,
    `  <meta property="og:image" content="${img}">`,
    `  <meta property="og:image:width" content="1200">`,
    `  <meta property="og:image:height" content="630">`,
    `  <meta name="twitter:card" content="summary_large_image">`,
    `  <meta name="twitter:title" content="${esc(title)}">`,
    `  <meta name="twitter:description" content="${esc(desc)}">`,
    `  <meta name="twitter:image" content="${img}">`,
    `  <script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graphFor(p, title, desc) }).replace(/</g, '\\u003c')}</script>`
  ].join('\n');
}

// pass 1: read every page's own title and description and check them
const pages = seo.pages.map((p) => {
  const html = fs.readFileSync(file(p.file), 'utf8');
  const title = unesc((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').trim();
  const desc = unesc((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '').trim();
  return { p, html, title, desc };
});
const seenT = {}, seenD = {};
pages.forEach(({ p, title, desc }) => {
  if (!title) problems.push(`${p.file}: no title`);
  if (!desc) problems.push(`${p.file}: no meta description`);
  if (title.length > 60) problems.push(`${p.file}: title is ${title.length} characters (limit 60)`);
  if (desc.length > 155) problems.push(`${p.file}: description is ${desc.length} characters (limit 155)`);
  if (p.noindex) return;
  if (seenT[title]) problems.push(`${p.file}: same title as ${seenT[title]}`); else seenT[title] = p.file;
  if (seenD[desc]) problems.push(`${p.file}: same description as ${seenD[desc]}`); else seenD[desc] = p.file;
});

// css and js get ?v=<hash of the file>, so the server can cache them for a year and a changed file still loads fresh
const ASSET = /(href|src)="\/?(styles\.css|fonts\.css|site\.js|motion\.js|phase-ai\.js|phase-ai-match\.js|vendor\/[\w.-]+\.js)(\?v=[0-9a-f]+)?"/g;
const hashOf = (rel) => crypto.createHash('sha1').update(fs.readFileSync(path.join(root, 'public', rel))).digest('hex').slice(0, 8);

// pass 2: write the block, then read the result back and check it
pages.forEach(({ p, html, title, desc }) => {
  html = html
    .replace(/[ \t]*<!-- seo:start -->[\s\S]*?<!-- seo:end -->\r?\n?/, '')
    .replace(/[ \t]*<link rel="(canonical|icon|apple-touch-icon|manifest)"[^>]*>\r?\n?/g, '')
    .replace(/[ \t]*<meta name="(robots|theme-color)"[^>]*>\r?\n?/g, '')
    .replace(/<html lang="[^"]*"/, `<html lang="${LANG}"`)
    .replace(ASSET, (m, attr, rel) => `${attr}="/${rel}?v=${hashOf(rel)}"`);
  const block = `  <!-- seo:start -->\n${blockFor(p, title, desc)}\n  <!-- seo:end -->\n`;
  // goes straight after the meta description so the head stays easy to read
  html = html.replace(/(<meta name="description"[^>]*>\r?\n)/, `$1${block}`);
  if (!html.includes('seo:start')) throw new Error(`${p.file}.html has no meta description to attach to`);
  fs.writeFileSync(file(p.file), html);

  if (p.noindex) return;
  const canon = [...html.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map((m) => m[1]);
  const want = site + (p.path === '/' ? '/' : p.path);
  if (canon.length !== 1 || canon[0] !== want) problems.push(`${p.file}: canonical is ${JSON.stringify(canon)}, expected ${want}`);
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (ld.length !== 1) problems.push(`${p.file}: ${ld.length} JSON-LD blocks`);
  try {
    const ids = JSON.parse(ld[0][1])['@graph'].map((n) => n['@id']).filter(Boolean);
    ids.filter((id, i) => ids.indexOf(id) !== i).forEach((id) => problems.push(`${p.file}: duplicate @id ${id}`));
  } catch (e) { problems.push(`${p.file}: JSON-LD does not parse (${e.message})`); }
});

// manifest (same name, colours and icons as the site)
fs.writeFileSync(path.join(root, 'public/manifest.webmanifest'), JSON.stringify({
  name: config.businessName, short_name: config.businessName, start_url: '/', display: 'browser',
  theme_color: seo.themeColor, background_color: seo.themeColor,
  icons: [{ src: '/logo/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/logo/icon-512.png', sizes: '512x512', type: 'image/png' }]
}, null, 2) + '\n');

// llms.txt for AI assistants: one line per page, taken from the page descriptions above
const lines = [`# ${config.businessName} (${seo.organization.alternateName})`, '', `> ${seo.organization.description}`, '', '## Pages', ''];
const legal = [];
pages.filter(({ p }) => !p.noindex).forEach(({ p, desc }) => {
  (/^\/(privacy|terms|cookies|cancellation)/.test(p.path) ? legal : lines).push(`- [${p.crumb || 'Home'}](${site}${p.path === '/' ? '/' : p.path}): ${desc}`);
});
lines.push('', '## Profiles', '', ...seo.organization.sameAs.map((u) => `- ${u}`));
lines.push('', '## Policies', '', ...legal, '', '## Contact', '', `- Email: ${config.contactEmail}`, `- WhatsApp: ${config.whatsappNumber}`, `- Hours: ${config.hours}`, '');
fs.writeFileSync(path.join(root, 'public/llms.txt'), lines.join('\n'));

if (problems.length) { console.error('SEO check FAILED:\n - ' + problems.join('\n - ')); process.exit(1); }
console.log(`seo markup: ${pages.length} pages, manifest, llms.txt (all checks passed)`);
