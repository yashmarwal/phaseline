#!/usr/bin/env node
// Keeps the contact email and WhatsApp details the same everywhere.
//   1. Change the value in site.config.json
//   2. Run: npm run config   (it also runs as part of `npm run build`)
// It finds the value that was applied last time (content/applied-config.json) in every page and in site.js,
// swaps it for the new one, and remembers the new value.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'site.config.json'), 'utf8'));
const appliedFile = path.join(root, 'content/applied-config.json');
const applied = JSON.parse(fs.readFileSync(appliedFile, 'utf8'));

const keys = ['contactEmail', 'whatsappNumber', 'whatsappLink', 'web3formsKey'];
const files = fs.readdirSync(path.join(root, 'public')).filter((f) => /\.(html|js)$/.test(f) && f !== 'motion.js').map((f) => path.join(root, 'public', f));

files.push(path.join(root, 'content/legal/_layout.html')); // the footer the legal pages are built from

let total = 0;
for (const key of keys) {
  const from = applied[key], to = config[key];
  if (!to || from === to) continue;
  let n = 0;
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const parts = text.split(from);
    if (parts.length > 1) { fs.writeFileSync(f, parts.join(to)); n += parts.length - 1; }
  }
  console.log(`${key}: "${from}" -> "${to}" (${n} places)`);
  applied[key] = to;
  total += n;
}
fs.writeFileSync(appliedFile, JSON.stringify(applied, null, 2) + '\n');
console.log(total ? `Updated ${total} places.` : 'Contact details already match site.config.json.');
