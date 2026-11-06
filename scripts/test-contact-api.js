#!/usr/bin/env node
// Quick check of the contact form's server rules, with the database faked. Run: node scripts/test-contact-api.js
const assert = require('assert');
process.env.SUPABASE_URL = 'http://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
const handler = require('../api/contact.js');

let counts, inserts, columnExists;
global.fetch = async (url, init = {}) => {
  if (!init.method || init.method === 'GET') {
    const email = /email=eq\./.test(url);
    return { ok: true, headers: { get: () => `0-0/${email ? counts.email : counts.total}` } };
  }
  const row = JSON.parse(init.body);
  if (!columnExists && 'consent_at' in row) return { ok: false, status: 400, text: async () => 'Could not find the consent_at column' };
  inserts.push(row);
  return { ok: true, text: async () => '' };
};

const good = { name: 'A B', company: 'C', email: 'a@b.co', phone: '+91 90000 00000', details: 'Need a site', consent: true, elapsed: 8000, website: '' };
async function run(body, headers = {}) {
  let out;
  const res = { status(c) { out = { code: c }; return this; }, json(j) { out.body = j; return this; } };
  await handler({ method: 'POST', headers: { host: 'phaseline.in', ...headers }, body }, res);
  return out;
}
const reset = () => { counts = { email: 0, total: 0 }; inserts = []; columnExists = true; };

(async () => {
  reset(); let r = await run(good);
  assert.equal(r.code, 200); assert.equal(inserts.length, 1); assert.ok(inserts[0].consent_at, 'consent time is stored');

  reset(); r = await run({ ...good, website: 'x' }); assert.equal(r.code, 200); assert.equal(inserts.length, 0, 'honeypot saves nothing');
  reset(); r = await run({ ...good, elapsed: 300 }); assert.equal(inserts.length, 0, 'instant post saves nothing');
  reset(); r = await run({ ...good, elapsed: undefined }); assert.equal(inserts.length, 0, 'no timer saves nothing');
  reset(); r = await run({ ...good, consent: false }); assert.equal(r.code, 400); assert.equal(inserts.length, 0);
  reset(); r = await run({ ...good, details: 'http://a.com http://b.com http://c.com http://d.com' }); assert.equal(inserts.length, 0, 'link spam saves nothing');
  reset(); r = await run({ ...good, email: 'nope' }); assert.equal(r.code, 400);
  reset(); counts.email = 3; r = await run(good); assert.equal(r.code, 429); assert.equal(inserts.length, 0, 'per-email limit');
  reset(); counts.total = 60; r = await run(good); assert.equal(r.code, 429, 'flood limit');
  reset(); r = await run(good, { origin: 'https://evil.example' }); assert.equal(r.code, 403);
  reset(); r = await run(good, { origin: 'https://phaseline.in' }); assert.equal(r.code, 200);
  reset(); columnExists = false; r = await run(good);
  assert.equal(r.code, 200); assert.ok(/Consent: agreed/.test(inserts[0].details), 'falls back to a note before the column exists');
  console.log('contact API: all checks passed');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
