-- RimbaGuard AI foundation. Apply to a Supabase project through migrations.
-- No demonstration accounts, incident records, or credentials are seeded.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create type public.user_role as enum ('public', 'admin');
create type public.threat_category as enum (
  'illegal_logging_suspected', 'forest_fire', 'land_clearing',
  'suspicious_human_activity', 'other_environmental_threat'
);
create type public.report_status as enum (
  'pending_analysis', 'analysis_failed', 'pending_verification',
  'needs_more_information', 'verified', 'rejected', 'in_progress', 'resolved'
);
create type public.analysis_status as enum ('pending', 'processing', 'succeeded', 'failed');
create type public.risk_level as enum ('low', 'medium', 'high', 'uncertain');
create type public.priority_level as enum ('low', 'medium', 'high');
create type public.audit_actor_type as enum ('user', 'admin', 'system');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null default '' check (char_length(full_name) <= 120),
  email text not null check (char_length(email) between 3 and 320),
  role public.user_role not null default 'public',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  report_code text not null unique default (
    'RG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  ),
  user_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 5 and 160),
  category public.threat_category not null,
  officer_category public.threat_category,
  description text not null check (char_length(btrim(description)) between 20 and 4000),
  image_path text not null unique,
  latitude numeric(9, 6) not null check (latitude between -90 and 90),
  longitude numeric(10, 6) not null check (longitude between -180 and 180),
  location_name text check (char_length(btrim(location_name)) between 3 and 160),
  incident_time timestamptz not null,
  status public.report_status not null default 'pending_analysis',
  idempotency_key uuid not null,
  revision integer not null default 1 check (revision > 0),
  priority_dirty boolean not null default true,
  priority_recalculate_at timestamptz,
  is_simulation boolean not null default false,
  is_public boolean not null default false,
  public_summary text check (char_length(btrim(public_summary)) between 10 and 500),
  published_by uuid references public.profiles(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  constraint reports_sealed_evidence_path check (
    image_path ~ (
      '^' || user_id::text || '/sealed/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    )
  ),
  constraint reports_publication_requires_review check (
    not is_public or (
      status in ('verified', 'in_progress', 'resolved')
      and not is_simulation
      and public_summary is not null
      and published_by is not null
      and published_at is not null
    )
  )
);

create table public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete restrict,
  report_revision integer not null check (report_revision > 0),
  analysis_status public.analysis_status not null default 'pending',
  detected_category text check (detected_category in (
    'illegal_logging_suspected', 'forest_fire', 'land_clearing',
    'suspicious_human_activity', 'other_environmental_threat', 'uncertain'
  )),
  detected_indicators jsonb check (
    detected_indicators is null or (
      jsonb_typeof(detected_indicators) = 'array'
      and jsonb_array_length(detected_indicators) <= 20
    )
  ),
  visual_observation text check (char_length(visual_observation) <= 2000),
  reasoning_summary text check (char_length(reasoning_summary) <= 2000),
  confidence numeric(5, 4) check (confidence between 0 and 1),
  risk_level public.risk_level,
  recommendation text check (char_length(recommendation) <= 2000),
  needs_human_verification boolean not null default true check (needs_human_verification),
  raw_response jsonb,
  model_name text not null check (char_length(model_name) between 1 and 100),
  prompt_version text not null check (char_length(prompt_version) between 1 and 80),
  error_code text check (char_length(error_code) <= 80),
  processing_expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint analyses_processing_has_lease check (
    analysis_status <> 'processing' or processing_expires_at is not null
  ),
  constraint analyses_terminal_has_completion check (
    analysis_status not in ('succeeded', 'failed') or completed_at is not null
  ),
  constraint analyses_failure_has_code check (
    analysis_status <> 'failed' or error_code is not null
  ),
  constraint analyses_success_has_output check (
    analysis_status <> 'succeeded' or (
      detected_category is not null and detected_indicators is not null
      and visual_observation is not null and reasoning_summary is not null
      and confidence is not null and risk_level is not null
      and recommendation is not null and error_code is null
    )
  )
);

