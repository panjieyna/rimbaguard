-- Phase 4: deterministic threat priority v1, neighborhood freshness and bounded
-- map projections. Apply after 001-004. No accounts, incidents or scores are
-- seeded. Safe to re-run: every object is created or replaced idempotently.
--
-- Scoring v1 (also displayed by the application, shared/constants/scoring.ts):
--   total = severity*0.35 + completeness*0.25 + recency*0.20 + nearby*0.20
--   high >= 75, medium >= 45 and < 75, low < 45 (classified on the full value)
-- These are transparent product heuristics for inspection order, not a
-- scientific risk measure and not evidence that an incident occurred.

-- Priority bookkeeping is not a report edit: keep updated_at unchanged when only
-- the freshness columns move, so owners and officers are not told it changed.
create or replace function private.touch_report_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - array['priority_dirty', 'priority_recalculate_at', 'updated_at'])
    = (to_jsonb(old) - array['priority_dirty', 'priority_recalculate_at', 'updated_at']) then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists reports_touch_updated_at on public.reports;
create trigger reports_touch_updated_at before update on public.reports
for each row execute function private.touch_report_updated_at();

create or replace function private.priority_scoring_version()
returns text language sql immutable set search_path = '' as $$
  select 'rimbaguard-priority-v1'::text
$$;

-- PRD E.3 initial product weights, not validated scientific danger levels.
create or replace function private.priority_severity(p_category public.threat_category)
returns numeric language sql immutable set search_path = '' as $$
  select (case p_category
    when 'forest_fire'::public.threat_category then 95
    when 'illegal_logging_suspected'::public.threat_category then 90
    when 'land_clearing'::public.threat_category then 80
    when 'suspicious_human_activity'::public.threat_category then 55
    when 'other_environmental_threat'::public.threat_category then 40
  end)::numeric
$$;

-- Information completeness heuristic, not evidence authenticity:
-- sealed photo 25, description >= 80 trimmed characters 25, valid coordinates 20,
-- valid non-future incident time 20, location name >= 3 trimmed characters 10.
create or replace function private.priority_completeness(
  p_image_path text, p_description text, p_latitude numeric, p_longitude numeric,
  p_incident_time timestamptz, p_location_name text, p_now timestamptz
)
returns numeric language sql immutable set search_path = '' as $$
  select ((case when p_image_path ~ '/sealed/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$' then 25 else 0 end)
    + (case when char_length(btrim(coalesce(p_description, ''))) >= 80 then 25 else 0 end)
    + (case when p_latitude between -90 and 90 and p_longitude between -180 and 180 then 20 else 0 end)
    + (case when p_incident_time is not null and p_incident_time <= p_now then 20 else 0 end)
    + (case when char_length(btrim(coalesce(p_location_name, ''))) >= 3 then 10 else 0 end))::numeric
$$;

-- Age through 6 h -> 100; through 24 h -> 85; through 72 h -> 65;
-- through 168 h -> 40; older -> 20. A future instant has no recency score.
create or replace function private.priority_recency(p_incident_time timestamptz, p_now timestamptz)
returns numeric language sql immutable set search_path = '' as $$
  select (case
    when p_incident_time is null or p_now is null or p_incident_time > p_now then null
    when p_now - p_incident_time <= interval '6 hours' then 100
    when p_now - p_incident_time <= interval '24 hours' then 85
    when p_now - p_incident_time <= interval '72 hours' then 65
    when p_now - p_incident_time <= interval '168 hours' then 40
    else 20
  end)::numeric
$$;

-- The instant after which the stored recency score is no longer current.
create or replace function private.priority_recency_expires_at(p_incident_time timestamptz, p_now timestamptz)
returns timestamptz language sql immutable set search_path = '' as $$
  select case
    when p_incident_time is null or p_now is null or p_incident_time > p_now then null
    when p_now - p_incident_time <= interval '6 hours' then p_incident_time + interval '6 hours'
    when p_now - p_incident_time <= interval '24 hours' then p_incident_time + interval '24 hours'
    when p_now - p_incident_time <= interval '72 hours' then p_incident_time + interval '72 hours'
    when p_now - p_incident_time <= interval '168 hours' then p_incident_time + interval '168 hours'
    else null
  end
