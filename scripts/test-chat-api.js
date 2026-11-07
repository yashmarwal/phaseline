#!/usr/bin/env node
// Checks Phase AI's server rules with the AI service and the database faked. Run: node scripts/test-chat-api.js
const assert = require('assert');
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.SUPABASE_URL = 'http://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
process.env.PHASE_AI_SALT = 'a-long-random-salt-for-tests';
process.env.PHASE_AI_MODEL = 'claude-sonnet-5-5';   // must be ignored: Haiku only
process.env.PHASE_AI_HOURLY = '3';
process.env.PHASE_AI_DAILY_CAP = '1000';
const handler = require('../api/chat.js');

let aiCalls, aiBody, aiReply, aiStatus, saved, dbCounts, dbFail;
global.fetch = async (url, init = {}) => {
  if (String(url).startsWith('https://api.anthropic.com/')) {
    aiCalls++; aiBody = JSON.parse(init.body);
    if (aiStatus !== 200) return { ok: false, status: aiStatus, text: async () => 'err' };
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: aiReply }], usage: { input_tokens: 900, output_tokens: 40 } }) };
  }
  if (!init.method || init.method === 'GET') return dbFail ? { ok: false, status: 500, headers: { get: () => null } } : { ok: true, headers: { get: () => `0-0/${dbCounts}` } };
  saved.push(JSON.parse(init.body));
  return { ok: true, text: async () => '' };
};

const ok = JSON.stringify({ reply: 'Websites usually take 3 to 4 weeks.', actions: ['process', 'form', 'not_a_real_button'], brief: 'A fabric trader needs a catalogue site.' });
async function run(body, headers = {}) {
  let out;
  const res = { status(c) { out = { code: c }; return this; }, json(j) { out.body = j; return this; } };
  await handler({ method: 'POST', headers: { host: 'phaseline.in', 'x-forwarded-for': '1.2.3.4', ...headers }, body }, res);
  return out;
}
const q = (t) => ({ messages: [{ role: 'user', content: t }], session: 'abcd1234-efgh', page: 'services.html' });
const reset = () => { aiCalls = 0; aiBody = null; aiReply = ok; aiStatus = 200; saved = []; dbCounts = 0; dbFail = false; handler._memory.visitors.clear(); handler._memory.day.length = 0; };