create table public.threat_priorities (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete restrict,
  report_revision integer not null check (report_revision > 0),
  effective_category public.threat_category not null,
  category_source text not null check (category_source in ('user', 'ai', 'officer')),
  threat_severity numeric(6, 3) not null check (threat_severity between 0 and 100),
  evidence_completeness numeric(6, 3) not null check (evidence_completeness between 0 and 100),
  recency_score numeric(6, 3) not null check (recency_score between 0 and 100),
  nearby_reports_score numeric(6, 3) not null check (nearby_reports_score between 0 and 100),
  nearby_reports_count integer not null check (nearby_reports_count >= 0),
  total_score numeric(7, 4) not null check (total_score between 0 and 100),
  priority_level public.priority_level not null,
  explanation text not null check (char_length(btrim(explanation)) between 1 and 2000),
  scoring_version text not null check (char_length(scoring_version) between 1 and 80),
  input_snapshot jsonb not null check (jsonb_typeof(input_snapshot) = 'object'),
  calculated_at timestamptz not null default now(),
  constraint priorities_match_formula check (
    total_score = round(
      threat_severity * 0.35 + evidence_completeness * 0.25
      + recency_score * 0.20 + nearby_reports_score * 0.20, 4
    )
  ),
  constraint priorities_match_threshold check (
    (total_score >= 75 and priority_level = 'high')
    or (total_score >= 45 and total_score < 75 and priority_level = 'medium')
    or (total_score < 45 and priority_level = 'low')
  )
);

create table public.report_updates (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete restrict,
  report_revision integer not null check (report_revision > 0),
  actor_type public.audit_actor_type not null,
  actor_id uuid references public.profiles(id) on delete restrict,
  admin_id uuid references public.profiles(id) on delete restrict,
  action text not null check (char_length(action) between 1 and 80),
  previous_status public.report_status,
  new_status public.report_status not null,
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  constraint audit_actor_matches_type check (
    (actor_type = 'system' and actor_id is null and admin_id is null)
    or (actor_type = 'user' and actor_id is not null and admin_id is null)
    or (actor_type = 'admin' and actor_id is not null and admin_id = actor_id)
  )
);

create table private.rate_limit_windows (
  key text primary key check (char_length(key) between 1 and 200),
  window_start timestamptz not null,
  window_seconds integer not null check (window_seconds between 1 and 86400),
  hits bigint not null check (hits > 0)
);

create index reports_user_created_idx on public.reports (user_id, created_at desc);
create index reports_status_created_idx on public.reports (status, created_at desc);
create index reports_category_incident_idx on public.reports (category, incident_time desc);
create index reports_coordinates_idx on public.reports (latitude, longitude);
create index reports_dirty_priority_idx on public.reports (priority_recalculate_at)
  where priority_dirty or status not in ('resolved', 'rejected');
create index reports_public_map_idx on public.reports (incident_time desc)
  where is_public and not is_simulation;
create index analyses_report_revision_idx on public.ai_analyses (report_id, report_revision, created_at desc);
create unique index analyses_one_active_per_revision_idx on public.ai_analyses (report_id, report_revision)
  where analysis_status in ('pending', 'processing');
create index priorities_report_calculated_idx on public.threat_priorities (report_id, calculated_at desc);
create index priorities_queue_idx on public.threat_priorities (total_score desc, calculated_at desc);
create index report_updates_report_created_idx on public.report_updates (report_id, created_at desc);
create index rate_limit_expiry_idx on private.rate_limit_windows (window_start);

create function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function private.touch_updated_at();
create trigger reports_touch_updated_at before update on public.reports
for each row execute function private.touch_updated_at();

create function private.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Metadata can supply a display name, never an authorization role.
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    new.email,
    'public'::public.user_role
  );
  return new;
end;
$$;

create trigger rimbaguard_auth_user_created after insert on auth.users
for each row execute function private.handle_new_auth_user();

create function private.sync_auth_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger rimbaguard_auth_email_changed after update of email on auth.users
for each row when (old.email is distinct from new.email)
execute function private.sync_auth_email();

create function private.current_user_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'::public.user_role
  );
$$;

create function private.can_read_report(p_report_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.reports r
    where r.id = p_report_id
      and (r.user_id = (select auth.uid()) or private.current_user_is_admin())
  );
$$;

