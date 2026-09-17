-- Fusion Cell initial schema. Mirrors src/lib/db/schema.ts exactly.
-- Hand-written so it is readable and runs on both Supabase and in-process PGlite.

create table if not exists factions (
  id          text primary key,
  name        text not null,
  color       text not null,
  description text not null default ''
);

create table if not exists entities (
  id            text primary key,
  type          text not null check (type in ('person','organization','vessel','location','account','equipment','other')),
  name          text not null,
  aliases       text[] not null default '{}',
  faction_id    text references factions(id),
  description   text not null default '',
  attributes    jsonb not null default '{}'::jsonb,
  confidence    real not null default 0.5,
  lon           real,
  lat           real,
  location_kind text check (location_kind is null or location_kind in ('system','station','gate','moon','city','facility','lane')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists entities_faction_idx on entities(faction_id);
create index if not exists entities_type_idx on entities(type);

create table if not exists relationships (
  id               text primary key,
  source_entity_id text not null references entities(id) on delete cascade,
  target_entity_id text not null references entities(id) on delete cascade,
  type             text not null check (type in ('member_of','communicates_with','pays','owns','commands','located_at','travels_to','meets_with','associated_with')),
  start_at         timestamptz,
  end_at           timestamptz,
  confidence       real not null default 0.5,
  attributes       jsonb not null default '{}'::jsonb
);
create index if not exists relationships_source_idx on relationships(source_entity_id);
create index if not exists relationships_target_idx on relationships(target_entity_id);

create table if not exists reports (
  id                 text primary key,
  report_number      text not null unique,
  type               text not null check (type in ('SIGINT','HUMINT','IMINT','OSINT','FINANCIAL','TRACKING')),
  title              text not null,
  body               text not null,
  source_reliability text not null,
  info_credibility   integer not null,
  reported_at        timestamptz not null,
  event_at           timestamptz,
  marking            text not null default 'EXERCISE – FICTIONAL DATA',
  search_vector      tsvector generated always as (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,''))) stored,
  created_at         timestamptz not null default now()
);
create index if not exists reports_reported_at_idx on reports(reported_at);
create index if not exists reports_type_idx on reports(type);
create index if not exists reports_search_idx on reports using gin(search_vector);

create table if not exists events (
  id          text primary key,
  type        text not null check (type in ('movement','meeting','transaction','communication','sighting','incident')),
  title       text not null,
  description text not null default '',
  lon         real not null,
  lat         real not null,
  occurred_at timestamptz not null,
  confidence  real not null default 0.5,
  faction_id  text references factions(id)
);
create index if not exists events_occurred_at_idx on events(occurred_at);
create index if not exists events_type_idx on events(type);

create table if not exists report_links (
  report_id   text not null references reports(id) on delete cascade,
  object_type text not null check (object_type in ('entity','relationship','event')),
  object_id   text not null,
  excerpt     text not null default '',
  primary key (report_id, object_type, object_id)
);
create index if not exists report_links_object_idx on report_links(object_type, object_id);

create table if not exists event_entities (
  event_id  text not null references events(id) on delete cascade,
  entity_id text not null references entities(id) on delete cascade,
  role      text not null default 'participant',
  primary key (event_id, entity_id)
);
create index if not exists event_entities_entity_idx on event_entities(entity_id);

create table if not exists ingest_jobs (
  id          text primary key,
  raw_text    text not null,
  report_type text not null check (report_type in ('SIGINT','HUMINT','IMINT','OSINT','FINANCIAL','TRACKING')),
  status      text not null default 'pending' check (status in ('pending','reviewed','committed','discarded')),
  extraction  jsonb,
  report_id   text references reports(id),
  created_at  timestamptz not null default now()
);
