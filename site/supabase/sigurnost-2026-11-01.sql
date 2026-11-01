-- Sigurnosno ažuriranje 2026-11-01. Pokreni cijelu datoteku u Supabase → SQL Editor. Može se pokrenuti više puta.

-- admin = prijavljeni korisnik s potvrđenim emailom koji je u tablici admins (provjera po ID-ju korisnika, ne samo po tekstu iz tokena)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.admins a join auth.users u on lower(u.email) = lower(a.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null and u.deleted_at is null
      and (u.banned_until is null or u.banned_until < now()));
$$;

-- javni pogled na igrače: kategorija bez lige više ne pokazuje puno ime
create or replace view public.players_public as
select p.id, p.club, p.season, p.cat, p.num, p.gk,
  case coalesce(f.fmt, 'number')   -- kategorija bez lige: ne otkrivaj ime
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
grant select on public.players_public to anon, authenticated;
