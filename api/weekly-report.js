// Weekly Phase AI report. Vercel Cron calls this every Sunday (see vercel.json).
// It emails every saved chat to the team as an Excel file, then deletes exactly the rows it sent.
// If the email is not accepted, nothing is deleted, so the chats are simply included next week.
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const config = require('../site.config.json');
const { sb, dbReady } = require('./_db.js');

const PAGE = 1000;
const MAX_ROWS = 50000;
const SETTLE_MS = 5 * 60 * 1000;   // rows newer than this are left for next week, so a chat that is still being saved is never cut in half
const FIELDS = 'id,session,visitor,role,content,page,input_tokens,output_tokens,created_at';
const when = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const day = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });

// only Vercel Cron knows CRON_SECRET; it sends it as "Authorization: Bearer <secret>"
function check(req) {
  const secret = String(process.env.CRON_SECRET || '');
  if (secret.length < 16) return 'unconfigured';
  const got = Buffer.from(String(req.headers.authorization || ''));
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && crypto.timingSafeEqual(got, want) ? 'ok' : 'denied';
}

async function loadRows(cutoff) {
  const rows = [];
  let last = 0;
  while (rows.length < MAX_ROWS) {
    const r = await sb(`ai_messages?select=${FIELDS}&created_at=lt.${cutoff}&id=gt.${last}&order=id.asc&limit=${PAGE}`);
    if (!r.ok) throw new Error(`could not read chats (${r.status})`);
    const part = await r.json();
    rows.push(...part);
    if (part.length < PAGE) break;
    last = part[part.length - 1].id;
  }
  return rows;
}

async function workbook(rows) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Phase AI';
  wb.created = new Date();

  const chatNo = new Map();
  const sheet = wb.addWorksheet('Conversations', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'Chat', key: 'chat', width: 8 },
    { header: 'Time (IST)', key: 'time', width: 20 },
    { header: 'Who', key: 'who', width: 12 },
    { header: 'Message', key: 'msg', width: 90 },
    { header: 'Page', key: 'page', width: 14 },
    { header: 'Visitor', key: 'visitor', width: 12 },
  ];
  rows.forEach((r) => {
    const k = r.session || `visitor-${r.visitor}`;
    if (!chatNo.has(k)) chatNo.set(k, chatNo.size + 1);
    // plain strings only: Excel shows them as text and never runs them as formulas
    sheet.addRow({ chat: chatNo.get(k), time: when.format(new Date(r.created_at)), who: r.role === 'user' ? 'Visitor' : 'Phase AI', msg: String(r.content), page: r.page || '', visitor: String(r.visitor).slice(0, 8) });
  });
  sheet.getRow(1).eachCell((c) => { c.font = { bold: true, color: { argb: 'FF0F1521' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8935A' } }; });
  sheet.eachRow((row, n) => { row.alignment = { vertical: 'top', wrapText: true }; if (n > 1 && row.getCell(3).value === 'Phase AI') row.font = { color: { argb: 'FF555555' } }; });
  sheet.autoFilter = { from: 'A1', to: 'F1' };

  const sum = wb.addWorksheet('Summary');
  sum.columns = [{ width: 30 }, { width: 28 }];
  const visitors = rows.filter((r) => r.role === 'user').length;
  [
    ['From', day.format(new Date(rows[0].created_at))],
    ['To', day.format(new Date(rows[rows.length - 1].created_at))],
    ['Chats', chatNo.size],
    ['Visitor questions answered by the AI', visitors],
    ['AI input tokens', rows.reduce((n, r) => n + (r.input_tokens || 0), 0)],
    ['AI output tokens', rows.reduce((n, r) => n + (r.output_tokens || 0), 0)],
  ].forEach((r) => sum.addRow(r));
  sum.getColumn(1).font = { bold: true };

  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), chats: chatNo.size, questions: visitors };
}

async function send({ subject, text, attachment, idempotency }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotency },
    body: JSON.stringify({
      from: process.env.REPORT_FROM || 'Phase AI <onboarding@resend.dev>',
      to: [process.env.REPORT_TO || config.contactEmail],
      subject,
      text,
      attachments: attachment ? [{ filename: attachment.name, content: attachment.buffer.toString('base64') }] : undefined,
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) throw new Error(`email not accepted (${r.status}) ${(await r.text()).slice(0, 200)}`);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const who = check(req);
  if (who === 'unconfigured') { console.error('CRON_SECRET must be set to 16 or more random characters'); return res.status(503).json({ error: 'unavailable' }); }
  if (who !== 'ok') return res.status(401).json({ error: 'Unauthorized' });
  if (!dbReady() || !process.env.RESEND_API_KEY) { console.error('weekly report needs the database keys and RESEND_API_KEY'); return res.status(503).json({ error: 'unavailable' }); }

  try {
    const cutoff = encodeURIComponent(new Date(Date.now() - SETTLE_MS).toISOString());
    const rows = await loadRows(cutoff);
    const week = day.format(new Date());

    if (!rows.length) {
      await send({ subject: `Phase AI weekly chats: none (${week})`, text: 'No chats reached Phase AI this week.', idempotency: `phase-ai-empty-${week}` });
      return res.status(200).json({ ok: true, messages: 0 });
    }

    const { buffer, chats, questions } = await workbook(rows);
    const first = rows[0], last = rows[rows.length - 1];
    const name = `phase-ai-chats-${new Date(first.created_at).toISOString().slice(0, 10)}-to-${new Date(last.created_at).toISOString().slice(0, 10)}.xlsx`;
    await send({
      subject: `Phase AI weekly chats: ${chats} chat${chats === 1 ? '' : 's'}, ${day.format(new Date(first.created_at))} to ${day.format(new Date(last.created_at))}`,
      text: `${chats} chat${chats === 1 ? '' : 's'} and ${questions} question${questions === 1 ? '' : 's'} answered by the AI. The full conversations are in the attached Excel file.\n\nThese chats have now been deleted from the website database, so this file is the only copy. Keep it private: visitors may have typed personal details.`,
      attachment: { name, buffer },
      idempotency: `phase-ai-${first.id}-${last.id}`,
    });

    // the email was accepted: delete exactly what was sent (older than the cutoff and up to the last id read)
    const d = await sb(`ai_messages?created_at=lt.${cutoff}&id=lte.${last.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    if (!d.ok) { console.error('report sent but chats could not be deleted', d.status, (await d.text()).slice(0, 200)); return res.status(500).json({ error: 'sent but not deleted' }); }
    return res.status(200).json({ ok: true, messages: rows.length, chats });
  } catch (e) {
    console.error('weekly report failed', e && e.message);
    return res.status(500).json({ error: 'failed' });
  }
};
