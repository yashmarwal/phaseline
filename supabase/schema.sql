create table public.leads (
  id           bigint generated always as identity primary key,
  ref          text not null,
  name         text not null,
  company      text not null,
  email        text not null,
  phone        text not null,
  project_type text check (project_type in ('presence','catalog','commerce','care','audit')),
  details      text not null,
  consent_at   timestamptz,  -- when the person ticked the Privacy Policy box on the contact form
  created_at   timestamptz not null default now()
);

-- RLS on with no policies: only the service-role key (used by api/contact.js) can read/write.
alter table public.leads enable row level security;

-- If the leads table already exists, run this once (the contact form keeps working either way):
--   alter table public.leads add column if not exists consent_at timestamptz;

-- Belt and braces: the public (browser) keys get no access at all, even if a policy is added by mistake later.
revoke all on public.leads from anon, authenticated;
