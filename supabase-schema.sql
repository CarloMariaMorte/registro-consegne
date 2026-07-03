-- Da incollare ed eseguire una sola volta nell'SQL Editor di Supabase.

create table entries (
  id bigint generated always as identity primary key,
  reparto text not null,
  category text not null,
  text text not null,
  open_by text not null,
  open_at timestamptz not null default now(),
  done boolean not null default false,
  resolved_by text,
  resolved_at timestamptz,
  cc boolean not null default false,
  replies jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table briefings (
  id bigint generated always as identity primary key,
  operator text not null,
  text text not null,
  created_at timestamptz not null default now()
);

-- Attiva la sicurezza a livello di riga (richiesta da Supabase)
alter table entries enable row level security;
alter table briefings enable row level security;

-- Per la v1: chiunque abbia il link puo' leggere e scrivere (nessun login).
-- E' la stessa logica della firma libera che avevamo nell'anteprima.
-- Passaggio consigliato in futuro: sostituire con una vera autenticazione.
create policy "consenti tutto - entries" on entries for all using (true) with check (true);
create policy "consenti tutto - briefings" on briefings for all using (true) with check (true);

-- Abilita gli aggiornamenti in tempo reale (necessario per la sincronizzazione istantanea)
alter publication supabase_realtime add table entries;
alter publication supabase_realtime add table briefings;
