-- Phase 5: officer workflow. Publication review, officer category correction,
-- internal notes, the priority queue and analytics. Apply after 001-005.
-- No accounts, incidents, notes or statistics are seeded. Safe to re-run.
--
-- Status verification stays in public.admin_change_report_status (migration
-- 001, conflict codes from 003): pending_verification|analysis_failed ->
-- verified|rejected|needs_more_information, verified -> in_progress -> resolved.
-- Every officer mutation here locks the report, checks the expected revision,
-- rechecks the actor's admin role and writes its audit event atomically.

-- One officer projection for the map and the queue, so both stay identical.
create or replace function private.admin_report_page(
  p_dataset text, p_status text, p_active_only boolean, p_category public.threat_category,
  p_priority text, p_from timestamptz, p_to timestamptz, p_limit integer, p_offset integer
)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
begin
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
      and (p_status is null or r.status::text = p_status)
      and (not p_active_only or r.status not in ('rejected', 'resolved'))
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

create or replace function private.require_admin(p_actor_id uuid)
returns void language plpgsql stable set search_path = '' as $$
begin
  -- Nuxt derives the actor from a verified session; this rechecks the role.
  if p_actor_id is null or not exists (
    select 1 from public.profiles where id = p_actor_id and role = 'admin'::public.user_role
  ) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
end;
$$;

-- Same signature and output as migration 005; the body now uses the shared projection.
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
begin
  perform private.require_admin(p_actor_id);
  if p_limit is null or p_limit not between 1 and 1000 or p_offset is null or p_offset not between 0 and 100000
    or p_dataset is null or p_dataset not in ('all', 'real', 'simulation')
    or (p_priority is not null and p_priority not in ('high', 'medium', 'low', 'none'))
    or (p_from is not null and p_to is not null and p_from >= p_to) then
    raise exception using errcode = '22023', message = 'invalid_map_filters';
  end if;
  return private.admin_report_page(p_dataset, p_status::text, false, p_category, p_priority, p_from, p_to, p_limit, p_offset);
end;
$$;

