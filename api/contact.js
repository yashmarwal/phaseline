const { randomInt } = require('crypto');
const { sb } = require('./_db.js');

const TYPES = ['presence', 'catalog', 'commerce', 'care', 'audit'];
const text = (v, max) => String(v ?? '').trim().slice(0, max);

const MIN_FILL_MS = 2000;        // a person needs longer than this to fill the form
const MAX_LINKS = 3;             // enquiries with more links than this are almost always spam
const MAX_PER_EMAIL_PER_HOUR = 3;
const MAX_TOTAL_PER_HOUR = 60;   // protects the database from a flood

// how many enquiries arrived in the last hour (optionally matching a filter); if the check itself fails we let the enquiry through
async function recent(filter = '') {
  try {
    const since = encodeURIComponent(new Date(Date.now() - 3600 * 1000).toISOString());
    const r = await sb(`leads?select=id&created_at=gte.${since}${filter}`, { headers: { Prefer: 'count=exact', Range: '0-0' } });
    const m = (r.headers.get('content-range') || '').match(/\/(\d+)$/);
    return m ? Number(m[1]) : 0;
  } catch (_) {
    return 0;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // only our own pages may post here (a browser always sends Origin on a cross-site post)
  const origin = req.headers.origin;
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch (_) { /* bad origin */ }
    if (host !== req.headers.host) return res.status(403).json({ error: 'Forbidden' });
  }

  const b = req.body || {};
  const quietly = () => res.status(200).json({ ok: true }); // bots get a success reply, so they do not adapt

  if (b.website) return quietly();                                     // hidden field: only bots fill it
  if (!(Number(b.elapsed) >= MIN_FILL_MS)) return quietly();           // sent faster than a person can type

  if (b.consent !== true) return res.status(400).json({ error: 'Consent required' }); // the form sends this only when the box is ticked

  const lead = {
    ref: 'PL-' + randomInt(1000, 10000),
    name: text(b.name, 120),
    company: text(b.company, 160),
    email: text(b.email, 200),
    phone: text(b.phone, 40),
    project_type: TYPES.includes(b.projectType) ? b.projectType : null,
    details: text(b.details, 3800),
  };
  if (!lead.name || !lead.company || !lead.details || !/^\S+@\S+\.\S+$/.test(lead.email) || lead.phone.length < 7) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  const links = (s) => (s.match(/https?:\/\/|www\./gi) || []).length;
  if (links(lead.details) > MAX_LINKS || links(lead.name) + links(lead.company) > 0) return quietly();

  if ((await recent(`&email=eq.${encodeURIComponent(lead.email)}`)) >= MAX_PER_EMAIL_PER_HOUR ||
      (await recent()) >= MAX_TOTAL_PER_HOUR) {
    return res.status(429).json({ error: 'Too many requests. Please WhatsApp or email us.' });
  }

  // the consent is stored with the enquiry: a consent_at column when the table has one, otherwise a note in the details
  const consentAt = new Date().toISOString();
  const save = (row) => sb('leads', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row) });
  let r = await save({ ...lead, consent_at: consentAt });
  if (!r.ok) {
    const err = await r.text();
    if (/consent_at/.test(err)) {
      r = await save({ ...lead, details: `${lead.details}\n\n[Consent: agreed to the Privacy Policy on ${consentAt}]` });
    } else {
      console.error('supabase insert failed', r.status, err);
      return res.status(502).json({ error: 'Could not save' });
    }
  }
  if (!r.ok) {
    console.error('supabase insert failed', r.status, await r.text());
    return res.status(502).json({ error: 'Could not save' });
  }
  res.status(200).json({ ok: true });
};