$$;

create or replace function private.priority_nearby_score(p_count integer)
returns numeric language sql immutable set search_path = '' as $$
  select (case when p_count >= 3 then 100 when p_count = 2 then 70 when p_count = 1 then 40 else 0 end)::numeric
$$;

create or replace function private.priority_total(
  p_severity numeric, p_completeness numeric, p_recency numeric, p_nearby numeric
)
returns numeric language sql immutable set search_path = '' as $$
  select round(p_severity * 0.35 + p_completeness * 0.25 + p_recency * 0.20 + p_nearby * 0.20, 4)
$$;

create or replace function private.priority_level_for(p_total numeric)
returns public.priority_level language sql immutable set search_path = '' as $$
  select (case when p_total >= 75 then 'high' when p_total >= 45 then 'medium' else 'low' end)::public.priority_level
$$;

-- Haversine great-circle distance with the mean Earth radius (6371.0088 km).
create or replace function private.distance_km(
  p_lat1 numeric, p_lon1 numeric, p_lat2 numeric, p_lon2 numeric
)
returns double precision language sql immutable set search_path = '' as $$
  select 2 * 6371.0088 * asin(least(1.0::double precision, sqrt(
    power(sin(radians((p_lat2 - p_lat1)::double precision) / 2), 2)
    + cos(radians(p_lat1::double precision)) * cos(radians(p_lat2::double precision))
      * power(sin(radians((p_lon2 - p_lon1)::double precision) / 2), 2)
  )))
$$;

-- Status changes also increment reports.revision for concurrency. AI output
-- describes report content, so it stays applicable until the content changes.
-- Phase 5 admin content corrections must add their audit action here.
create or replace function private.report_content_revision(p_report_id uuid)
returns integer language sql stable set search_path = '' as $$
  select coalesce(max(u.report_revision), 1) from public.report_updates u
  where u.report_id = p_report_id and u.action in ('report_created', 'report_corrected')
$$;

-- Officer correction first, then the latest validated non-uncertain AI category
-- for the current content, otherwise the reporter's category. A category is a
-- triage label, never proof of illegality.
create or replace function private.report_effective_category(
  p_report_id uuid, p_category public.threat_category, p_officer_category public.threat_category
)
returns table (category public.threat_category, source text, analysis_id uuid, ai_category text)
language sql stable set search_path = '' as $$
  with ai as (
    select a.id, a.detected_category from public.ai_analyses a
    where a.report_id = p_report_id and a.analysis_status = 'succeeded'
      and a.report_revision >= private.report_content_revision(p_report_id)
    order by a.completed_at desc nulls last, a.created_at desc, a.id desc
    limit 1
  )
  select
    case when p_officer_category is not null then p_officer_category
      when ai.detected_category is not null and ai.detected_category <> 'uncertain' then ai.detected_category::public.threat_category
      else p_category end,
    case when p_officer_category is not null then 'officer'
      when ai.detected_category is not null and ai.detected_category <> 'uncertain' then 'ai'
      else 'user' end,
    ai.id, ai.detected_category
  from (select 1) as base left join ai on true
$$;

-- Corroborating submissions: same data partition (real or simulation), same
-- effective category, within 2 km and within 7 days of the subject's incident
-- time (symmetric, so neighborhoods are reciprocal). Self is always excluded.
-- Nearby reports are not confirmation that an incident is true.
create or replace function private.priority_neighbors(
  p_report_id uuid, p_category public.threat_category, p_latitude numeric, p_longitude numeric,
  p_incident_time timestamptz, p_is_simulation boolean, p_include_rejected boolean
)
returns setof uuid language plpgsql stable set search_path = '' as $$
declare
  v_lat_delta numeric := 2.0 / 110.0;
  v_cos double precision := cos(radians(p_latitude::double precision));
  v_lon_delta numeric;