-- Priority queue (PRD G.2). Scope 'active' excludes rejected and resolved reports.
create or replace function public.admin_report_queue(
  p_actor_id uuid,
  p_scope text default 'active',
  p_category public.threat_category default null,
  p_priority text default null,
  p_dataset text default 'all',
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin(p_actor_id);
  if p_scope is null or (p_scope not in ('active', 'all') and p_scope <> all(enum_range(null::public.report_status)::text[]))
    or p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 100000
    or p_dataset is null or p_dataset not in ('all', 'real', 'simulation')
    or (p_priority is not null and p_priority not in ('high', 'medium', 'low', 'none')) then
    raise exception using errcode = '22023', message = 'invalid_queue_filters';
  end if;
  return private.admin_report_page(p_dataset, case when p_scope in ('active', 'all') then null else p_scope end,
    p_scope = 'active', p_category, p_priority, null, null, p_limit, p_offset);
end;
$$;

-- Publish or update the reviewed public summary of a verified real report.
create or replace function public.admin_publish_report(
  p_report_id uuid, p_actor_id uuid, p_expected_revision integer, p_public_summary text
)
returns public.reports language plpgsql security definer set search_path = '' as $$
declare
  v_report public.reports%rowtype;
  v_summary text := btrim(p_public_summary);
  v_action text;
begin
  perform private.require_admin(p_actor_id);
  if p_expected_revision is null or p_expected_revision < 1
    or v_summary is null or char_length(v_summary) not between 10 and 500 then
    raise exception using errcode = '22023', message = 'invalid_publication';
  end if;
  select * into v_report from public.reports where id = p_report_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'report_not_found'; end if;
  if v_report.revision <> p_expected_revision then
    raise exception using errcode = 'PT409', message = 'report_revision_conflict';
  end if;
  if v_report.is_simulation then
    raise exception using errcode = '23514', message = 'simulation_not_publishable';
  end if;
  if v_report.status not in ('verified', 'in_progress', 'resolved') then
    raise exception using errcode = '23514', message = 'publication_not_eligible';
  end if;
  v_action := case when v_report.is_public then 'public_summary_updated' else 'report_published' end;
  update public.reports set
    is_public = true, public_summary = v_summary, published_by = p_actor_id, published_at = clock_timestamp(),
    revision = revision + 1, priority_dirty = true
  where id = p_report_id returning * into v_report;
  -- The audit keeps the exact public wording that was approved.
  insert into public.report_updates (
    report_id, report_revision, actor_type, actor_id, admin_id, action, previous_status, new_status, note
  ) values (
    v_report.id, v_report.revision, 'admin', p_actor_id, p_actor_id, v_action, v_report.status, v_report.status, v_summary
  );
  return v_report;
end;
$$;

-- Withdraw a publication with an internal reason; the summary stays as a draft.
create or replace function public.admin_withdraw_publication(
  p_report_id uuid, p_actor_id uuid, p_expected_revision integer, p_note text
)
returns public.reports language plpgsql security definer set search_path = '' as $$
declare
  v_report public.reports%rowtype;
  v_note text := btrim(p_note);
begin
  perform private.require_admin(p_actor_id);
  if p_expected_revision is null or p_expected_revision < 1 or char_length(v_note) > 2000 then
    raise exception using errcode = '22023', message = 'invalid_withdrawal';
  end if;
  if coalesce(char_length(v_note), 0) < 5 then
    raise exception using errcode = '23514', message = 'withdrawal_note_required';
  end if;
  select * into v_report from public.reports where id = p_report_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'report_not_found'; end if;
  if v_report.revision <> p_expected_revision then
    raise exception using errcode = 'PT409', message = 'report_revision_conflict';
  end if;
  if not v_report.is_public then
    raise exception using errcode = '23514', message = 'report_not_public';
  end if;
  update public.reports set
    is_public = false, published_by = null, published_at = null, revision = revision + 1, priority_dirty = true
  where id = p_report_id returning * into v_report;
  insert into public.report_updates (
    report_id, report_revision, actor_type, actor_id, admin_id, action, previous_status, new_status, note
  ) values (
    v_report.id, v_report.revision, 'admin', p_actor_id, p_actor_id, 'publication_withdrawn', v_report.status, v_report.status, v_note
  );
  return v_report;
end;
$$;

-- Officer classification takes precedence in scoring; null returns to AI/user.
create or replace function public.admin_set_officer_category(
  p_report_id uuid, p_actor_id uuid, p_expected_revision integer,
  p_category public.threat_category, p_note text default null
)
returns public.reports language plpgsql security definer set search_path = '' as $$
declare
  v_report public.reports%rowtype;
  v_note text := nullif(btrim(p_note), '');
begin
  perform private.require_admin(p_actor_id);
  if p_expected_revision is null or p_expected_revision < 1 or char_length(v_note) > 1800 then
    raise exception using errcode = '22023', message = 'invalid_category_correction';
  end if;
  select * into v_report from public.reports where id = p_report_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'report_not_found'; end if;
  if v_report.revision <> p_expected_revision then
    raise exception using errcode = 'PT409', message = 'report_revision_conflict';
  end if;
  if v_report.officer_category is not distinct from p_category then
    raise exception using errcode = '23514', message = 'category_unchanged';
  end if;
  update public.reports set officer_category = p_category, revision = revision + 1, priority_dirty = true
  where id = p_report_id returning * into v_report;
  insert into public.report_updates (
    report_id, report_revision, actor_type, actor_id, admin_id, action, previous_status, new_status, note
  ) values (
    v_report.id, v_report.revision, 'admin', p_actor_id, p_actor_id, 'officer_category_changed',
    v_report.status, v_report.status,
    concat_ws(' · ', 'Kategori petugas: ' || coalesce(private.threat_category_label(p_category), 'dihapus, kembali ke kategori AI atau pelapor'), v_note)
  );
  return v_report;
end;
$$;

-- Internal officer note. It does not change the report or its revision.
create or replace function public.admin_add_report_note(p_report_id uuid, p_actor_id uuid, p_note text)
returns public.report_updates language plpgsql security definer set search_path = '' as $$
declare
  v_report public.reports%rowtype;
  v_note text := btrim(p_note);
  v_event public.report_updates%rowtype;
begin
  perform private.require_admin(p_actor_id);
  if v_note is null or char_length(v_note) not between 5 and 2000 then
    raise exception using errcode = '22023', message = 'invalid_note';
  end if;
  select * into v_report from public.reports where id = p_report_id for share;
  if not found then raise exception using errcode = 'P0002', message = 'report_not_found'; end if;
  insert into public.report_updates (
    report_id, report_revision, actor_type, actor_id, admin_id, action, previous_status, new_status, note
  ) values (
    v_report.id, v_report.revision, 'admin', p_actor_id, p_actor_id, 'admin_note', v_report.status, v_report.status, v_note
  ) returning * into v_event;
  return v_event;
end;
$$;

-- Dashboard and analytics aggregates. The summary describes current state over
-- all time; the three distributions cover reports submitted in the WIB range.
-- Real and simulation data are never mixed.
create or replace function public.admin_analytics(p_actor_id uuid, p_dataset text default 'real', p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (clock_timestamp() at time zone 'Asia/Jakarta')::date;
  v_start date;
  v_from timestamptz;
  v_result jsonb;
begin
  perform private.require_admin(p_actor_id);
  if p_dataset is null or p_dataset not in ('real', 'simulation') or p_days is null or p_days not in (7, 30, 90, 365) then
    raise exception using errcode = '22023', message = 'invalid_analytics_filters';
  end if;
  v_start := v_today - (p_days - 1);
  v_from := v_start::timestamp at time zone 'Asia/Jakarta';

  with scoped as (
    select r.id, r.status, r.created_at, e.category as effective_category, p.priority_level
    from public.reports r
    cross join lateral private.report_effective_category(r.id, r.category, r.officer_category) e
    left join lateral (
      select tp.priority_level from public.threat_priorities tp where tp.report_id = r.id
      order by tp.calculated_at desc, tp.report_revision desc limit 1
    ) p on true
    where r.is_simulation = (p_dataset = 'simulation')
  ), ranged as (
    select * from scoped where created_at >= v_from
  )
  select jsonb_build_object(
    'summary', (select jsonb_build_object(
      'total', count(*),
      'pendingVerification', count(*) filter (where status = 'pending_verification'),
      'analysisFailed', count(*) filter (where status = 'analysis_failed'),
      'needsMoreInformation', count(*) filter (where status = 'needs_more_information'),
      'highPriority', count(*) filter (where status not in ('rejected', 'resolved') and priority_level = 'high'),
      'verified', count(*) filter (where status in ('verified', 'in_progress', 'resolved')),
      'inProgress', count(*) filter (where status = 'in_progress'),
      'resolved', count(*) filter (where status = 'resolved'),
      'rejected', count(*) filter (where status = 'rejected')
    ) from scoped),
    'rangeTotal', (select count(*) from ranged),
    'statusCounts', (select jsonb_agg(jsonb_build_object('status', s.status, 'count', coalesce(c.n, 0)) order by s.ordinal)
      from unnest(enum_range(null::public.report_status)) with ordinality as s(status, ordinal)
      left join (select status, count(*) as n from ranged group by status) c on c.status = s.status),
    'categoryCounts', (select jsonb_agg(jsonb_build_object('category', s.category, 'count', coalesce(c.n, 0)) order by s.ordinal)
      from unnest(enum_range(null::public.threat_category)) with ordinality as s(category, ordinal)
      left join (select effective_category, count(*) as n from ranged group by effective_category) c on c.effective_category = s.category),
    'daily', (select jsonb_agg(jsonb_build_object('date', to_char(d, 'YYYY-MM-DD'), 'count', coalesce(c.n, 0)) order by d)
      from generate_series(v_start::timestamp, v_today::timestamp, interval '1 day') as d
      left join (select (created_at at time zone 'Asia/Jakarta')::date as day, count(*) as n from ranged group by 1) c on c.day = d::date),
    'range', jsonb_build_object('from', to_char(v_start, 'YYYY-MM-DD'), 'to', to_char(v_today, 'YYYY-MM-DD'),
      'days', p_days, 'timezone', 'Asia/Jakarta', 'dataset', p_dataset)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function
  private.admin_report_page(text, text, boolean, public.threat_category, text, timestamptz, timestamptz, integer, integer),
  private.require_admin(uuid)
  from public, anon, authenticated, service_role;
revoke all on function
  public.admin_report_queue(uuid, text, public.threat_category, text, text, integer, integer),
  public.admin_publish_report(uuid, uuid, integer, text),
  public.admin_withdraw_publication(uuid, uuid, integer, text),
  public.admin_set_officer_category(uuid, uuid, integer, public.threat_category, text),
  public.admin_add_report_note(uuid, uuid, text),
  public.admin_analytics(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function
  public.admin_report_queue(uuid, text, public.threat_category, text, text, integer, integer),
  public.admin_publish_report(uuid, uuid, integer, text),
  public.admin_withdraw_publication(uuid, uuid, integer, text),
  public.admin_set_officer_category(uuid, uuid, integer, public.threat_category, text),
  public.admin_add_report_note(uuid, uuid, text),
  public.admin_analytics(uuid, text, integer)
  to service_role;

comment on function public.admin_report_queue(uuid, text, public.threat_category, text, text, integer, integer) is
  'Service-only officer priority queue sharing the officer map projection. Actor is rechecked as admin.';
comment on function public.admin_publish_report(uuid, uuid, integer, text) is
  'Service-only publication of a reviewed summary for a verified real report, with an atomic audit event.';
comment on function public.admin_withdraw_publication(uuid, uuid, integer, text) is
  'Service-only withdrawal of a publication with a required internal reason and an atomic audit event.';
comment on function public.admin_set_officer_category(uuid, uuid, integer, public.threat_category, text) is
  'Service-only officer category correction; it takes precedence in scoring and is audited.';
comment on function public.admin_add_report_note(uuid, uuid, text) is
  'Service-only internal officer note. Never shown to reporters or the public.';
comment on function public.admin_analytics(uuid, text, integer) is
  'Service-only dashboard aggregates. Real and simulation data are separated; ranges use WIB calendar days.';
