# Phaseline

Static multi-page site (Tailwind, built at deploy) + one Vercel serverless function (`api/contact.js`) that stores contact-form leads in Supabase.

## Setup
1. Supabase: run `supabase/schema.sql` in the SQL editor.
2. Vercel: import the repo, add env vars `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (see `.env.example`). Build settings come from `vercel.json`.

## Local dev
```bash
npm install
cp .env.example .env   # fill in values
npm run dev            # tailwind --watch + vercel dev
```

## Layout
- `public/` — pages, `site.js` (nav drawer, case-study modal, work filter, contact form). `styles.css` is generated, not committed.
- `src/input.css` — custom styles; `tailwind.config.js` — Stitch design tokens.
- `api/contact.js` — validates and inserts into `leads`.
