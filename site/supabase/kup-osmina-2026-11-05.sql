-- 1/8 finala kupa: raspon dana bez satnice (uto – sri) + privremeni klub za pobjednika Olmissum – Crnica
alter table public.matches add column if not exists date_to timestamptz;