create function private.guard_new_report()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status <> 'pending_analysis'::public.report_status
     or new.revision <> 1 or new.is_public then
    raise exception using errcode = '23514', message = 'invalid_initial_report_state';
  end if;
  if new.incident_time > now() then
    raise exception using errcode = '23514', message = 'incident_time_in_future';
  end if;
  return new;
end;
$$;

create trigger reports_guard_insert before insert on public.reports
for each row execute function private.guard_new_report();

create function private.audit_report_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.report_updates (
    report_id, report_revision, actor_type, actor_id, action, new_status
  ) values (
    new.id, new.revision, 'user', new.user_id, 'report_created', new.status
  );
  return new;
end;
$$;

create trigger reports_audit_created after insert on public.reports
for each row execute function private.audit_report_created();

create function private.prevent_history_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '23514', message = 'history_is_immutable';
end;
$$;

create trigger report_updates_immutable before update or delete on public.report_updates
for each row execute function private.prevent_history_mutation();
create trigger threat_priorities_immutable before update or delete on public.threat_priorities
for each row execute function private.prevent_history_mutation();

create function private.guard_analysis_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '23514', message = 'analysis_history_is_immutable';
  end if;
  if old.analysis_status in ('succeeded', 'failed')
    or new.id is distinct from old.id
    or new.report_id is distinct from old.report_id
    or new.report_revision is distinct from old.report_revision
    or new.created_at is distinct from old.created_at
    or new.model_name is distinct from old.model_name
    or new.prompt_version is distinct from old.prompt_version then
    raise exception using errcode = '23514', message = 'analysis_history_is_immutable';
  end if;
  return new;
end;
$$;

create trigger ai_analyses_guard_history before update or delete on public.ai_analyses
for each row execute function private.guard_analysis_mutation();

alter table public.profiles enable row level security;
alter table public.reports enable row level security;
alter table public.ai_analyses enable row level security;
alter table public.threat_priorities enable row level security;
alter table public.report_updates enable row level security;
alter table private.rate_limit_windows enable row level security;

revoke all on public.profiles, public.reports, public.ai_analyses,
  public.threat_priorities, public.report_updates from public, anon, authenticated, service_role;
revoke all on private.rate_limit_windows from public, anon, authenticated, service_role;

grant select on public.profiles, public.reports, public.threat_priorities,
  public.report_updates to authenticated;
grant select (
  id, report_id, report_revision, analysis_status, detected_category,
  detected_indicators, visual_observation, reasoning_summary, confidence,
  risk_level, recommendation, needs_human_verification, model_name,
  prompt_version, error_code, processing_expires_at, completed_at, created_at
) on public.ai_analyses to authenticated;

-- Business mutations are server-mediated. Browser roles cannot write protected
-- columns even if a future read policy is accidentally broadened.
grant select on public.profiles, public.reports, public.ai_analyses,
  public.threat_priorities, public.report_updates to service_role;
grant update (full_name) on public.profiles to service_role;
grant insert on public.reports, public.ai_analyses, public.threat_priorities to service_role;
grant update on public.ai_analyses to service_role;

create policy profiles_read_own_or_admin on public.profiles
for select to authenticated
using (id = (select auth.uid()) or (select private.current_user_is_admin()));
create policy reports_read_own_or_admin on public.reports
for select to authenticated
using (user_id = (select auth.uid()) or (select private.current_user_is_admin()));
create policy analyses_read_own_or_admin on public.ai_analyses
for select to authenticated using (private.can_read_report(report_id));
create policy priorities_read_own_or_admin on public.threat_priorities
for select to authenticated using (private.can_read_report(report_id));
create policy report_updates_admin_only on public.report_updates
for select to authenticated using ((select private.current_user_is_admin()));

