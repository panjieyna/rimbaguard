-- RIMBAGUARD: FASE 5 — ALUR KERJA PETUGAS
-- Jalankan SELURUH isi file ini di Supabase SQL Editor -> New query -> Run.
-- Prasyarat: migrasi 001 sampai 005 sudah terpasang (termasuk JALANKAN_FASE_4.sql).
-- Menambah publikasi, koreksi kategori petugas, catatan internal, antrean prioritas, dan analitik.
-- Tidak membuat akun, laporan, catatan, atau statistik nyata.
-- 64 pengujian memakai fixture yang dibatalkan sebelum commit.
-- Hasil sukses: finish menampilkan 1..64 tanpa error.
-- Migrasi ikut dibatalkan jika salah satu pengujian gagal. Aman dijalankan ulang.
-- Sumber: migrations/20261115000600_admin_workflow.sql dan ../tests/database/admin.test.sql.

begin;

-- BAGIAN 1: MIGRASI ALUR KERJA PETUGAS
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


savepoint rimbaguard_admin_checks;

-- BAGIAN 2: PENGUJIAN ROLLBACK
-- Phase 5 verification after migrations 001-006. All fixtures roll back.
-- Fixtures sit between 6.0-6.8 N and 120.0-120.8 E, at least 20 km apart, so
-- they neither corroborate each other nor any retained record. Analytics are
-- checked as differences, so retained data cannot change the expectations.
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to anon,authenticated,service_role;
select extensions.no_plan();

select extensions.ok((select count(*)=7 and bool_and(p.prosecdef and p.proconfig @> array['search_path=""']::text[])
  from pg_proc p where p.oid in (
    'public.admin_map_reports(uuid,public.threat_category,text,public.report_status,timestamptz,timestamptz,text,integer,integer)'::regprocedure,
    'public.admin_report_queue(uuid,text,public.threat_category,text,text,integer,integer)'::regprocedure,
    'public.admin_publish_report(uuid,uuid,integer,text)'::regprocedure,
    'public.admin_withdraw_publication(uuid,uuid,integer,text)'::regprocedure,
    'public.admin_set_officer_category(uuid,uuid,integer,public.threat_category,text)'::regprocedure,
    'public.admin_add_report_note(uuid,uuid,text)'::regprocedure,
    'public.admin_analytics(uuid,text,integer)'::regprocedure)),
  'Officer RPCs are security-definer with an empty search path');
select extensions.ok((select bool_and(has_function_privilege('service_role',signature,'EXECUTE')
  and not has_function_privilege('anon',signature,'EXECUTE') and not has_function_privilege('authenticated',signature,'EXECUTE'))
  from (values ('public.admin_report_queue(uuid,text,public.threat_category,text,text,integer,integer)'),
    ('public.admin_publish_report(uuid,uuid,integer,text)'),('public.admin_withdraw_publication(uuid,uuid,integer,text)'),
    ('public.admin_set_officer_category(uuid,uuid,integer,public.threat_category,text)'),
    ('public.admin_add_report_note(uuid,uuid,text)'),('public.admin_analytics(uuid,text,integer)')) as f(signature)),
  'Only the service role executes officer workflow RPCs');
select extensions.ok(not has_function_privilege('service_role','private.admin_report_page(text,text,boolean,public.threat_category,text,timestamptz,timestamptz,integer,integer)','EXECUTE')
  and not has_function_privilege('service_role','private.require_admin(uuid)','EXECUTE'),
  'Officer projection internals are not callable by application roles');

insert into auth.users(id,email,raw_user_meta_data) values
  ('17000000-0000-4000-8000-000000000001','admin-owner@example.invalid','{"full_name":"Admin test owner"}'),
  ('17000000-0000-4000-8000-000000000002','admin-citizen@example.invalid','{"full_name":"Admin test citizen"}'),
  ('17000000-0000-4000-8000-000000000003','admin-officer@example.invalid','{"full_name":"Admin test officer"}');
