#!/usr/bin/env node
// Checks the weekly chat report with the database and the email service faked. Run: node scripts/test-weekly-report.js
const assert = require('assert');
const ExcelJS = require('exceljs');
process.env.SUPABASE_URL = 'http://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test';
process.env.RESEND_API_KEY = 're_test';
process.env.CRON_SECRET = 'a-long-random-cron-secret';
const handler = require('../api/weekly-report.js');

let table, mails, deletes, mailStatus, dbFail, reads, lastRead;
global.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith('https://api.resend.com/')) {
    mails.push({ headers: init.headers, body: JSON.parse(init.body) });
    return mailStatus === 200 ? { ok: true, status: 200, text: async () => '{}' } : { ok: false, status: mailStatus, text: async () => 'no' };
  }
  if (dbFail) return { ok: false, status: 500, text: async () => 'db down' };
  if (init.method === 'DELETE') { deletes.push({ url: u, headers: init.headers }); return { ok: true, status: 204, text: async () => '' }; }
  reads++; lastRead = u;
  const last = Number((u.match(/id=gt\.(\d+)/) || [])[1] || 0);
  const limit = Number((u.match(/limit=(\d+)/) || [])[1]);
  return { ok: true, json: async () => table.filter((r) => r.id > last).slice(0, limit) };
};

const row = (id, session, role, content, extra = {}) => ({ id, session, visitor: 'ab12cd34ef56ab12cd34ef56ab12cd34', role, content, page: 'services', input_tokens: role === 'assistant' ? 900 : null, output_tokens: role === 'assistant' ? 40 : null, created_at: new Date(Date.UTC(2026, 10, 1, 4, id)).toISOString(), ...extra });
const reset = () => { table = []; mails = []; deletes = []; mailStatus = 200; dbFail = false; reads = 0; };
async function call(headers = { authorization: 'Bearer a-long-random-cron-secret' }, method = 'GET') {
  let out;
  const res = { setHeader() {}, status(c) { out = { code: c }; return this; }, json(j) { out.body = j; return this; } };
  await handler({ method, headers }, res);
  return out;
}

(async () => {
  // who may run it
  reset(); let r = await call({}); assert.equal(r.code, 401); assert.equal(reads, 0);
  r = await call({ authorization: 'Bearer wrong-secret-of-the-wrong-size' }); assert.equal(r.code, 401);
  r = await call({ authorization: 'Bearer a-long-random-cron-secret' }, 'POST'); assert.equal(r.code, 405);
  const secret = process.env.CRON_SECRET; process.env.CRON_SECRET = 'short';
  r = await call({ authorization: 'Bearer short' }); assert.equal(r.code, 503, 'a weak or missing secret never lets anyone in'); process.env.CRON_SECRET = secret;
  const key = process.env.RESEND_API_KEY; delete process.env.RESEND_API_KEY;
  r = await call(); assert.equal(r.code, 503); assert.equal(deletes.length, 0); process.env.RESEND_API_KEY = key;

  // a week with chats: one email with an Excel file, then those rows are deleted
  reset();
  table = [row(1, 'sess-1', 'user', 'How much for a site?'), row(2, 'sess-1', 'assistant', 'Quoted after a short consultation.'), row(3, 'sess-2', 'user', '=HYPERLINK("http://evil.example")'), row(4, 'sess-2', 'assistant', 'Not sure.')];
  r = await call(); assert.equal(r.code, 200); assert.equal(r.body.messages, 4); assert.equal(r.body.chats, 2);
  assert.equal(mails.length, 1); const m = mails[0].body;
  assert.deepEqual(m.to, ['connect@phaseline.in']); assert.ok(/2 chats/.test(m.subject)); assert.equal(mails[0].headers.Authorization, 'Bearer re_test');
  assert.ok(m.attachments[0].filename.endsWith('.xlsx'));
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(m.attachments[0].content, 'base64'));
  const ws = wb.getWorksheet('Conversations');
  assert.equal(ws.rowCount, 5); assert.equal(ws.getRow(2).getCell(3).value, 'Visitor'); assert.equal(ws.getRow(3).getCell(3).value, 'Phase AI'); assert.equal(ws.getRow(4).getCell(1).value, 2);
  assert.equal(typeof ws.getRow(4).getCell(4).value, 'string', 'a message that looks like a formula stays plain text');
  assert.equal(wb.getWorksheet('Summary').getRow(3).getCell(2).value, 2);
  assert.equal(deletes.length, 1); assert.ok(/id=lte\.4/.test(deletes[0].url) && /created_at=lt\./.test(deletes[0].url), 'only the rows that were sent are deleted');
  assert.ok(!JSON.stringify(m).includes('ab12cd34ef56ab12cd34ef56ab12cd34'), 'the full visitor code is not emailed');

  // email not accepted: nothing is deleted
  reset(); table = [row(1, 's', 'user', 'hi'), row(2, 's', 'assistant', 'hello')]; mailStatus = 422;
  r = await call(); assert.equal(r.code, 500); assert.equal(deletes.length, 0, 'no email, no deletion');

  // database trouble: no email, no deletion
  reset(); dbFail = true; r = await call(); assert.equal(r.code, 500); assert.equal(mails.length, 0); assert.equal(deletes.length, 0);

  // a quiet week: a short email, no file, nothing to delete
  reset(); r = await call(); assert.equal(r.code, 200); assert.equal(mails.length, 1); assert.equal(mails[0].body.attachments, undefined); assert.equal(deletes.length, 0);

  // more than one page of rows
  reset(); for (let i = 1; i <= 2500; i++) table.push(row(i, 's' + Math.ceil(i / 2), i % 2 ? 'user' : 'assistant', 'msg ' + i, { created_at: new Date(Date.UTC(2026, 10, 1)).toISOString() }));
  r = await call(); assert.equal(r.body.messages, 2500); assert.ok(reads >= 3); assert.ok(/id=lte\.2500/.test(deletes[0].url));

  // chats that are still being written (newer than the cutoff) are not requested
  reset(); table = [row(1, 's', 'user', 'x')]; await call();
  const cut = decodeURIComponent((lastRead.match(/created_at=lt.([^&]+)/) || [])[1] || '');
  assert.ok(Date.now() - Date.parse(cut) >= 4.9 * 60 * 1000, 'only rows older than five minutes are taken');
  console.log('weekly report: all checks passed');
})().catch((e) => { console.error('FAILED:', e.stack || e.message); process.exit(1); });
