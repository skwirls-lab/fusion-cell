-- Briefs: model-drafted, analyst-edited, versioned.
create table if not exists briefs (
  id                text primary key,
  title             text not null,
  template          text not null check (template in ('daily_summary','threat_assessment','entity_profile')),
  content           jsonb not null,
  markdown          text not null,
  version           integer not null default 1,
  subject_entity_id text references entities(id),
  topic             text not null default '',
  citations         text[] not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists briefs_updated_at_idx on briefs(updated_at);