update public.profiles set role='admin' where id='17000000-0000-4000-8000-000000000003';

create temp table rimba_admin_state(key text primary key,result jsonb);
alter table rimba_admin_state enable row level security;
grant select,insert,update on rimba_admin_state to service_role;
create function pg_temp.rid(p_n integer) returns uuid language sql immutable as $$
  select ('27000000-0000-4000-8000-'||lpad(p_n::text,12,'0'))::uuid
$$;
create function pg_temp.officer() returns uuid language sql immutable as $$ select '17000000-0000-4000-8000-000000000003'::uuid $$;
create function pg_temp.fixture(p_n integer, p_category public.threat_category, p_latitude numeric, p_longitude numeric,
  p_status public.report_status, p_simulation boolean default false) returns uuid language plpgsql as $$
begin
  insert into public.reports(id,user_id,report_code,title,category,description,image_path,latitude,longitude,
    location_name,incident_time,idempotency_key,is_simulation)
  values (pg_temp.rid(p_n),'17000000-0000-4000-8000-000000000001','TEST-ADMIN-'||p_n,'[SIMULASI] Pengujian petugas '||p_n,p_category,
    'Fixture alur petugas yang terisolasi untuk pengujian transaksi; bukan bukti atau laporan kejadian lingkungan nyata.',
    '17000000-0000-4000-8000-000000000001/sealed/'||('37000000-0000-4000-8000-'||lpad(p_n::text,12,'0'))||'.jpg',
    p_latitude,p_longitude,'Lokasi uji petugas',now()-interval '1 hour',('47000000-0000-4000-8000-'||lpad(p_n::text,12,'0'))::uuid,p_simulation);
  if p_status <> 'pending_analysis' then update public.reports set status=p_status where id=pg_temp.rid(p_n); end if;
  return pg_temp.rid(p_n);
end;
$$;
create function pg_temp.events(p_n integer, p_action text) returns bigint language sql stable as $$
  select count(*) from public.report_updates where report_id=pg_temp.rid(p_n) and action=p_action
$$;
create function pg_temp.has_report(p_key text, p_n integer) returns boolean language sql stable as $$
  select exists(select 1 from rimba_admin_state s, jsonb_array_elements(s.result->'reports') as e(item)
    where s.key=p_key and e.item->>'id'=pg_temp.rid(p_n)::text)