(async () => {
  reset(); let r = await run(q('how long for a website?'));
  assert.equal(r.code, 200); assert.equal(r.body.reply, 'Websites usually take 3 to 4 weeks.');
  assert.deepEqual(r.body.actions, ['process', 'form'], 'only real button ids are passed on');
  assert.ok(r.body.brief.includes('fabric')); assert.equal(r.body.left, 2);
  assert.equal(aiBody.model, 'claude-haiku-5-5'); assert.ok(!('temperature' in aiBody), 'Haiku 5.5 rejects the temperature setting'); assert.ok(aiBody.max_tokens >= 400 && aiBody.max_tokens <= 1000, 'enough room that a reply is never cut off, not unlimited');
  assert.equal(aiBody.system[0].cache_control.type, 'ephemeral', 'rules and facts are cached');
  assert.ok(/FACTS/.test(aiBody.system[0].text) && /Web Presence/.test(aiBody.system[0].text), 'the knowledge file is included');
  assert.equal(saved.length, 1); assert.equal(saved[0].length, 2, 'question and answer are saved');
  assert.ok(/^[0-9a-f]{32}$/.test(saved[0][0].visitor) && !JSON.stringify(saved).includes('1.2.3.4'), 'the visitor address is never stored');
  assert.equal(saved[0][1].output_tokens, 40);
  assert.deepEqual(Object.keys(saved[0][0]).sort(), Object.keys(saved[0][1]).sort(), 'both rows have exactly the same fields: the real database (PostgREST) rejects a mixed batch with "All object keys must match"');

  // limit: 3 per hour (set above), counted per visitor
  reset(); for (let i = 0; i < 3; i++) assert.equal((await run(q('hello ' + i))).code, 200);
  r = await run(q('one more')); assert.equal(r.code, 429); assert.equal(r.body.error, 'limit'); assert.equal(aiCalls, 3, 'no AI call after the limit');
  r = await run(q('someone else'), { 'x-forwarded-for': '9.9.9.9' }); assert.equal(r.code, 200, 'another visitor is not affected');
  reset(); dbCounts = 3; r = await run(q('db says limit reached')); assert.equal(r.code, 429, 'database count is used too');

  // history is trimmed, cleaned and must end with a question
  reset(); const long = 'x'.repeat(2000);
  r = await run({ messages: [{ role: 'assistant', content: 'stray' }, { role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }, { role: 'user', content: long }] });
  assert.equal(r.code, 200); assert.ok(aiBody.messages.every((m, i) => i === 0 ? m.role === 'user' : m.role !== aiBody.messages[i - 1].role), 'roles alternate');
  assert.ok(aiBody.messages[aiBody.messages.length - 1].content.length <= 400, 'long messages are cut');
  reset(); r = await run({ messages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }] }); assert.equal(r.code, 400, 'must end with a visitor message');
  reset(); r = await run({}); assert.equal(r.code, 400);

  // replies: fenced JSON, plain text, and nonsense
  reset(); aiReply = '```json\n{"reply":"Hi there","actions":["whatsapp"],"brief":""}\n```'; r = await run(q('hi?')); assert.equal(r.body.reply, 'Hi there'); assert.deepEqual(r.body.actions, ['whatsapp']);
  reset(); aiReply = 'Plain text answer without JSON.'; r = await run(q('hi?')); assert.equal(r.body.reply, 'Plain text answer without JSON.'); assert.deepEqual(r.body.actions, []);
  reset(); aiReply = ''; r = await run(q('hi?')); assert.equal(r.code, 502);

  // a reply cut off in the middle of its JSON must never reach the visitor as raw JSON
  reset(); aiReply = '{"reply":"We do not promise a 1-week delivery. A website takes 3 to 4 weeks.","actions":["whatsapp"'; r = await run(q('1 week?'));
  assert.equal(r.code, 200); assert.equal(r.body.reply, 'We do not promise a 1-week delivery. A website takes 3 to 4 weeks.'); assert.ok(!r.body.reply.includes('{'));
  reset(); aiReply = '{"reply":"Half'; r = await run(q('cut early?')); assert.equal(r.code, 200); assert.equal(r.body.reply, 'Half');
  reset(); aiReply = '{"actions":["form"],"brief":'; r = await run(q('no reply at all?')); assert.equal(r.code, 502, 'broken JSON with no reply is an error, not a visitor-facing message');

  // failures and guards
  reset(); aiStatus = 529; r = await run(q('busy?')); assert.equal(r.code, 429); assert.equal(r.body.error, 'busy');
  reset(); aiStatus = 500; r = await run(q('broken?')); assert.equal(r.code, 502);
  reset(); r = await run(q('hi'), { origin: 'https://evil.example' }); assert.equal(r.code, 403); assert.equal(aiCalls, 0);
  const key = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
  reset(); r = await run(q('no key yet')); assert.equal(r.code, 503); assert.equal(aiCalls, 0, 'without a key nothing is called'); process.env.ANTHROPIC_API_KEY = key;
  // security: salted visitor codes, limits that cannot be skipped, no prices from the AI, visitor address from Vercel headers
  reset(); const salt = process.env.PHASE_AI_SALT; process.env.PHASE_AI_SALT = 'short';
  r = await run(q('hi')); assert.equal(r.code, 503); assert.equal(aiCalls, 0, 'a weak or missing salt refuses to run with a database'); process.env.PHASE_AI_SALT = salt;
  reset(); dbFail = true; r = await run(q('database down')); assert.equal(r.code, 429); assert.equal(aiCalls, 0, 'if the counts cannot be read, no AI call is made');
  for (const bad of ['It costs Rs 50000.', 'About ₹5 lakh.', 'Roughly $2,000.']) {
    reset(); aiReply = JSON.stringify({ reply: bad, actions: [], brief: '' }); r = await run(q('price?'));
    assert.ok(/quoted after a short consultation/.test(r.body.reply) && !/d{3}/.test(r.body.reply), 'a price in an AI reply is replaced: ' + bad); assert.deepEqual(r.body.actions, ['form', 'whatsapp']);
  }
  reset(); aiReply = JSON.stringify({ reply: '30% advance, 40% halfway and 30% before launch.', actions: [], brief: '' }); r = await run(q('payments?')); assert.ok(r.body.reply.startsWith('30%'), 'payment percentages are not blocked');
  reset(); await run(q('a'), { 'x-vercel-forwarded-for': '7.7.7.7', 'x-forwarded-for': '1.1.1.1' }); const v1 = saved[0][0].visitor;
  reset(); await run(q('a'), { 'x-vercel-forwarded-for': '7.7.7.7', 'x-forwarded-for': '2.2.2.2' }); assert.equal(saved[0][0].visitor, v1, 'the Vercel address header decides who the visitor is, not a header the visitor can set');
  console.log('phase ai server: all checks passed');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
