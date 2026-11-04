-- Sve nadolazeće utakmice (još neodigrane) dobivaju oznaku "termin nije objavljen".
-- Datum ostaje (određuje vikend pet – ned); kad HNS objavi satnicu, u adminu se upiše vrijeme i oznaka nestaje.
update public.matches
set time_tbd = true
where status = 'scheduled' and date >= now();
