// Talks to the Supabase database with the secret key. Server code only: the key never goes to the browser.
// The old service_role key is a JWT (starts with eyJ) and also goes in the Authorization header; the new sb_secret_ keys only use apikey.
const key = () => String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');

const sb = (path, init = {}) =>
  fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key(), ...(key().startsWith('eyJ') && { Authorization: `Bearer ${key()}` }), ...init.headers },
  });

const dbReady = () => Boolean(process.env.SUPABASE_URL && key());

module.exports = { sb, dbReady };
