-- RIMBAGUARD AI: FASE 3 — PENYIMPANAN ANALISIS AI
-- Jalankan SELURUH isi file ini di Supabase SQL Editor -> New query -> Run.
-- Prasyarat: migrasi 001, 002 dan 003 sudah terpasang.
-- Menambah RPC analisis atomik; tidak membuat akun, laporan, atau hasil AI nyata.
-- 44 pengujian memakai fixture SIMULASI yang dibatalkan sebelum commit.
-- Hasil sukses: finish menampilkan 1..44 tanpa error.
-- Migrasi ikut dibatalkan jika salah satu pengujian gagal. Aman dijalankan ulang.
-- Sumber: migrations/20261114000400_analysis.sql dan ../tests/database/analysis.test.sql.

begin;

-- BAGIAN 1: MIGRASI ANALISIS
-- Phase 3: atomic, server-only analysis attempts and workflow/audit updates.
-- Apply after 001, 002 and 003. No accounts, incidents or AI results are seeded.

create or replace function private.validate_analysis_output(p_output jsonb)
returns jsonb language plpgsql set search_path = '' as $$
begin
  if p_output is null or jsonb_typeof(p_output) <> 'object'
    or not (p_output ?& array['category','detected_indicators','visual_observation','risk_level',
      'confidence','reasoning_summary','recommendation','needs_human_verification']) then
    raise exception using errcode = '22023', message = 'invalid_analysis_output';
  end if;
  if exists (select 1 from jsonb_object_keys(p_output) as k(key) where k.key <> all(array[
    'category','detected_indicators','visual_observation','risk_level','confidence',
    'reasoning_summary','recommendation','needs_human_verification']))
    or jsonb_typeof(p_output->'category') <> 'string'
    or jsonb_typeof(p_output->'risk_level') <> 'string'
    or jsonb_typeof(p_output->'confidence') <> 'number'
    or jsonb_typeof(p_output->'detected_indicators') <> 'array'
    or jsonb_typeof(p_output->'visual_observation') <> 'string'
    or jsonb_typeof(p_output->'reasoning_summary') <> 'string'
    or jsonb_typeof(p_output->'recommendation') <> 'string'
    or p_output->'needs_human_verification' is distinct from 'true'::jsonb then
    raise exception using errcode = '22023', message = 'invalid_analysis_output';
  end if;
  if p_output->>'category' <> all(array['illegal_logging_suspected','forest_fire','land_clearing',
      'suspicious_human_activity','other_environmental_threat','uncertain'])
    or p_output->>'risk_level' <> all(array['high','medium','low','uncertain'])
    or (p_output->>'confidence')::numeric not between 0 and 1
    or jsonb_array_length(p_output->'detected_indicators') > 20
    or char_length(btrim(p_output->>'visual_observation')) not between 1 and 2000
    or char_length(btrim(p_output->>'reasoning_summary')) not between 1 and 2000
    or char_length(btrim(p_output->>'recommendation')) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'invalid_analysis_output';
  end if;
  if exists (select 1 from jsonb_array_elements(p_output->'detected_indicators') as i(value)
    where jsonb_typeof(i.value) <> 'string' or char_length(btrim(i.value #>> '{}')) not between 1 and 100) then
    raise exception using errcode = '22023', message = 'invalid_analysis_output';
  end if;
  return jsonb_build_object(
    'category',p_output->>'category',
    'detected_indicators',coalesce((select jsonb_agg(btrim(i.value #>> '{}') order by i.ordinality)
      from jsonb_array_elements(p_output->'detected_indicators') with ordinality as i(value,ordinality)), '[]'::jsonb),
    'visual_observation',btrim(p_output->>'visual_observation'),
    'risk_level',p_output->>'risk_level','confidence',(p_output->>'confidence')::numeric,
    'reasoning_summary',btrim(p_output->>'reasoning_summary'),
    'recommendation',btrim(p_output->>'recommendation'),'needs_human_verification',true
  );
end;
$$;

-- Called only after the public RPC has locked the report and attempt, checked
-- the actor, and selected an allowlisted safe failure code. No provider text.
create or replace function private.close_analysis_failure(
  p_analysis_id uuid, p_error_code text, p_change_status boolean
)
returns public.ai_analyses language plpgsql set search_path = '' as $$
declare
  v_analysis public.ai_analyses%rowtype;
  v_report public.reports%rowtype;
  v_previous_status public.report_status;
begin
  select * into v_analysis from public.ai_analyses where id=p_analysis_id;
  if not found then raise exception using errcode='P0002',message='analysis_not_found'; end if;
  if v_analysis.analysis_status in ('succeeded','failed') then return v_analysis; end if;
  select * into v_report from public.reports where id=v_analysis.report_id;
  v_previous_status := v_report.status;
  if p_change_status and v_report.revision=v_analysis.report_revision and v_report.status='pending_analysis' then
    update public.reports set status='analysis_failed' where id=v_report.id returning * into v_report;
  end if;
  update public.ai_analyses set analysis_status='failed',error_code=p_error_code,
    processing_expires_at=null,completed_at=clock_timestamp(),
    detected_category=null,detected_indicators=null,visual_observation=null,reasoning_summary=null,
    confidence=null,risk_level=null,recommendation=null,raw_response=null
  where id=v_analysis.id returning * into v_analysis;
  insert into public.report_updates(report_id,report_revision,actor_type,action,previous_status,new_status,note)
  values(v_report.id,v_analysis.report_revision,'system','ai_analysis_failed',v_previous_status,v_report.status,p_error_code);
  return v_analysis;
end;
$$;

create or replace function public.claim_report_analysis(
  p_report_id uuid, p_actor_id uuid, p_expected_revision integer,
  p_model_name text, p_prompt_version text, p_force boolean default false
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_report public.reports%rowtype;
  v_analysis public.ai_analyses%rowtype;
  v_expired public.ai_analyses%rowtype;
  v_admin boolean;
  v_previous_status public.report_status;
  v_now timestamptz;
begin
  if p_actor_id is null or not exists(select 1 from public.profiles where id=p_actor_id) then
    raise exception using errcode='42501',message='analysis_actor_required';
  end if;
  if p_expected_revision is null or p_expected_revision<1 or p_force is null
    or p_model_name is null or char_length(btrim(p_model_name)) not between 1 and 100
    or p_prompt_version is null or char_length(btrim(p_prompt_version)) not between 1 and 80 then
    raise exception using errcode='22023',message='invalid_analysis_request';
  end if;
  select * into v_report from public.reports where id=p_report_id for update;
  if not found then raise exception using errcode='P0002',message='report_not_found'; end if;
  v_admin := exists(select 1 from public.profiles where id=p_actor_id and role='admin');
  if v_report.user_id<>p_actor_id and not v_admin then
    raise exception using errcode='42501',message='analysis_owner_required';
  end if;
  if p_force and not v_admin then raise exception using errcode='42501',message='analysis_force_admin_required'; end if;
  if v_report.revision<>p_expected_revision then
    raise exception using errcode='PT409',message='report_revision_conflict';
  end if;
  if not p_force then
    select * into v_analysis from public.ai_analyses where report_id=v_report.id
      and report_revision=v_report.revision and analysis_status='succeeded'
      order by created_at desc,id desc limit 1;
    if found then return jsonb_build_object('analysis',to_jsonb(v_analysis),'claimed',false); end if;
  end if;
  if v_report.status not in ('pending_analysis','analysis_failed') and not (v_admin and p_force) then
    raise exception using errcode='PT409',message='analysis_not_eligible';
  end if;
  -- Take the lease clock after waiting for the report lock, so a new attempt
  -- receives its full bounded processing interval rather than an old timestamp.
  v_now := clock_timestamp();
  -- A material edit or officer decision increments revision. Obsolete active
  -- attempts can be closed immediately; expired leases never reuse their UUID.
  for v_expired in select * from public.ai_analyses where report_id=v_report.id
    and analysis_status in ('pending','processing')
    and (report_revision<>v_report.revision or coalesce(processing_expires_at,created_at+interval '120 seconds')<=v_now)
    order by created_at,id for update
  loop
    perform private.close_analysis_failure(v_expired.id,
      case when v_expired.report_revision<>v_report.revision then 'AI_STALE_REPORT' else 'AI_INTERRUPTED' end,false);
  end loop;
  select * into v_analysis from public.ai_analyses where report_id=v_report.id
    and report_revision=v_report.revision and analysis_status in ('pending','processing')
    order by created_at desc,id desc limit 1 for update;
  if found then return jsonb_build_object('analysis',to_jsonb(v_analysis),'claimed',false); end if;
  v_previous_status := v_report.status;
  if v_report.status='analysis_failed' then
    update public.reports set status='pending_analysis' where id=v_report.id returning * into v_report;
  end if;
  insert into public.ai_analyses(report_id,report_revision,analysis_status,model_name,prompt_version,processing_expires_at)
  values(v_report.id,v_report.revision,'processing',btrim(p_model_name),btrim(p_prompt_version),v_now+interval '120 seconds')
  returning * into v_analysis;
  insert into public.report_updates(report_id,report_revision,actor_type,actor_id,admin_id,action,previous_status,new_status)
  values(v_report.id,v_report.revision,case when v_admin then 'admin'::public.audit_actor_type else 'user'::public.audit_actor_type end,
    p_actor_id,case when v_admin then p_actor_id else null end,'ai_analysis_requested',v_previous_status,v_report.status);
  return jsonb_build_object('analysis',to_jsonb(v_analysis),'claimed',true);
end;
$$;

create or replace function public.complete_report_analysis(p_analysis_id uuid,p_actor_id uuid,p_output jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_report_id uuid;
  v_report public.reports%rowtype;
  v_analysis public.ai_analyses%rowtype;
  v_output jsonb;
  v_reason text;
  v_previous_status public.report_status;
begin
  select report_id into v_report_id from public.ai_analyses where id=p_analysis_id;
  if not found then raise exception using errcode='P0002',message='analysis_not_found'; end if;
  select * into v_report from public.reports where id=v_report_id for update;
  if p_actor_id is null or (v_report.user_id<>p_actor_id and not exists(
    select 1 from public.profiles where id=p_actor_id and role='admin')) then
    raise exception using errcode='42501',message='analysis_owner_required';
  end if;
  select * into v_analysis from public.ai_analyses where id=p_analysis_id for update;
  if v_analysis.analysis_status='failed' then
    return jsonb_build_object('analysis',to_jsonb(v_analysis),'accepted',false,'reason',v_analysis.error_code);
  end if;
  v_output := private.validate_analysis_output(p_output);
  if v_analysis.analysis_status='succeeded' then
    if v_analysis.raw_response is distinct from v_output then
      raise exception using errcode='PT409',message='analysis_completion_conflict';
    end if;
    return jsonb_build_object('analysis',to_jsonb(v_analysis),'accepted',v_report.revision=v_analysis.report_revision,
      'reason',case when v_report.revision<>v_analysis.report_revision then 'AI_STALE_REPORT' else null end);
  end if;
  if v_analysis.analysis_status<>'processing' then
    raise exception using errcode='PT409',message='analysis_not_processing';
  end if;
  if v_report.revision<>v_analysis.report_revision then v_reason:='AI_STALE_REPORT';
  elsif v_analysis.processing_expires_at<=clock_timestamp() then v_reason:='AI_INTERRUPTED'; end if;
  if v_reason is not null then
    v_analysis:=private.close_analysis_failure(v_analysis.id,v_reason,true);
    return jsonb_build_object('analysis',to_jsonb(v_analysis),'accepted',false,'reason',v_reason);
  end if;
  v_previous_status:=v_report.status;
  update public.ai_analyses set analysis_status='succeeded',detected_category=v_output->>'category',
    detected_indicators=v_output->'detected_indicators',visual_observation=v_output->>'visual_observation',
    reasoning_summary=v_output->>'reasoning_summary',confidence=(v_output->>'confidence')::numeric,
    risk_level=(v_output->>'risk_level')::public.risk_level,recommendation=v_output->>'recommendation',
    needs_human_verification=true,raw_response=v_output,error_code=null,processing_expires_at=null,completed_at=clock_timestamp()
  where id=v_analysis.id returning * into v_analysis;
  update public.reports set status=case when status='pending_analysis' then 'pending_verification'::public.report_status else status end,
    priority_dirty=true,priority_recalculate_at=clock_timestamp()
  where id=v_report.id returning * into v_report;
  insert into public.report_updates(report_id,report_revision,actor_type,action,previous_status,new_status)
  values(v_report.id,v_analysis.report_revision,'system','ai_analysis_succeeded',v_previous_status,v_report.status);
  return jsonb_build_object('analysis',to_jsonb(v_analysis),'accepted',true,'reason',null);
end;
$$;

create or replace function public.fail_report_analysis(p_analysis_id uuid,p_actor_id uuid,p_error_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_report_id uuid;
  v_report public.reports%rowtype;
  v_analysis public.ai_analyses%rowtype;
  v_reason text;
begin
  if p_error_code is null or p_error_code<>all(array[
    'AI_NOT_CONFIGURED','AI_TIMEOUT','AI_QUOTA_EXCEEDED','AI_AUTH_FAILED','AI_MODEL_UNAVAILABLE',
    'AI_PROVIDER_UNAVAILABLE','AI_INVALID_OUTPUT','AI_BLOCKED','AI_EVIDENCE_UNAVAILABLE','AI_INTERRUPTED','AI_STALE_REPORT']) then
    raise exception using errcode='22023',message='invalid_analysis_failure';
  end if;
  select report_id into v_report_id from public.ai_analyses where id=p_analysis_id;
  if not found then raise exception using errcode='P0002',message='analysis_not_found'; end if;
  select * into v_report from public.reports where id=v_report_id for update;
  if p_actor_id is null or (v_report.user_id<>p_actor_id and not exists(
    select 1 from public.profiles where id=p_actor_id and role='admin')) then
    raise exception using errcode='42501',message='analysis_owner_required';
  end if;
  select * into v_analysis from public.ai_analyses where id=p_analysis_id for update;
  if v_analysis.analysis_status='succeeded' then
    return jsonb_build_object('analysis',to_jsonb(v_analysis),'accepted',false,'reason',null);
  end if;
  if v_analysis.analysis_status='failed' then
    if v_analysis.error_code is distinct from p_error_code and v_analysis.error_code not in ('AI_STALE_REPORT','AI_INTERRUPTED') then
      raise exception using errcode='PT409',message='analysis_failure_conflict';
    end if;
    return jsonb_build_object('analysis',to_jsonb(v_analysis),
      'accepted',v_report.revision=v_analysis.report_revision and v_analysis.error_code not in ('AI_STALE_REPORT','AI_INTERRUPTED'),
      'reason',case when v_report.revision<>v_analysis.report_revision then 'AI_STALE_REPORT' else v_analysis.error_code end);
  end if;
  v_reason:=case when v_report.revision<>v_analysis.report_revision then 'AI_STALE_REPORT'
    when coalesce(v_analysis.processing_expires_at,v_analysis.created_at+interval '120 seconds')<=clock_timestamp() then 'AI_INTERRUPTED'
    else p_error_code end;
  v_analysis:=private.close_analysis_failure(v_analysis.id,v_reason,true);
  return jsonb_build_object('analysis',to_jsonb(v_analysis),'accepted',v_reason not in ('AI_STALE_REPORT','AI_INTERRUPTED'),
    'reason',case when v_reason in ('AI_STALE_REPORT','AI_INTERRUPTED') then v_reason else null end);
end;
$$;

-- A server credential cannot bypass the state machine with direct table writes.
revoke insert,update on public.ai_analyses from service_role;
revoke all on function private.validate_analysis_output(jsonb),private.close_analysis_failure(uuid,text,boolean)
  from public,anon,authenticated,service_role;
revoke all on function public.claim_report_analysis(uuid,uuid,integer,text,text,boolean),
  public.complete_report_analysis(uuid,uuid,jsonb),public.fail_report_analysis(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.claim_report_analysis(uuid,uuid,integer,text,text,boolean),
  public.complete_report_analysis(uuid,uuid,jsonb),public.fail_report_analysis(uuid,uuid,text)
  to service_role;

comment on function public.claim_report_analysis(uuid,uuid,integer,text,text,boolean) is
  'Claims one version-bound AI attempt or returns the existing result/lease. Browser callers are denied.';
comment on function public.complete_report_analysis(uuid,uuid,jsonb) is
  'Atomically stores validated AI output and audit. Stale/expired attempts commit a safe failure without altering newer decisions.';


savepoint rimbaguard_analysis_checks;

-- BAGIAN 2: PENGUJIAN ROLLBACK
-- Phase 3 verification after migrations 001-004. All fixtures roll back.
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to anon,authenticated,service_role;
select extensions.no_plan();

select extensions.ok((select count(*)=3 and bool_and(p.prosecdef and p.proconfig @> array['search_path=""']::text[])
  from pg_proc p where p.oid in (
    'public.claim_report_analysis(uuid,uuid,integer,text,text,boolean)'::regprocedure,
    'public.complete_report_analysis(uuid,uuid,jsonb)'::regprocedure,
    'public.fail_report_analysis(uuid,uuid,text)'::regprocedure)),
  'Analysis RPCs are security-definer with an empty search path');
select extensions.ok((select bool_and(has_function_privilege('service_role',signature,'EXECUTE')
  and not has_function_privilege('anon',signature,'EXECUTE')
  and not has_function_privilege('authenticated',signature,'EXECUTE')) from (values
  ('public.claim_report_analysis(uuid,uuid,integer,text,text,boolean)'),
  ('public.complete_report_analysis(uuid,uuid,jsonb)'),('public.fail_report_analysis(uuid,uuid,text)')) as f(signature)),
  'Only the service role executes analysis mutations');
select extensions.ok(not has_table_privilege('service_role','public.ai_analyses','INSERT')
  and not has_table_privilege('service_role','public.ai_analyses','UPDATE'),
  'Even the server credential must use the atomic analysis RPCs');
select extensions.ok(not has_function_privilege('service_role','private.validate_analysis_output(jsonb)','EXECUTE')
  and not has_function_privilege('service_role','private.close_analysis_failure(uuid,text,boolean)','EXECUTE'),
  'Internal validation and failure helpers are not callable by application clients');
select extensions.ok(not has_column_privilege('authenticated','public.ai_analyses','raw_response','SELECT'),
  'Raw analysis payload remains private');

insert into auth.users(id,email,raw_user_meta_data) values
  ('13000000-0000-4000-8000-000000000001','analysis-owner@example.invalid','{"full_name":"Analysis test owner"}'),
  ('13000000-0000-4000-8000-000000000002','analysis-other@example.invalid','{"full_name":"Analysis test other"}'),
  ('13000000-0000-4000-8000-000000000003','analysis-officer@example.invalid','{"full_name":"Analysis test officer"}');
update public.profiles set role='admin' where id='13000000-0000-4000-8000-000000000003';
insert into public.reports(id,user_id,report_code,title,category,description,image_path,latitude,longitude,incident_time,idempotency_key,is_simulation)
select ('23000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  '13000000-0000-4000-8000-000000000001','TEST-ANALYSIS-'||n,'[SIMULASI] Pengujian analisis '||n,'forest_fire',
  'Fixture analisis AI terisolasi, bukan bukti atau laporan kejadian lingkungan nyata.',
  '13000000-0000-4000-8000-000000000001/sealed/'||('33000000-0000-4000-8000-'||lpad(n::text,12,'0'))||'.jpg',
  -3.8,102.2,'2020-01-01T00:00:00Z',('43000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,true
from generate_series(1,7) as n;
update public.reports set status='pending_verification' where id='23000000-0000-4000-8000-000000000004';
update public.reports set status='verified',revision=2 where id='23000000-0000-4000-8000-000000000005';
update public.reports set status='needs_more_information',revision=2 where id='23000000-0000-4000-8000-000000000006';

create temp table rimba_analysis_test_state(key text primary key,result jsonb);
alter table rimba_analysis_test_state enable row level security;
grant select,insert,update on rimba_analysis_test_state to service_role;
create function pg_temp.analysis_test_id(p_key text) returns uuid language sql stable as $$
  select (result->'analysis'->>'id')::uuid from rimba_analysis_test_state where key=p_key
$$;
create function pg_temp.analysis_test_output() returns jsonb language sql immutable as $$
  select '{"category":"uncertain","detected_indicators":[],"visual_observation":"[SIMULASI] Gambar uji tidak membuktikan kejadian nyata.","risk_level":"uncertain","confidence":0.2,"reasoning_summary":"[SIMULASI] Fixture pengujian kontrak data, bukan analisis lingkungan nyata.","recommendation":"Gunakan verifikasi petugas untuk laporan nyata.","needs_human_verification":true}'::jsonb
$$;

set local role service_role;
select extensions.throws_ok($$ select public.claim_report_analysis('23000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000002',1,'test-only-model','test-v1',false) $$,
  '42501','analysis_owner_required','Another citizen cannot claim private analysis');
select extensions.throws_ok($$ select public.claim_report_analysis('23000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000001',1,'test-only-model','test-v1',true) $$,
  '42501','analysis_force_admin_required','An owner cannot force officer reanalysis');
select extensions.throws_ok($$ select public.claim_report_analysis('23000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000001',2,'test-only-model','test-v1',false) $$,
  'PT409','report_revision_conflict','Stale claim returns a non-retryable HTTP409 conflict');
select extensions.throws_ok($$ select public.claim_report_analysis('23000000-0000-4000-8000-000000000001',
  null,1,'test-only-model','test-v1',false) $$,'42501','analysis_actor_required','An analysis claim requires a trusted actor');
select extensions.throws_ok($$ select public.claim_report_analysis('23000000-0000-4000-8000-000000000006',
  '13000000-0000-4000-8000-000000000001',2,'test-only-model','test-v1',false) $$,
  'PT409','analysis_not_eligible','An information request requires an owner correction before new analysis');
insert into rimba_analysis_test_state values('first',public.claim_report_analysis('23000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000001',1,'test-only-model','test-v1',false));
select extensions.ok((select (result->>'claimed')::boolean and result->'analysis'->>'analysis_status'='processing'
  and result->'analysis'->>'model_name'='test-only-model' and result->'analysis'->>'prompt_version'='test-v1'
  and (result->'analysis'->>'processing_expires_at')::timestamptz>clock_timestamp()
  and (result->'analysis'->>'processing_expires_at')::timestamptz<=clock_timestamp()+interval '120 seconds'
  from rimba_analysis_test_state where key='first'),'Claim persists a bounded versioned processing lease');
insert into rimba_analysis_test_state values('busy',public.claim_report_analysis('23000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000001',1,'different-model','different-prompt',false));
select extensions.ok((select not (result->>'claimed')::boolean from rimba_analysis_test_state where key='busy')
  and pg_temp.analysis_test_id('busy')=pg_temp.analysis_test_id('first')
  and (select count(*)=1 from public.ai_analyses where report_id='23000000-0000-4000-8000-000000000001')
  and (select count(*)=2 from public.report_updates where report_id='23000000-0000-4000-8000-000000000001'),
  'Duplicate active claims return the same attempt without duplicate audit or provider work');
select extensions.ok(not (public.claim_report_analysis('23000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000003',1,'test-only-model','test-v1',true)->>'claimed')::boolean,
  'Even an admin force cannot replace an active lease');
select extensions.throws_ok($$ select public.complete_report_analysis(pg_temp.analysis_test_id('first'),
  '13000000-0000-4000-8000-000000000002',pg_temp.analysis_test_output()) $$,
  '42501','analysis_owner_required','Another citizen cannot complete a private attempt');
select extensions.throws_ok($$ select public.complete_report_analysis(pg_temp.analysis_test_id('first'),
  '13000000-0000-4000-8000-000000000001',pg_temp.analysis_test_output()||'{"needs_human_verification":false}') $$,
  '22023','invalid_analysis_output','AI cannot disable mandatory human verification');
select extensions.throws_ok($$ select public.complete_report_analysis(pg_temp.analysis_test_id('first'),
  '13000000-0000-4000-8000-000000000001',pg_temp.analysis_test_output()||'{"confidence":1.1}') $$,
  '22023','invalid_analysis_output','Out-of-range confidence is rejected independently by SQL');
select extensions.throws_ok($$ select public.complete_report_analysis(pg_temp.analysis_test_id('first'),
  '13000000-0000-4000-8000-000000000001',pg_temp.analysis_test_output()||'{"role":"admin"}') $$,
  '22023','invalid_analysis_output','Unexpected provider fields are rejected');
select extensions.throws_ok($$ select public.complete_report_analysis(pg_temp.analysis_test_id('first'),
  '13000000-0000-4000-8000-000000000001',pg_temp.analysis_test_output()||'{"category":"invented"}') $$,
  '22023','invalid_analysis_output','Invented categories are rejected');
select extensions.throws_ok($$ select public.complete_report_analysis(pg_temp.analysis_test_id('first'),
  '13000000-0000-4000-8000-000000000001',pg_temp.analysis_test_output()||'{"detected_indicators":[123]}') $$,
  '22023','invalid_analysis_output','Indicator values must be bounded strings');
select extensions.throws_ok($$ select public.complete_report_analysis(pg_temp.analysis_test_id('first'),
  '13000000-0000-4000-8000-000000000001',pg_temp.analysis_test_output()||jsonb_build_object('recommendation',repeat('x',2001))) $$,
  '22023','invalid_analysis_output','Oversized output text is rejected');
select extensions.ok((select analysis_status='processing' and raw_response is null from public.ai_analyses where id=pg_temp.analysis_test_id('first'))
  and (select status='pending_analysis' and revision=1 from public.reports where id='23000000-0000-4000-8000-000000000001')
  and (select count(*)=2 from public.report_updates where report_id='23000000-0000-4000-8000-000000000001'),
  'Rejected output does not alter attempt, report or audit');
select extensions.throws_ok($$ select public.fail_report_analysis(pg_temp.analysis_test_id('first'),
  '13000000-0000-4000-8000-000000000001','private-provider-error-and-key') $$,
  '22023','invalid_analysis_failure','Raw provider errors cannot enter persisted failure codes');
insert into rimba_analysis_test_state values('failed',public.fail_report_analysis(pg_temp.analysis_test_id('first'),
  '13000000-0000-4000-8000-000000000001','AI_TIMEOUT'));
select extensions.ok((select (result->>'accepted')::boolean and result->'analysis'->>'analysis_status'='failed'
  and result->'analysis'->>'error_code'='AI_TIMEOUT' and result->'analysis'->>'completed_at' is not null
  and result->'analysis'->'raw_response'='null'::jsonb from rimba_analysis_test_state where key='failed')
  and (select status='analysis_failed' and revision=1 from public.reports where id='23000000-0000-4000-8000-000000000001')
  and (select count(*)=3 from public.report_updates where report_id='23000000-0000-4000-8000-000000000001'),
  'Safe failure and analysis_failed status commit with audit while preserving the report revision');
select extensions.ok((public.fail_report_analysis(pg_temp.analysis_test_id('first'),
  '13000000-0000-4000-8000-000000000001','AI_TIMEOUT')->>'accepted')::boolean
  and (select count(*)=3 from public.report_updates where report_id='23000000-0000-4000-8000-000000000001'),
  'Identical failure replay is idempotent');
select extensions.throws_ok($$ select public.fail_report_analysis(pg_temp.analysis_test_id('first'),
  '13000000-0000-4000-8000-000000000001','AI_BLOCKED') $$,
  'PT409','analysis_failure_conflict','Different failure cannot overwrite terminal history');
insert into rimba_analysis_test_state values('retry',public.claim_report_analysis('23000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000001',1,'test-only-model','test-v1',false));
select extensions.ok(pg_temp.analysis_test_id('retry')<>pg_temp.analysis_test_id('first')
  and (select status='pending_analysis' and revision=1 from public.reports where id='23000000-0000-4000-8000-000000000001'),
  'Retry appends a new attempt and returns to pending without invalidating its report revision');
insert into rimba_analysis_test_state values('success',public.complete_report_analysis(pg_temp.analysis_test_id('retry'),
  '13000000-0000-4000-8000-000000000001',pg_temp.analysis_test_output()));
select extensions.ok((select (result->>'accepted')::boolean and result->'analysis'->>'analysis_status'='succeeded'
  and result->'analysis'->'raw_response'=pg_temp.analysis_test_output() from rimba_analysis_test_state where key='success')
  and (select status='pending_verification' and revision=1 and priority_dirty from public.reports where id='23000000-0000-4000-8000-000000000001')
  and (select count(*)=5 from public.report_updates where report_id='23000000-0000-4000-8000-000000000001'),
  'Validated output, status and audit commit atomically without changing revision');
select extensions.ok((public.complete_report_analysis(pg_temp.analysis_test_id('retry'),
  '13000000-0000-4000-8000-000000000001',pg_temp.analysis_test_output())->>'accepted')::boolean
  and (select count(*)=5 from public.report_updates where report_id='23000000-0000-4000-8000-000000000001'),
  'Identical successful completion does not append a duplicate event');
select extensions.throws_ok($$ select public.complete_report_analysis(pg_temp.analysis_test_id('retry'),
  '13000000-0000-4000-8000-000000000001',pg_temp.analysis_test_output()||'{"confidence":0.3}') $$,
  'PT409','analysis_completion_conflict','Conflicting completion cannot replace validated history');
insert into rimba_analysis_test_state values('cached',public.claim_report_analysis('23000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000001',1,'different-model','test-v2',false));
select extensions.ok((select not (result->>'claimed')::boolean from rimba_analysis_test_state where key='cached')
  and pg_temp.analysis_test_id('cached')=pg_temp.analysis_test_id('retry')
  and (select count(*)=2 from public.ai_analyses where report_id='23000000-0000-4000-8000-000000000001'),
  'A normal duplicate request returns the cached successful result');

insert into rimba_analysis_test_state values('lease-old',public.claim_report_analysis('23000000-0000-4000-8000-000000000002',
  '13000000-0000-4000-8000-000000000001',1,'test-only-model','test-v1',false));
reset role;
update public.ai_analyses set processing_expires_at=clock_timestamp()-interval '1 second' where id=pg_temp.analysis_test_id('lease-old');
set local role service_role;
insert into rimba_analysis_test_state values('lease-new',public.claim_report_analysis('23000000-0000-4000-8000-000000000002',
  '13000000-0000-4000-8000-000000000001',1,'test-only-model','test-v1',false));
select extensions.ok(pg_temp.analysis_test_id('lease-old')<>pg_temp.analysis_test_id('lease-new')
  and (select analysis_status='failed' and error_code='AI_INTERRUPTED' from public.ai_analyses where id=pg_temp.analysis_test_id('lease-old'))
  and (select analysis_status='processing' from public.ai_analyses where id=pg_temp.analysis_test_id('lease-new')),
  'Expired processing is recorded as interrupted and replaced with a distinct lease');
select extensions.ok(not (public.complete_report_analysis(pg_temp.analysis_test_id('lease-old'),
  '13000000-0000-4000-8000-000000000001',pg_temp.analysis_test_output())->>'accepted')::boolean
  and (select status='pending_analysis' and revision=1 from public.reports where id='23000000-0000-4000-8000-000000000002'),
  'Late completion of the expired attempt cannot overwrite the newer attempt');
reset role;
update public.ai_analyses set processing_expires_at=clock_timestamp()-interval '1 second' where id=pg_temp.analysis_test_id('lease-new');
set local role service_role;
insert into rimba_analysis_test_state values('expired-completion',public.complete_report_analysis(pg_temp.analysis_test_id('lease-new'),
  '13000000-0000-4000-8000-000000000001',pg_temp.analysis_test_output()));
select extensions.ok((select not (result->>'accepted')::boolean and result->>'reason'='AI_INTERRUPTED'
  and result->'analysis'->>'analysis_status'='failed' from rimba_analysis_test_state where key='expired-completion')
  and (select status='analysis_failed' and revision=1 from public.reports where id='23000000-0000-4000-8000-000000000002'),
  'An expired completion commits a retryable failure instead of rolling it back');

insert into rimba_analysis_test_state values('edited',public.claim_report_analysis('23000000-0000-4000-8000-000000000003',
  '13000000-0000-4000-8000-000000000001',1,'test-only-model','test-v1',false));
select public.update_owned_report('13000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000003',1,
  jsonb_build_object('title','[SIMULASI] Koreksi setelah analisis dimulai','category','forest_fire',
    'description','Fixture analisis AI terisolasi, bukan bukti atau laporan kejadian lingkungan nyata.',
    'evidencePath','13000000-0000-4000-8000-000000000001/sealed/33000000-0000-4000-8000-000000000003.jpg',
    'latitude',-3.8,'longitude',102.2,'incidentTime','2020-01-01T00:00:00Z'));
insert into rimba_analysis_test_state values('stale-edit',public.complete_report_analysis(pg_temp.analysis_test_id('edited'),
  '13000000-0000-4000-8000-000000000001',pg_temp.analysis_test_output()));
select extensions.ok((select not (result->>'accepted')::boolean and result->>'reason'='AI_STALE_REPORT'
  and result->'analysis'->>'error_code'='AI_STALE_REPORT' from rimba_analysis_test_state where key='stale-edit')
  and (select revision=2 and status='pending_analysis' and title='[SIMULASI] Koreksi setelah analisis dimulai'
    from public.reports where id='23000000-0000-4000-8000-000000000003'),
  'A material edit invalidates a late result without overwriting the corrected report');

insert into rimba_analysis_test_state values('human',public.claim_report_analysis('23000000-0000-4000-8000-000000000004',
  '13000000-0000-4000-8000-000000000003',1,'test-only-model','test-v1',true));
select public.admin_change_report_status('23000000-0000-4000-8000-000000000004',
  '13000000-0000-4000-8000-000000000003',1,'verified',null);
insert into rimba_analysis_test_state values('stale-human',public.complete_report_analysis(pg_temp.analysis_test_id('human'),
  '13000000-0000-4000-8000-000000000003',pg_temp.analysis_test_output()));
select extensions.ok((select not (result->>'accepted')::boolean and result->>'reason'='AI_STALE_REPORT'
  from rimba_analysis_test_state where key='stale-human')
  and (select status='verified' and revision=2 from public.reports where id='23000000-0000-4000-8000-000000000004'),
  'A late AI response cannot overwrite a newer officer decision');
insert into rimba_analysis_test_state values('officer-success',public.claim_report_analysis('23000000-0000-4000-8000-000000000005',
  '13000000-0000-4000-8000-000000000003',2,'test-only-model','test-v1',true));
select extensions.ok((public.complete_report_analysis(pg_temp.analysis_test_id('officer-success'),
  '13000000-0000-4000-8000-000000000003',pg_temp.analysis_test_output())->>'accepted')::boolean
  and (select status='verified' and revision=2 from public.reports where id='23000000-0000-4000-8000-000000000005'),
  'Officer reanalysis appends a valid result without resetting handling status or revision');
insert into rimba_analysis_test_state values('officer-failure',public.claim_report_analysis('23000000-0000-4000-8000-000000000005',
  '13000000-0000-4000-8000-000000000003',2,'test-only-model','test-v1',true));
select extensions.ok((public.fail_report_analysis(pg_temp.analysis_test_id('officer-failure'),
  '13000000-0000-4000-8000-000000000003','AI_QUOTA_EXCEEDED')->>'accepted')::boolean
  and (select status='verified' and revision=2 from public.reports where id='23000000-0000-4000-8000-000000000005')
  and (select count(*)=1 from public.ai_analyses where report_id='23000000-0000-4000-8000-000000000005' and analysis_status='succeeded'),
  'Failed officer reanalysis preserves both human status and the earlier successful result');

insert into rimba_analysis_test_state values('atomic',public.claim_report_analysis('23000000-0000-4000-8000-000000000007',
  '13000000-0000-4000-8000-000000000001',1,'test-only-model','test-v1',false));
reset role;
create function pg_temp.reject_analysis_test_audit() returns trigger language plpgsql as $$
begin
  if new.report_id='23000000-0000-4000-8000-000000000007' and new.action='ai_analysis_succeeded' then
    raise exception using errcode='23514',message='analysis_test_audit_rejected';
  end if;
  return new;
end;
$$;
create trigger rimba_analysis_test_audit before insert on public.report_updates for each row execute function pg_temp.reject_analysis_test_audit();
set local role service_role;
select extensions.throws_ok($$ select public.complete_report_analysis(pg_temp.analysis_test_id('atomic'),
  '13000000-0000-4000-8000-000000000001',pg_temp.analysis_test_output()) $$,
  '23514','analysis_test_audit_rejected','An audit failure rolls back the complete result/status transaction');
select extensions.ok((select analysis_status='processing' and raw_response is null from public.ai_analyses where id=pg_temp.analysis_test_id('atomic'))
  and (select status='pending_analysis' and revision=1 from public.reports where id='23000000-0000-4000-8000-000000000007'),
  'No successful result or workflow change survives a rejected audit');
reset role;
drop trigger rimba_analysis_test_audit on public.report_updates;
select extensions.throws_ok($$ update public.ai_analyses set confidence=0.9 where id=pg_temp.analysis_test_id('retry') $$,
  '23514','analysis_history_is_immutable','Even a trusted SQL writer cannot change a terminal result');
select extensions.throws_ok($$ delete from public.ai_analyses where id=pg_temp.analysis_test_id('retry') $$,
  '23514','analysis_history_is_immutable','Terminal analysis history cannot be deleted');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"13000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select extensions.is((select count(id) from public.ai_analyses where report_id='23000000-0000-4000-8000-000000000001'),
  0::bigint,'Another citizen cannot read normalized analysis history');
select extensions.throws_ok($$ select raw_response from public.ai_analyses $$,'42501',null,'Browser users cannot select raw output snapshots');
select extensions.throws_ok($$ select public.claim_report_analysis('23000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000001',1,'test-only-model','test-v1',false) $$,
  '42501',null,'A browser role cannot invoke service-only analysis RPCs');
reset role;
select * from extensions.finish(true);


rollback to savepoint rimbaguard_analysis_checks;
release savepoint rimbaguard_analysis_checks;
commit;
