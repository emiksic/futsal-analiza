-- ---------- 2026-11-16: glasanje "Tko pobjeđuje?" (bez prijave) ----------
-- Glas = (utakmica, nasumični ID preglednika, 1/X/2). Tablici se ne pristupa izravno:
-- glasa se i čitaju zbrojevi samo preko dvije funkcije, pa se ID-ovi glasača nikad ne vide.
-- Glasa se samo za seniore (SS HMNL i kup; u kupu nema X), od 8 dana prije utakmice dok je status "scheduled"
-- (kad je satnica poznata: do početka utakmice). Glas se ne može promijeniti.
-- Datoteku je sigurno pokrenuti više puta.

create table if not exists public.votes (
  match_id text not null references public.matches(id) on delete cascade,
  voter uuid not null,
  pick text not null check (pick in ('1', 'X', '2')),
  created_at timestamptz not null default now(),
  primary key (match_id, voter));
alter table public.votes enable row level security;   -- bez politika: anon/authenticated ne vide ni ne pišu izravno
revoke all on public.votes from anon, authenticated;

create or replace function public.vote_counts(p_matches text[])
returns table (match_id text, pick text, n int)
language sql stable security definer set search_path = public as $$
  select v.match_id, v.pick, count(*)::int from public.votes v
  where v.match_id = any(p_matches[1:50]) group by 1, 2;
$$;

-- Glas se ne može promijeniti: drugi klik istog glasača ništa ne mijenja. Vraća {"mine": "1"|"X"|"2", "counts": [...]}.
drop function if exists public.cast_vote(text, uuid, text);
create function public.cast_vote(p_match text, p_voter uuid, p_pick text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare m record; v_mine text;
begin
  select x.status, x.date, x.time_tbd, c.league into m
    from public.matches x join public.comps c on c.id = x.comp where x.id = p_match;
  if not found or m.league not in ('1-hmnl', 'kup') then raise exception 'Za ovu utakmicu nema glasanja.'; end if;
  if p_pick not in ('1', 'X', '2') or (m.league = 'kup' and p_pick = 'X') then raise exception 'Neispravan glas.'; end if;
  if m.status <> 'scheduled' or now() < m.date - interval '8 days' or (not m.time_tbd and now() >= m.date) then
    raise exception 'Glasanje za ovu utakmicu je zatvoreno.';
  end if;
  insert into public.votes as v (match_id, voter, pick) values (p_match, p_voter, p_pick)
    on conflict on constraint votes_pkey do nothing;
  select v.pick into v_mine from public.votes v where v.match_id = p_match and v.voter = p_voter;
  return jsonb_build_object('mine', v_mine,
    'counts', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from public.vote_counts(array[p_match]) c));
end $$;

revoke all on function public.vote_counts(text[]) from public;
revoke all on function public.cast_vote(text, uuid, text) from public;
grant execute on function public.vote_counts(text[]) to anon, authenticated;
grant execute on function public.cast_vote(text, uuid, text) to anon, authenticated;