create function public.consume_rate_limit(
  p_key text, p_limit integer, p_window_seconds integer
)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window private.rate_limit_windows%rowtype;
begin
  if p_key is null or char_length(p_key) not between 1 and 200
    or p_limit is null or p_limit not between 1 and 1000000
    or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception using errcode = '22023', message = 'invalid_rate_limit_configuration';
  end if;

  insert into private.rate_limit_windows as windows (key, window_start, window_seconds, hits)
  values (p_key, v_now, p_window_seconds, 1)
  on conflict (key) do update set
    window_start = case
      when windows.window_start + make_interval(secs => windows.window_seconds) <= v_now
      then v_now else windows.window_start end,
    window_seconds = case
      when windows.window_start + make_interval(secs => windows.window_seconds) <= v_now
      then p_window_seconds else windows.window_seconds end,
    hits = case
      when windows.window_start + make_interval(secs => windows.window_seconds) <= v_now
      then 1 else least(windows.hits + 1, 2147483647::bigint) end
  returning * into v_window;

  return query select
    v_window.hits <= p_limit,
    greatest(p_limit::bigint - v_window.hits, 0)::integer,
    case when v_window.hits > p_limit then greatest(1, ceil(extract(epoch from (
      v_window.window_start + make_interval(secs => v_window.window_seconds) - v_now
    )))::integer) else 0 end;
end;
$$;

create function public.admin_change_report_status(
  p_report_id uuid,
  p_actor_id uuid,
  p_expected_revision integer,
  p_new_status public.report_status,
  p_note text default null
)
returns public.reports language plpgsql security definer set search_path = '' as $$
declare
  v_report public.reports%rowtype;
  v_previous_status public.report_status;
begin
  -- Only service_role can execute. Nuxt must derive p_actor_id from a verified
  -- session; this independent role check protects against an API wiring error.
  if p_actor_id is null or not exists (
    select 1 from public.profiles where id = p_actor_id and role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  if p_expected_revision is null or p_expected_revision < 1
    or p_new_status is null or char_length(p_note) > 2000 then
    raise exception using errcode = '22023', message = 'invalid_status_change';
  end if;

  select * into v_report from public.reports where id = p_report_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'report_not_found';
  end if;
  if v_report.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'report_revision_conflict';
  end if;
  if not (
    (v_report.status in ('pending_verification', 'analysis_failed')
      and p_new_status in ('verified', 'rejected', 'needs_more_information'))
    or (v_report.status = 'verified' and p_new_status = 'in_progress')
    or (v_report.status = 'in_progress' and p_new_status = 'resolved')
  ) then
    raise exception using errcode = '23514', message = 'invalid_status_transition';
  end if;
  if p_new_status in ('rejected', 'needs_more_information')
    and coalesce(char_length(btrim(p_note)), 0) < 5 then
    raise exception using errcode = '23514', message = 'verification_note_required';
  end if;

  v_previous_status := v_report.status;
  update public.reports set
    status = p_new_status,
    revision = revision + 1,
    priority_dirty = true,
    is_public = case when p_new_status in ('verified', 'in_progress', 'resolved') then is_public else false end
  where id = p_report_id
  returning * into v_report;

  insert into public.report_updates (
    report_id, report_revision, actor_type, actor_id, admin_id,
    action, previous_status, new_status, note
  ) values (
    p_report_id, v_report.revision, 'admin', p_actor_id, p_actor_id,
    'status_changed', v_previous_status, p_new_status, nullif(btrim(p_note), '')
  );
  return v_report;
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.current_user_is_admin(), private.can_read_report(uuid) to authenticated;
revoke all on function public.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.admin_change_report_status(uuid, uuid, integer, public.report_status, text)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
grant execute on function public.admin_change_report_status(uuid, uuid, integer, public.report_status, text)
  to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-evidence', 'report-evidence', false, 5000000,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
);

-- A restrictive policy also protects this bucket from any broad permissive
-- policy added for unrelated buckets later. The server issues scoped signed
-- URLs; no browser role can list, overwrite, or delete private evidence.
create policy rimbaguard_evidence_server_only on storage.objects
as restrictive for all to anon, authenticated
using (bucket_id <> 'report-evidence')
with check (bucket_id <> 'report-evidence');

comment on column public.reports.image_path is
  'Private report-evidence object path. Only sealed, owner-scoped objects may be attached; never store a signed URL.';
comment on table public.report_updates is
  'Immutable internal audit. Owner-facing history must use an authorized server projection excluding private notes.';
comment on function public.admin_change_report_status(uuid, uuid, integer, public.report_status, text) is
  'Service-only atomic status/audit RPC. Actor must come from the verified Nuxt session. Never expose service credentials.';
