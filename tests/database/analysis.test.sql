-- Phase 3 verification after migrations 001-004. All fixtures roll back.
begin;
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
rollback;