begin
  v_lon_delta := case when v_cos < 0.02 then 360 else (2.0 / (110.0 * v_cos))::numeric end;
  return query
  select r.id from public.reports r
  where r.id <> p_report_id
    and r.is_simulation = p_is_simulation
    and (p_include_rejected or r.status <> 'rejected'::public.report_status)
    and r.latitude between p_latitude - v_lat_delta and p_latitude + v_lat_delta
    and (v_lon_delta >= 180 or p_longitude - v_lon_delta < -180 or p_longitude + v_lon_delta > 180
      or r.longitude between p_longitude - v_lon_delta and p_longitude + v_lon_delta)
    and r.incident_time between p_incident_time - interval '7 days' and p_incident_time + interval '7 days'
    and private.distance_km(p_latitude, p_longitude, r.latitude, r.longitude) <= 2.0
    and (select e.category from private.report_effective_category(r.id, r.category, r.officer_category) e) = p_category;
end;
$$;

create or replace function private.mark_priority_neighbors(p_report_id uuid, p_key jsonb)
returns integer language plpgsql set search_path = '' as $$
declare
  v_count integer;
begin
  update public.reports r set priority_dirty = true
  where r.id in (
    select n.id from private.priority_neighbors(
      p_report_id, (p_key->>'category')::public.threat_category,
      (p_key->>'latitude')::numeric, (p_key->>'longitude')::numeric,
      (p_key->>'incident_time')::timestamptz, (p_key->>'is_simulation')::boolean, true
    ) as n(id)
  ) and not r.priority_dirty;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function private.threat_category_label(p_category public.threat_category)
returns text language sql immutable set search_path = '' as $$
  select case p_category
    when 'illegal_logging_suspected'::public.threat_category then 'dugaan penebangan liar'
    when 'forest_fire'::public.threat_category then 'kebakaran hutan'
    when 'land_clearing'::public.threat_category then 'pembukaan lahan'
    when 'suspicious_human_activity'::public.threat_category then 'aktivitas manusia mencurigakan'
    when 'other_environmental_threat'::public.threat_category then 'ancaman lingkungan lainnya'
  end
$$;

create or replace function private.priority_explanation(
  p_level public.priority_level, p_total numeric, p_category public.threat_category, p_source text,
  p_severity numeric, p_completeness numeric, p_recency numeric, p_nearby_count integer
)
returns text language sql immutable set search_path = '' as $$
  select format(
    'Prioritas %s (skor %s dari 100) karena kategori %s (%s) memiliki bobot keparahan %s, kelengkapan informasi %s/100, %s, dan %s. Skor ini membantu urutan pemeriksaan, bukan bukti bahwa kejadian benar terjadi.',
    case p_level when 'high' then 'tinggi' when 'medium' then 'sedang' else 'rendah' end,
    replace(trim_scale(p_total)::text, '.', ','),
    private.threat_category_label(p_category),
    case p_source when 'officer' then 'koreksi petugas' when 'ai' then 'hasil analisis AI' else 'pilihan pelapor, sementara' end,
    trim_scale(p_severity)::text,
    trim_scale(p_completeness)::text,
    case p_recency
      when 100 then 'usia kejadian paling lama 6 jam saat dihitung'
      when 85 then 'usia kejadian 6 sampai 24 jam saat dihitung'
      when 65 then 'usia kejadian 1 sampai 3 hari saat dihitung'
      when 40 then 'usia kejadian 3 sampai 7 hari saat dihitung'
      else 'usia kejadian lebih dari 7 hari saat dihitung' end,
    case when p_nearby_count = 0 then 'tidak ada laporan serupa dalam radius 2 km dan rentang 7 hari'
      else format('terdapat %s laporan serupa dalam radius 2 km dan rentang 7 hari', p_nearby_count) end
  )
$$;

