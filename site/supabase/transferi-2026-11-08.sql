-- Transferi: isti igrač u više klubova povezuje se zajedničkim ključem osobe.
-- person = id jednog od povezanih zapisa (zajednički za sve); person = vlastiti id znači "provjereno, nije isti igrač".
alter table public.players add column if not exists person text;

create or replace view public.players_public as
 SELECT p.id,
    p.club,
    p.season,
    p.cat,
    p.num,
    p.gk,
        CASE COALESCE(f.fmt, 'number'::text)
            WHEN 'number'::text THEN NULL::text
            WHEN 'last'::text THEN COALESCE(p.last, surname_guess(p.name))
            WHEN 'initials'::text THEN
            CASE
                WHEN p.name IS NULL OR p.name = ''::text THEN NULL::text
                ELSE (("left"(btrim(p.name), 1) || '. '::text) || "left"(COALESCE(p.last, surname_guess(p.name)), 1)) || '.'::text
            END
            WHEN 'initial'::text THEN
            CASE
                WHEN p.name IS NULL OR p.name = ''::text THEN NULL::text
                ELSE ("left"(btrim(p.name), 1) || '. '::text) || COALESCE(p.last, surname_guess(p.name))
            END
            ELSE p.name
        END AS name,
    p.person
   FROM players p
     LEFT JOIN LATERAL ( SELECT l.privacy ->> 'names'::text AS fmt
           FROM leagues l
          WHERE l.category = p.cat
          ORDER BY l.sort
         LIMIT 1) f ON true;