$$;
create function pg_temp.delta(p_key text, p_path text[]) returns numeric language sql stable as $$
  select (a.result #>> p_path)::numeric - (b.result #>> p_path)::numeric
  from rimba_admin_state a, rimba_admin_state b where a.key=p_key||'-after' and b.key=p_key||'-before'
$$;

set local role service_role;
insert into rimba_admin_state values('real-before',public.admin_analytics(pg_temp.officer(),'real',30));
insert into rimba_admin_state values('simulation-before',public.admin_analytics(pg_temp.officer(),'simulation',30));
reset role;

select pg_temp.fixture(1,'forest_fire',6.0,120.0,'pending_verification');
select pg_temp.fixture(2,'land_clearing',6.2,120.2,'analysis_failed');
select pg_temp.fixture(3,'illegal_logging_suspected',6.4,120.4,'pending_verification');
select pg_temp.fixture(4,'other_environmental_threat',6.6,120.6,'pending_verification');
select pg_temp.fixture(5,'forest_fire',6.0,120.0,'verified',true);
select pg_temp.fixture(6,'forest_fire',6.8,120.8,'pending_verification');

set local role service_role;
-- Every officer RPC rechecks the actor's role in the database.
select extensions.throws_ok($$ select public.admin_report_queue('17000000-0000-4000-8000-000000000002') $$,'42501','admin_required',
  'A citizen actor cannot read the priority queue');
select extensions.throws_ok($$ select public.admin_analytics('17000000-0000-4000-8000-000000000002') $$,'42501','admin_required',
  'A citizen actor cannot read officer analytics');
select extensions.throws_ok($$ select public.admin_publish_report('27000000-0000-4000-8000-000000000001','17000000-0000-4000-8000-000000000002',1,
  'Ringkasan publik pengujian.') $$,'42501','admin_required','A citizen actor cannot publish a report');
select extensions.throws_ok($$ select public.admin_add_report_note('27000000-0000-4000-8000-000000000006','17000000-0000-4000-8000-000000000002',
  'Catatan dari warga') $$,'42501','admin_required','A citizen actor cannot write an internal note');
select extensions.throws_ok($$ select public.admin_change_report_status('27000000-0000-4000-8000-000000000001',
  '17000000-0000-4000-8000-000000000001',1,'verified',null) $$,'42501','admin_required','A reporter cannot verify their own report');

-- Verification, response and resolution, each with an atomic audit event.
select extensions.is((public.admin_change_report_status(pg_temp.rid(1),pg_temp.officer(),1,'verified','Bukti sesuai pemeriksaan awal.')).revision,
  2,'An officer verifies a report awaiting verification');
select extensions.throws_ok($$ select public.admin_change_report_status('27000000-0000-4000-8000-000000000001',
  '17000000-0000-4000-8000-000000000003',1,'in_progress',null) $$,'PT409','report_revision_conflict',
  'A concurrent officer action with a stale revision is rejected');
select extensions.throws_ok($$ select public.admin_change_report_status('27000000-0000-4000-8000-000000000001',
  '17000000-0000-4000-8000-000000000003',2,'resolved',null) $$,'23514','invalid_status_transition',
  'A verified report cannot skip the response stage');
select extensions.is((public.admin_change_report_status(pg_temp.rid(1),pg_temp.officer(),2,'in_progress',null)).status::text,
  'in_progress','A verified report moves to in progress');
select extensions.is((public.admin_change_report_status(pg_temp.rid(1),pg_temp.officer(),3,'resolved','Tim lapangan selesai menangani.')).status::text,
  'resolved','An in-progress report is resolved');
select extensions.throws_ok($$ select public.admin_change_report_status('27000000-0000-4000-8000-000000000001',
  '17000000-0000-4000-8000-000000000003',4,'verified',null) $$,'23514','invalid_status_transition','A resolved report is final');
reset role;
select extensions.ok((select count(*)=3 and bool_and(actor_type='admin' and actor_id=pg_temp.officer() and admin_id=pg_temp.officer())
  and array_agg(new_status::text order by report_revision)=array['verified','in_progress','resolved']
  and array_agg(previous_status::text order by report_revision)=array['pending_verification','verified','in_progress']
  and array_agg(report_revision order by report_revision)=array[2,3,4]
  from public.report_updates where report_id=pg_temp.rid(1) and action='status_changed'),
  'Each status change records the officer, previous and new status, revision and time');
select extensions.ok((select note='Bukti sesuai pemeriksaan awal.' and created_at is not null from public.report_updates
  where report_id=pg_temp.rid(1) and action='status_changed' and new_status='verified'),'Status notes are stored with the event');

set local role service_role;
select extensions.is((public.admin_change_report_status(pg_temp.rid(2),pg_temp.officer(),1,'verified',null)).status::text,
  'verified','An officer can manually review a report after an AI failure');
select extensions.throws_ok($$ select public.admin_change_report_status('27000000-0000-4000-8000-000000000002',
  '17000000-0000-4000-8000-000000000003',2,'rejected','Ditolak setelah verifikasi.') $$,'23514','invalid_status_transition',
  'A verified report cannot be rejected afterwards');
select extensions.throws_ok($$ select public.admin_change_report_status('27000000-0000-4000-8000-000000000003',
  '17000000-0000-4000-8000-000000000003',1,'needs_more_information',null) $$,'23514','verification_note_required',
  'Requesting more information requires a note for the reporter');
select extensions.is((public.admin_change_report_status(pg_temp.rid(3),pg_temp.officer(),1,'needs_more_information','Mohon lampirkan foto yang lebih jelas.')).status::text,
  'needs_more_information','An officer requests more information');
select extensions.is((public.update_owned_report('17000000-0000-4000-8000-000000000001',pg_temp.rid(3),2,
  (select jsonb_build_object('title','[SIMULASI] Pengujian petugas 3 dilengkapi','category',category,'description',description,
    'evidencePath',image_path,'latitude',latitude,'longitude',longitude,
    'incidentTime',to_char(incident_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'locationName',location_name)
   from public.reports where id=pg_temp.rid(3)))).status::text,
  'pending_analysis','The reporter resubmits a correction, which returns the report to analysis');
select extensions.throws_ok($$ select public.admin_change_report_status('27000000-0000-4000-8000-000000000004',
  '17000000-0000-4000-8000-000000000003',1,'rejected',' ') $$,'23514','verification_note_required','Rejection requires a reason');
select extensions.is((public.admin_change_report_status(pg_temp.rid(4),pg_temp.officer(),1,'rejected','Foto tidak menunjukkan kawasan hutan.')).status::text,
  'rejected','An officer rejects a report with a reason');
select extensions.throws_ok($$ select public.admin_change_report_status('27000000-0000-4000-8000-000000000004',
  '17000000-0000-4000-8000-000000000003',2,'resolved',null) $$,'23514','invalid_status_transition',
  'A rejected report can never be treated as resolved');

-- Publication review.
select extensions.throws_ok($$ select public.admin_publish_report('27000000-0000-4000-8000-000000000001',
  '17000000-0000-4000-8000-000000000003',0,'Ringkasan publik pengujian.') $$,'22023','invalid_publication',
  'Publication requires a positive expected revision');
select extensions.throws_ok($$ select public.admin_publish_report('27000000-0000-4000-8000-000000000001',
  '17000000-0000-4000-8000-000000000003',4,'Pendek') $$,'22023','invalid_publication','A public summary needs at least 10 characters');
select extensions.throws_ok($$ select public.admin_publish_report('27000000-0000-4000-8000-000000000004',
  '17000000-0000-4000-8000-000000000003',2,'Ringkasan publik pengujian.') $$,'23514','publication_not_eligible',
  'A rejected report cannot be published');
select extensions.throws_ok($$ select public.admin_publish_report('27000000-0000-4000-8000-000000000005',
  '17000000-0000-4000-8000-000000000003',1,'Ringkasan publik pengujian.') $$,'23514','simulation_not_publishable',
  'Simulation data can never be published');
select extensions.throws_ok($$ select public.admin_publish_report('27000000-0000-4000-8000-000000000001',
  '17000000-0000-4000-8000-000000000003',3,'Ringkasan publik pengujian.') $$,'PT409','report_revision_conflict',
  'Publication with a stale revision is rejected');
select extensions.is((public.admin_publish_report(pg_temp.rid(1),pg_temp.officer(),4,'  Laporan kebakaran telah ditinjau dan ditangani petugas.  ')).revision,
  5,'An officer publishes a reviewed summary of a resolved real report');
insert into rimba_admin_state values('public-published',public.public_map_reports(p_report_id=>pg_temp.rid(1)));
select extensions.is((public.admin_publish_report(pg_temp.rid(1),pg_temp.officer(),5,'Ringkasan publik diperbarui setelah peninjauan.')).public_summary,
  'Ringkasan publik diperbarui setelah peninjauan.','An officer can revise the public summary');
select extensions.throws_ok($$ select public.admin_withdraw_publication('27000000-0000-4000-8000-000000000001',
  '17000000-0000-4000-8000-000000000003',6,null) $$,'23514','withdrawal_note_required','Withdrawing a publication requires a reason');
select extensions.is((public.admin_withdraw_publication(pg_temp.rid(1),pg_temp.officer(),6,'Lokasi perlu ditinjau ulang.')).is_public,
  false,'An officer withdraws a publication');
select extensions.throws_ok($$ select public.admin_withdraw_publication('27000000-0000-4000-8000-000000000001',
  '17000000-0000-4000-8000-000000000003',7,'Ditarik dua kali.') $$,'23514','report_not_public','An unpublished report cannot be withdrawn');
insert into rimba_admin_state values('public-withdrawn',public.public_map_reports(p_report_id=>pg_temp.rid(1)));
reset role;
select extensions.ok((select (result->>'total')::integer=1 and result->'reports'->0->>'summary'='Laporan kebakaran telah ditinjau dan ditangani petugas.'
  from rimba_admin_state where key='public-published')
  and (select (result->>'total')::integer=0 from rimba_admin_state where key='public-withdrawn'),
  'Publication and withdrawal take effect on the public map immediately');
select extensions.ok(pg_temp.events(1,'report_published')=1 and pg_temp.events(1,'public_summary_updated')=1
  and pg_temp.events(1,'publication_withdrawn')=1
  and (select note='Laporan kebakaran telah ditinjau dan ditangani petugas.' from public.report_updates
    where report_id=pg_temp.rid(1) and action='report_published'),
  'Publication events keep the exact approved wording and withdrawal reason');
select extensions.ok((select not is_public and published_by is null and published_at is null
  and public_summary='Ringkasan publik diperbarui setelah peninjauan.' and revision=7 from public.reports where id=pg_temp.rid(1)),
  'A withdrawn report keeps its summary only as a private draft');

-- An audit failure rolls back the whole officer action.
create function pg_temp.reject_admin_audit() returns trigger language plpgsql as $$
begin
  if new.report_id='27000000-0000-4000-8000-000000000002' and new.action='report_published' then
    raise exception using errcode='23514',message='admin_test_audit_rejected';
  end if;
  return new;
end;
$$;
create trigger rimba_admin_test_audit before insert on public.report_updates for each row execute function pg_temp.reject_admin_audit();
set local role service_role;
select extensions.throws_ok($$ select public.admin_publish_report('27000000-0000-4000-8000-000000000002',
  '17000000-0000-4000-8000-000000000003',2,'Ringkasan publik pengujian rollback.') $$,'23514','admin_test_audit_rejected',
  'A rejected audit event aborts the publication');
reset role;
drop trigger rimba_admin_test_audit on public.report_updates;
select extensions.ok((select not is_public and public_summary is null and revision=2 from public.reports where id=pg_temp.rid(2)),
  'No publication survives a failed audit write');

-- Officer category correction and internal notes.
set local role service_role;
select extensions.throws_ok($$ select public.admin_add_report_note('27000000-0000-4000-8000-000000000006',
  '17000000-0000-4000-8000-000000000003','abc') $$,'22023','invalid_note','Internal notes need at least 5 characters');
insert into rimba_admin_state values('note',to_jsonb(public.admin_add_report_note(pg_temp.rid(6),pg_temp.officer(),'  Koordinasikan dengan tim patroli.  ')));
select extensions.is((public.admin_set_officer_category(pg_temp.rid(6),pg_temp.officer(),1,'land_clearing','Foto menunjukkan pembukaan lahan.')).officer_category::text,
  'land_clearing','An officer corrects the category');
select extensions.throws_ok($$ select public.admin_set_officer_category('27000000-0000-4000-8000-000000000006',
  '17000000-0000-4000-8000-000000000003',2,'land_clearing',null) $$,'23514','category_unchanged','An unchanged category is not re-audited');
insert into rimba_admin_state values('category-refresh',public.refresh_threat_priorities(array[pg_temp.rid(6)],20,true));
reset role;
select extensions.ok((select note='Koordinasikan dengan tim patroli.' and action='admin_note' and report_revision=1
  and new_status='pending_verification' and previous_status='pending_verification' from public.report_updates
  where id=(select (result->>'id')::uuid from rimba_admin_state where key='note'))
  and (select revision=2 from public.reports where id=pg_temp.rid(6)),
  'An internal note is audited without changing the report revision');
select extensions.ok((select effective_category='land_clearing' and category_source='officer' and threat_severity=80 and report_revision=2
  from public.threat_priorities where report_id=pg_temp.rid(6) order by calculated_at desc,report_revision desc limit 1),
  'An officer category correction takes precedence in the next score');
select extensions.ok((select note like 'Kategori petugas: pembukaan lahan%Foto menunjukkan pembukaan lahan.' from public.report_updates
  where report_id=pg_temp.rid(6) and action='officer_category_changed'),'The category correction is audited with its reason');
set local role service_role;
select extensions.is((public.admin_set_officer_category(pg_temp.rid(6),pg_temp.officer(),2,null,null)).officer_category,
  null::public.threat_category,'An officer can clear the correction to return to the AI or reporter category');

-- Priority queue and the shared officer projection.
insert into rimba_admin_state values('refresh',public.refresh_threat_priorities(array[pg_temp.rid(1),pg_temp.rid(2),pg_temp.rid(3),
  pg_temp.rid(4),pg_temp.rid(5),pg_temp.rid(6)],100,true));
insert into rimba_admin_state values('queue-active',public.admin_report_queue(pg_temp.officer(),'active',p_dataset=>'real',p_limit=>100));
insert into rimba_admin_state values('queue-all',public.admin_report_queue(pg_temp.officer(),'all',p_dataset=>'real',p_limit=>100));
insert into rimba_admin_state values('queue-resolved',public.admin_report_queue(pg_temp.officer(),'resolved',p_dataset=>'real',p_limit=>100));
insert into rimba_admin_state values('queue-simulation',public.admin_report_queue(pg_temp.officer(),'all',p_dataset=>'simulation',p_limit=>100));
insert into rimba_admin_state values('map-real',public.admin_map_reports(pg_temp.officer(),p_dataset=>'real'));
select extensions.throws_ok($$ select public.admin_report_queue('17000000-0000-4000-8000-000000000003','bogus') $$,
  '22023','invalid_queue_filters','Queue scopes are validated');
select extensions.throws_ok($$ select public.admin_report_queue('17000000-0000-4000-8000-000000000003','active',p_limit=>101) $$,
  '22023','invalid_queue_filters','Queue pages are bounded');
reset role;
select extensions.ok(pg_temp.has_report('queue-active',6) and pg_temp.has_report('queue-active',3) and pg_temp.has_report('queue-active',2)
  and not pg_temp.has_report('queue-active',1) and not pg_temp.has_report('queue-active',4) and not pg_temp.has_report('queue-active',5),
  'The active queue excludes resolved, rejected and simulation reports when real data is selected');
select extensions.ok(pg_temp.has_report('queue-all',1) and pg_temp.has_report('queue-all',4) and pg_temp.has_report('queue-resolved',1)
  and not pg_temp.has_report('queue-resolved',6) and pg_temp.has_report('queue-simulation',5),
  'The queue can show every status, one status or the simulation dataset');
select extensions.ok((select bool_and(coalesce((current_item->'priority'->>'totalScore')::numeric,-1) <= coalesce((previous_item->'priority'->>'totalScore')::numeric,1000))
  from (select e.item as current_item, lag(e.item) over (order by e.ordinality) as previous_item
    from rimba_admin_state s, jsonb_array_elements(s.result->'reports') with ordinality as e(item,ordinality) where s.key='queue-all') ordered
  where previous_item is not null),'The queue is ordered by priority score, highest first');
select extensions.ok(pg_temp.has_report('map-real',1) and pg_temp.has_report('map-real',6) and not pg_temp.has_report('map-real',5),
  'The officer map keeps its Phase 4 behavior on the shared projection');

-- Analytics match the rows written by this test.
set local role service_role;
insert into rimba_admin_state values('real-after',public.admin_analytics(pg_temp.officer(),'real',30));
insert into rimba_admin_state values('simulation-after',public.admin_analytics(pg_temp.officer(),'simulation',30));
select extensions.throws_ok($$ select public.admin_analytics('17000000-0000-4000-8000-000000000003','all',30) $$,
  '22023','invalid_analytics_filters','Real and simulation analytics are never mixed');
select extensions.throws_ok($$ select public.admin_analytics('17000000-0000-4000-8000-000000000003','real',12) $$,
  '22023','invalid_analytics_filters','Analytics ranges are limited to the offered periods');
reset role;
select extensions.ok(pg_temp.delta('real',array['summary','total'])=5 and pg_temp.delta('real',array['rangeTotal'])=5
  and pg_temp.delta('simulation',array['summary','total'])=1,
  'Totals count real and simulation reports separately');
select extensions.ok(pg_temp.delta('real',array['summary','verified'])=2 and pg_temp.delta('real',array['summary','resolved'])=1
  and pg_temp.delta('real',array['summary','rejected'])=1 and pg_temp.delta('real',array['summary','pendingVerification'])=1
  and pg_temp.delta('real',array['summary','analysisFailed'])=0 and pg_temp.delta('real',array['summary','needsMoreInformation'])=0,
  'Status summaries match the workflow outcome; verified includes in-progress and resolved reports');
select extensions.ok(pg_temp.delta('real',array['summary','highPriority'])=2,
  'High priority counts active reports whose latest score is high');
select extensions.ok((select jsonb_array_length(result->'statusCounts')=8 and jsonb_array_length(result->'categoryCounts')=5
  and jsonb_array_length(result->'daily')=30 and result->'range'->>'timezone'='Asia/Jakarta'
  and result->'daily'->29->>'date'=to_char((clock_timestamp() at time zone 'Asia/Jakarta')::date,'YYYY-MM-DD')
  from rimba_admin_state where key='real-after'),'Every status, category and WIB day is present, including real zeros');
select extensions.ok((select (a.result->'daily'->29->>'count')::integer-(b.result->'daily'->29->>'count')::integer=5
  from rimba_admin_state a, rimba_admin_state b where a.key='real-after' and b.key='real-before'),
  'Reports over time count today''s submissions');
select extensions.ok((select bool_and(case a.item->>'category'
    when 'forest_fire' then 2 when 'land_clearing' then 1 when 'illegal_logging_suspected' then 1
    when 'other_environmental_threat' then 1 else 0 end
    = (a.item->>'count')::integer-(b.item->>'count')::integer)
  from (select e.item,e.ordinality from rimba_admin_state s, jsonb_array_elements(s.result->'categoryCounts') with ordinality as e(item,ordinality) where s.key='real-after') a
  join (select e.item,e.ordinality from rimba_admin_state s, jsonb_array_elements(s.result->'categoryCounts') with ordinality as e(item,ordinality) where s.key='real-before') b
  using (ordinality)),'Category distribution uses the effective category of each report');

-- Browser roles never reach the officer RPCs or protected columns directly.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"17000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select extensions.throws_ok($$ select public.admin_publish_report('27000000-0000-4000-8000-000000000002',
  '17000000-0000-4000-8000-000000000003',2,'Ringkasan publik pengujian.') $$,'42501',null,
  'Even an officer browser session cannot call publication directly');
select extensions.throws_ok($$ select public.admin_analytics('17000000-0000-4000-8000-000000000003') $$,'42501',null,
  'Even an officer browser session cannot read analytics directly');
select set_config('request.jwt.claims','{"sub":"17000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select extensions.throws_ok($$ update public.profiles set role='admin' where id='17000000-0000-4000-8000-000000000002' $$,'42501',null,
  'A citizen cannot escalate their own role');
select extensions.is((select count(*) from public.report_updates where report_id=pg_temp.rid(3)),0::bigint,
  'A citizen cannot read the internal audit trail');
reset role;
select * from extensions.finish(true);


rollback to savepoint rimbaguard_admin_checks;
release savepoint rimbaguard_admin_checks;
commit;
