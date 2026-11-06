-- Phase AI conversations. Run once in the Supabase SQL editor.
-- api/chat.js saves each question and answer here, and counts a visitor's recent questions here to apply the hourly limit.
-- "visitor" is a one-way code made from the visitor's network address, never the address itself.
create table if not exists public.ai_messages (
  id            bigint generated always as identity primary key,
  session       text,                                   -- groups the messages of one chat
  visitor       text not null,
  role          text not null check (role in ('user', 'assistant')),
  content       text not null,
  page          text,                                   -- the page the visitor was on
  input_tokens  int,                                    -- what the AI call cost, for the spending check
  output_tokens int,
  created_at    timestamptz not null default now()
);
create index if not exists ai_messages_visitor_time on public.ai_messages (visitor, created_at);
create index if not exists ai_messages_time on public.ai_messages (created_at);

-- RLS on with no policies: only the service-role key (used by the server code) can read or write.
alter table public.ai_messages enable row level security;

-- Belt and braces: the public (browser) keys get no access at all, even if a policy is added by mistake later.
revoke all on public.ai_messages from anon, authenticated;

-- Chats are not kept here for long: api/weekly-report.js emails them to the team as an Excel file every Sunday and then deletes them.
