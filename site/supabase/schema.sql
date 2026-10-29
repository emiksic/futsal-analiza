-- Shema baze za futsal stranicu. Pokreni cijelu datoteku u Supabase → SQL Editor.
-- Može se pokrenuti više puta (ne briše podatke).
--
-- Pravila pristupa (RLS):
--  * svi (i neprijavljeni) smiju ČITATI lige, klubove, utakmice...
--  * tablica igrača s punim imenima je zatvorena; javnost vidi samo pogled players_public,
--    gdje je ime već skraćeno prema postavci lige (puno ime / inicijal i prezime / prezime / samo broj)
--  * PISATI smiju samo prijavljeni korisnici čiji je email u tablici admins

-- ---------- tablice ----------
create table if not exists public.leagues (
  id text primary key, name text not null, category text not null,
  zones jsonb not null default '{}', privacy jsonb not null default '{"names":"full","perPlayer":true}', sort int not null default 0);
create table if not exists public.seasons (id text primary key, name text not null);
create table if not exists public.halls (id text primary key, name text not null, city text, calibrated boolean not null default false);
create table if not exists public.clubs (
  id text primary key, name text not null, full_name text, short text, city text, hall text references public.halls(id),
  kit jsonb not null default '{}');
create table if not exists public.comps (
  id text primary key, league text not null references public.leagues(id), season text not null references public.seasons(id),
  teams text[] not null default '{}', rounds int not null default 0);
create table if not exists public.players (
  id text primary key, club text not null references public.clubs(id), season text not null, cat text not null,
  num text, name text, last text, gk boolean not null default false);
create table if not exists public.matches (
  id text primary key, comp text not null references public.comps(id), round int, date timestamptz not null,
  home text not null references public.clubs(id), away text not null references public.clubs(id), hall text references public.halls(id),
  status text not null default 'scheduled', result int[], no_score boolean not null default false, time_tbd boolean not null default false,
  extra boolean not null default false, youtube text, tv text, source text,
  roster jsonb not null default '{"home":null,"away":null}', events jsonb not null default '[]', analysis jsonb,
  updated_at timestamptz not null default now());
create table if not exists public.site (id int primary key default 1 check (id = 1), name text, contact text);
create table if not exists public.admins (email text primary key);

create index if not exists matches_comp_round on public.matches (comp, round);
create index if not exists players_club on public.players (club, season, cat);

-- ---------- tko je admin ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- ---------- prezime i javno ime ----------
create or replace function public.surname_guess(full_name text) returns text
language plpgsql immutable as $$
declare t text[]; i int;
begin
  if full_name is null or btrim(full_name) = '' then return null; end if;
  t := regexp_split_to_array(btrim(full_name), '\s+');
  if array_length(t, 1) < 2 then return t[1]; end if;
  for i in 2 .. array_length(t, 1) loop
    if lower(t[i]) in ('de','da','do','dos','das','del','di','van','von','le','la') then
      return array_to_string(t[i:], ' ');
    end if;
  end loop;
  return t[array_length(t, 1)];
end $$;

create or replace view public.players_public as
select p.id, p.club, p.season, p.cat, p.num, p.gk,
  case coalesce(f.fmt, 'full')
    when 'number' then null
    when 'last' then coalesce(p.last, public.surname_guess(p.name))
    when 'initials' then case when p.name is null or p.name = '' then null
                              else left(btrim(p.name), 1) || '. ' || left(coalesce(p.last, public.surname_guess(p.name)), 1) || '.' end
    when 'initial' then case when p.name is null or p.name = '' then null
                             else left(btrim(p.name), 1) || '. ' || coalesce(p.last, public.surname_guess(p.name)) end
    else p.name
  end as name
from public.players p
left join lateral (select l.privacy ->> 'names' as fmt from public.leagues l where l.category = p.cat order by l.sort limit 1) f on true;

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['leagues','seasons','halls','clubs','comps','players','matches','site','admins'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admin piše" on public.%I', t);
    execute format('create policy "admin piše" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
  -- javno čitanje (bez igrača i admina)
  foreach t in array array['leagues','seasons','halls','clubs','comps','matches','site'] loop
    execute format('drop policy if exists "svi čitaju" on public.%I', t);
    execute format('create policy "svi čitaju" on public.%I for select to anon, authenticated using (true)', t);
    execute format('grant select on public.%I to anon', t);
  end loop;
end $$;

-- pogled s javnim imenima: radi s pravima vlasnika, pa ne otkriva tablicu players
grant select on public.players_public to anon, authenticated;
revoke all on public.players from anon;
revoke all on public.admins from anon;

insert into public.site (id, name, contact) values (1, '', '') on conflict (id) do nothing;

-- ---------- tvoj admin račun ----------
-- 1) Authentication → Users → Add user: tvoj email + lozinka (Auto confirm)
-- 2) ovdje upiši isti email i pokreni samo ovaj red:
-- insert into public.admins (email) values ('TVOJ_EMAIL') on conflict do nothing;

-- ---------- ažuriranje 2026-10-29: zone tablice prema propozicijama ----------
-- update public.leagues set zones = '{"playoff":8,"qual":1,"relegation":1}' where id = '1-hmnl';
-- update public.leagues set zones = '{"direct":2,"playoff":6,"note":"Ispadanje se određuje zbirnom tablicom kadeta i juniora."}' where id in ('juniori','kadeti');
-- kadeti: nakon pusha u adminu → Postavke stranice → "Dodaj što nedostaje"

-- ---------- ažuriranje 2026-10-29: kadeti s inicijalima ----------
-- (pokreni ponovno blok "prezime i javno ime" iznad, pa ovo)
-- update public.leagues set privacy = jsonb_set(privacy, '{names}', '"initials"') where id = 'kadeti';