-- Calculate a report and append the result when anything changed; an identical
-- result only refreshes the freshness bookkeeping, so history stays meaningful.
-- When the inputs that define a neighborhood changed, mark both the previous and
-- the current neighborhood. Callers hold the refresh advisory lock, so
-- calculations are serialized and a mark cannot be lost.
create or replace function private.compute_report_priority(p_report_id uuid, p_now timestamptz)
returns public.threat_priorities language plpgsql set search_path = '' as $$
declare
  v_report public.reports%rowtype;
  v_effective record;
  v_previous public.threat_priorities%rowtype;
  v_previous_key jsonb;
  v_key jsonb;
  v_snapshot jsonb;
  v_severity numeric;
  v_completeness numeric;
  v_recency numeric;
  v_nearby_count integer;
  v_nearby numeric;
  v_total numeric;
  v_level public.priority_level;
  v_priority public.threat_priorities%rowtype;
begin
  select * into v_report from public.reports where id = p_report_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'report_not_found'; end if;
  if p_now is null or v_report.incident_time > p_now then
    raise exception using errcode = '23514', message = 'incident_time_in_future';
  end if;
  select * into v_previous from public.threat_priorities tp
  where tp.report_id = v_report.id order by tp.calculated_at desc, tp.report_revision desc limit 1;
  v_previous_key := v_previous.input_snapshot -> 'neighborhood';

  select * into v_effective from private.report_effective_category(v_report.id, v_report.category, v_report.officer_category);
  v_severity := private.priority_severity(v_effective.category);
  v_completeness := private.priority_completeness(v_report.image_path, v_report.description,
    v_report.latitude, v_report.longitude, v_report.incident_time, v_report.location_name, p_now);
  v_recency := private.priority_recency(v_report.incident_time, p_now);
  select count(*) into v_nearby_count from private.priority_neighbors(v_report.id, v_effective.category,
    v_report.latitude, v_report.longitude, v_report.incident_time, v_report.is_simulation, false);
  v_nearby := private.priority_nearby_score(v_nearby_count);
  v_total := private.priority_total(v_severity, v_completeness, v_recency, v_nearby);
  v_level := private.priority_level_for(v_total);
  v_key := jsonb_build_object(
    'category', v_effective.category, 'latitude', v_report.latitude, 'longitude', v_report.longitude,
    'incident_time', to_char(v_report.incident_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'is_simulation', v_report.is_simulation, 'counted', v_report.status <> 'rejected'::public.report_status
  );

  v_snapshot := jsonb_build_object(
    'neighborhood', v_key,
    'content_revision', private.report_content_revision(v_report.id),
    'status', v_report.status,
    'user_category', v_report.category,
    'officer_category', v_report.officer_category,
    'ai_analysis_id', v_effective.analysis_id,
    'ai_category', v_effective.ai_category,
    'description_length', char_length(btrim(v_report.description)),
    'location_name_length', char_length(btrim(coalesce(v_report.location_name, ''))),
    'age_seconds', floor(extract(epoch from p_now - v_report.incident_time))::bigint,
    'nearby_radius_km', 2, 'nearby_window_days', 7
  );

  if v_previous.id is not null
    and v_previous.report_revision = v_report.revision
    and v_previous.scoring_version = private.priority_scoring_version()
    and v_previous.effective_category = v_effective.category
    and v_previous.category_source = v_effective.source
    and v_previous.threat_severity = v_severity
    and v_previous.evidence_completeness = v_completeness
    and v_previous.recency_score = v_recency
    and v_previous.nearby_reports_count = v_nearby_count
    and (v_previous.input_snapshot - 'age_seconds') = (v_snapshot - 'age_seconds') then
    v_priority := v_previous;
  else
    insert into public.threat_priorities (
      report_id, report_revision, effective_category, category_source, threat_severity,
      evidence_completeness, recency_score, nearby_reports_score, nearby_reports_count,
      total_score, priority_level, explanation, scoring_version, input_snapshot, calculated_at
    ) values (
      v_report.id, v_report.revision, v_effective.category, v_effective.source, v_severity,
      v_completeness, v_recency, v_nearby, v_nearby_count, v_total, v_level,
      private.priority_explanation(v_level, v_total, v_effective.category, v_effective.source,
        v_severity, v_completeness, v_recency, v_nearby_count),
      private.priority_scoring_version(), v_snapshot, p_now
    ) returning * into v_priority;
  end if;

  update public.reports set
    priority_dirty = false,
    priority_recalculate_at = case when status in ('rejected', 'resolved') then null
      else private.priority_recency_expires_at(incident_time, p_now) end
  where id = v_report.id;

  if v_previous_key is distinct from v_key then
    if (v_key->>'counted')::boolean then perform private.mark_priority_neighbors(v_report.id, v_key); end if;
    if v_previous_key is not null and (v_previous_key->>'counted')::boolean then
      perform private.mark_priority_neighbors(v_report.id, v_previous_key);
    end if;
  end if;
  return v_priority;
end;
$$;

-- Bounded, serialized refresh. Requested reports go first, then reports marked
-- dirty (edits, AI results, status changes, new neighbors, a scoring version
-- change), then reports whose recency boundary passed. Fresh reports are not
-- recalculated. A busy refresh returns immediately so a read never blocks.
create or replace function public.refresh_threat_priorities(
  p_report_ids uuid[] default null, p_limit integer default 50, p_wait boolean default false
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_requested uuid[] := coalesce(p_report_ids, '{}'::uuid[]);
  v_failed_ids uuid[] := '{}'::uuid[];
  v_iterations integer := 0;
  v_previous_timeout text;
  v_now timestamptz;
  v_id uuid;
  v_remaining bigint;
begin
  if p_limit is null or p_limit not between 1 and 500 or p_wait is null
    or cardinality(v_requested) > 100 or array_position(v_requested, null) is not null then
    raise exception using errcode = '22023', message = 'invalid_priority_refresh';
  end if;
  if p_wait then
    v_previous_timeout := current_setting('lock_timeout');
    perform set_config('lock_timeout', '5s', true);
    begin
      perform pg_advisory_xact_lock(4802611150005);
    exception when lock_not_available then
      perform set_config('lock_timeout', v_previous_timeout, true);
      return jsonb_build_object('refreshed', 0, 'failed', 0, 'remaining', null, 'busy', true);
    end;
    perform set_config('lock_timeout', v_previous_timeout, true);
  elsif not pg_try_advisory_xact_lock(4802611150005) then
    return jsonb_build_object('refreshed', 0, 'failed', 0, 'remaining', null, 'busy', true);
  end if;

  v_now := clock_timestamp();
  -- A report marked again by a later neighbor in this batch is picked again;
  -- an unchanged recalculation adds no history. Iterations stay bounded.
  loop
    exit when v_iterations >= p_limit;
    select r.id into v_id from public.reports r
    where (r.priority_dirty or r.priority_recalculate_at < v_now)
      and r.id <> all(v_failed_ids)
    order by (r.id = any(v_requested)) desc, r.priority_dirty desc,
      r.priority_recalculate_at asc nulls first, r.created_at asc, r.id asc
    limit 1;
    exit when not found;
    v_iterations := v_iterations + 1;
    begin
      perform private.compute_report_priority(v_id, v_now);
    exception when others then
      -- The report keeps its stale flag; no report data or text is exposed.
      v_failed_ids := v_failed_ids || v_id;
      raise warning 'rimbaguard_priority_failed state=%', sqlstate;
    end;
  end loop;

  select count(*) into v_remaining from public.reports r
  where r.priority_dirty or r.priority_recalculate_at < v_now;
  return jsonb_build_object('refreshed', v_iterations - cardinality(v_failed_ids),
    'failed', cardinality(v_failed_ids), 'remaining', v_remaining, 'busy', false);
end;
$$;

-- Officer map: every report including private and simulation records, exact
-- coordinates, effective category and the latest calculation with freshness.
create or replace function public.admin_map_reports(
  p_actor_id uuid,
  p_category public.threat_category default null,
  p_priority text default null,
  p_status public.report_status default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_dataset text default 'all',
  p_limit integer default 500,
  p_offset integer default 0
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
begin
  -- Nuxt derives p_actor_id from a verified session; this rechecks the role.
  if p_actor_id is null or not exists (
    select 1 from public.profiles where id = p_actor_id and role = 'admin'::public.user_role
  ) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  if p_limit is null or p_limit not between 1 and 1000 or p_offset is null or p_offset not between 0 and 100000
    or p_dataset is null or p_dataset not in ('all', 'real', 'simulation')
    or (p_priority is not null and p_priority not in ('high', 'medium', 'low', 'none'))
    or (p_from is not null and p_to is not null and p_from >= p_to) then
    raise exception using errcode = '22023', message = 'invalid_map_filters';
  end if;

  with base as (
    select r.id, r.report_code, r.title, r.category, r.status, r.latitude, r.longitude, r.location_name,
      r.incident_time, r.created_at, r.is_simulation, r.is_public, r.description, r.revision,
      r.priority_dirty, r.priority_recalculate_at,
      e.category as effective_category, e.source as category_source,
      p.id as priority_id, p.priority_level, p.total_score, p.calculated_at, p.report_revision as priority_revision
    from public.reports r
    cross join lateral private.report_effective_category(r.id, r.category, r.officer_category) e
    left join lateral (
      select tp.id, tp.priority_level, tp.total_score, tp.calculated_at, tp.report_revision
      from public.threat_priorities tp where tp.report_id = r.id
      order by tp.calculated_at desc, tp.report_revision desc limit 1
    ) p on true
    where (p_dataset = 'all' or (p_dataset = 'real' and not r.is_simulation) or (p_dataset = 'simulation' and r.is_simulation))
      and (p_status is null or r.status = p_status)
      and (p_from is null or r.incident_time >= p_from)
      and (p_to is null or r.incident_time < p_to)
  ), filtered as (
    select * from base
    where (p_category is null or effective_category = p_category)
      and (p_priority is null or (p_priority = 'none' and priority_level is null) or priority_level::text = p_priority)
  ), page as (
    select * from filtered
    order by total_score desc nulls last, incident_time desc, id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'reports', coalesce((select jsonb_agg(jsonb_build_object(
      'id', f.id, 'reportCode', f.report_code, 'title', f.title, 'category', f.category,
      'effectiveCategory', f.effective_category, 'categorySource', f.category_source,
      'status', f.status, 'latitude', f.latitude, 'longitude', f.longitude, 'locationName', f.location_name,
      'incidentTime', f.incident_time, 'createdAt', f.created_at, 'isSimulation', f.is_simulation,
      'isPublic', f.is_public, 'excerpt', left(btrim(f.description), 180),
      'priority', case when f.priority_id is null then null else jsonb_build_object(
        'level', f.priority_level, 'totalScore', f.total_score, 'calculatedAt', f.calculated_at,
        'stale', f.priority_dirty or f.priority_revision <> f.revision
          or coalesce(f.priority_recalculate_at < v_now, false)) end
    ) order by f.total_score desc nulls last, f.incident_time desc, f.id) from page f), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- Public map: only officer-published real reports, an explicit allowlist of
-- reviewed fields and coordinates rounded to 0.01 degree. No identity, exact
-- point, title, description, evidence, AI payload, score components or notes.
create or replace function public.public_map_reports(
  p_category public.threat_category default null,
  p_priority text default null,
  p_status public.report_status default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_report_id uuid default null,
  p_limit integer default 500,
  p_offset integer default 0
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 1000 or p_offset is null or p_offset not between 0 and 100000
    or (p_priority is not null and p_priority not in ('high', 'medium', 'low', 'none'))
    or (p_status is not null and p_status not in ('verified', 'in_progress', 'resolved'))
    or (p_from is not null and p_to is not null and p_from >= p_to) then
    raise exception using errcode = '22023', message = 'invalid_map_filters';
  end if;

  with base as (
    select r.id, r.report_code, coalesce(r.officer_category, r.category) as public_category, r.public_summary,
      round(r.latitude, 2) as approximate_latitude, round(r.longitude, 2) as approximate_longitude,
      r.incident_time, r.published_at, r.status, p.priority_level
    from public.reports r
    left join lateral (
      select tp.priority_level from public.threat_priorities tp where tp.report_id = r.id
      order by tp.calculated_at desc, tp.report_revision desc limit 1
    ) p on true
    where r.is_public and not r.is_simulation
      and r.status in ('verified', 'in_progress', 'resolved')
      and r.public_summary is not null and r.published_at is not null
      and (p_report_id is null or r.id = p_report_id)
      and (p_status is null or r.status = p_status)
      and (p_from is null or r.incident_time >= p_from)
      and (p_to is null or r.incident_time < p_to)
  ), filtered as (
    select * from base
    where (p_category is null or public_category = p_category)
      and (p_priority is null or (p_priority = 'none' and priority_level is null) or priority_level::text = p_priority)
  ), page as (
    select * from filtered order by incident_time desc, id limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'reports', coalesce((select jsonb_agg(jsonb_build_object(
      'id', f.id, 'reportCode', f.report_code, 'category', f.public_category, 'summary', f.public_summary,
      'approximateLatitude', f.approximate_latitude, 'approximateLongitude', f.approximate_longitude,
      'coordinatesAreApproximate', true, 'incidentTime', f.incident_time, 'publishedAt', f.published_at,
      'status', f.status, 'priority', f.priority_level
    ) order by f.incident_time desc, f.id) from page f), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create index if not exists reports_priority_pending_idx on public.reports (created_at) where priority_dirty;

-- Scores are produced only by the deterministic refresh, never written directly.
revoke insert on public.threat_priorities from service_role;

-- New private helpers default to PUBLIC execute; close them explicitly.
revoke all on function
  private.touch_report_updated_at(),
  private.priority_scoring_version(),
  private.priority_severity(public.threat_category),
  private.priority_completeness(text, text, numeric, numeric, timestamptz, text, timestamptz),
  private.priority_recency(timestamptz, timestamptz),
  private.priority_recency_expires_at(timestamptz, timestamptz),
  private.priority_nearby_score(integer),
  private.priority_total(numeric, numeric, numeric, numeric),
  private.priority_level_for(numeric),
  private.distance_km(numeric, numeric, numeric, numeric),
  private.report_content_revision(uuid),
  private.report_effective_category(uuid, public.threat_category, public.threat_category),
  private.priority_neighbors(uuid, public.threat_category, numeric, numeric, timestamptz, boolean, boolean),
  private.mark_priority_neighbors(uuid, jsonb),
  private.threat_category_label(public.threat_category),
  private.priority_explanation(public.priority_level, numeric, public.threat_category, text, numeric, numeric, numeric, integer),
  private.compute_report_priority(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function
  public.refresh_threat_priorities(uuid[], integer, boolean),
  public.admin_map_reports(uuid, public.threat_category, text, public.report_status, timestamptz, timestamptz, text, integer, integer),
  public.public_map_reports(public.threat_category, text, public.report_status, timestamptz, timestamptz, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function
  public.refresh_threat_priorities(uuid[], integer, boolean),
  public.admin_map_reports(uuid, public.threat_category, text, public.report_status, timestamptz, timestamptz, text, integer, integer),
  public.public_map_reports(public.threat_category, text, public.report_status, timestamptz, timestamptz, uuid, integer, integer)
  to service_role;

-- Existing reports and any earlier scoring version must be recalculated.
update public.reports set priority_dirty = true where not priority_dirty;

comment on function public.refresh_threat_priorities(uuid[], integer, boolean) is
  'Service-only bounded refresh of stale threat priorities (scoring v1). Serialized by an advisory lock; returns busy instead of blocking reads.';
comment on function public.admin_map_reports(uuid, public.threat_category, text, public.report_status, timestamptz, timestamptz, text, integer, integer) is
  'Service-only officer map projection. Actor must come from the verified Nuxt session and is rechecked as admin.';
comment on function public.public_map_reports(public.threat_category, text, public.report_status, timestamptz, timestamptz, uuid, integer, integer) is
  'Service-only public map projection: published real reports, allowlisted reviewed fields, coordinates rounded to 0.01 degree.';
