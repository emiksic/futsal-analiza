-- Dnevnik objava na Instagram/Facebook (piše funkcija objavi; služi i za sprječavanje dvostrukih automatskih objava).
create table if not exists public.objave_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  comp text, round int, kind text, auto boolean not null default false,
  targets text[], ok boolean, results jsonb, images int
);
alter table public.objave_log enable row level security;
drop policy if exists "objave_log: admin čita" on public.objave_log;
create policy "objave_log: admin čita" on public.objave_log for select to authenticated using (public.is_admin());
