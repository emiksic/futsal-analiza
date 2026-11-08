-- Izvještaji skripte scripts/semafor_sync.py (provjera i upis sa HNS Semafora).
-- Upisuje skripta tajnim ključem (zaobilazi RLS); čita samo admin u adminu (stranica Utakmice).
create table if not exists public.semafor_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  mode text not null default 'provjera',
  summary text not null,
  lines jsonb not null default '[]'::jsonb
);
alter table public.semafor_log enable row level security;
drop policy if exists "admin čita" on public.semafor_log;
create policy "admin čita" on public.semafor_log for select to authenticated using (public.is_admin());
revoke all on public.semafor_log from anon;
grant select on public.semafor_log to authenticated;
