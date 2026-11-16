-- Phase 4 verification after migrations 001-005. All fixtures roll back.
-- Fixtures sit near 1.0 N, 110.0 E and 3.0 N, 115.0 E so they cannot form
-- neighborhoods with any retained record; the 7-day window is checked as well.
begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to anon,authenticated,service_role;
select extensions.no_plan();

select extensions.ok((select count(*)=3 and bool_and(p.prosecdef and p.proconfig @> array['search_path=""']::text[])
  from pg_proc p where p.oid in (
    'public.refresh_threat_priorities(uuid[],integer,boolean)'::regprocedure,
    'public.admin_map_reports(uuid,public.threat_category,text,public.report_status,timestamptz,timestamptz,text,integer,integer)'::regprocedure,
    'public.public_map_reports(public.threat_category,text,public.report_status,timestamptz,timestamptz,uuid,integer,integer)'::regprocedure)),
  'Priority and map RPCs are security-definer with an empty search path');
select extensions.ok((select bool_and(has_function_privilege('service_role',signature,'EXECUTE')
  and not has_function_privilege('anon',signature,'EXECUTE')
  and not has_function_privilege('authenticated',signature,'EXECUTE')) from (values
  ('public.refresh_threat_priorities(uuid[],integer,boolean)'),
  ('public.admin_map_reports(uuid,public.threat_category,text,public.report_status,timestamptz,timestamptz,text,integer,integer)'),
  ('public.public_map_reports(public.threat_category,text,public.report_status,timestamptz,timestamptz,uuid,integer,integer)')) as f(signature)),
  'Only the service role executes priority refresh and map projections');
select extensions.ok((select count(*)>=15 and bool_and(not has_function_privilege('service_role',p.oid,'EXECUTE')
  and not has_function_privilege('authenticated',p.oid,'EXECUTE') and not has_function_privilege('anon',p.oid,'EXECUTE'))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and (p.proname like 'priority%' or p.proname in ('compute_report_priority','mark_priority_neighbors',
    'report_effective_category','report_content_revision','distance_km','threat_category_label','touch_report_updated_at'))),
  'Scoring internals are not callable by any application role');
select extensions.ok(not has_table_privilege('service_role','public.threat_priorities','INSERT')
  and not has_table_privilege('authenticated','public.threat_priorities','INSERT'),
  'Scores can only be produced by the deterministic refresh');

select extensions.is(private.priority_total(90,80,100,70),85.5::numeric,
  'The PRD example computes to 85.5 with the stated weights, not 86.5');
select extensions.ok(private.priority_level_for(75)='high' and private.priority_level_for(74.9999)='medium'
  and private.priority_level_for(45)='medium' and private.priority_level_for(44.9999)='low'
  and private.priority_level_for(100)='high' and private.priority_level_for(0)='low',
  'Priority classes use the full fractional value at the 45 and 75 thresholds');
select extensions.ok((select array_agg(private.priority_severity(c) order by c) from unnest(enum_range(null::public.threat_category)) as c)
  = array[90,95,80,55,40]::numeric[], 'Severity uses the PRD base weights for every category');
select extensions.is(private.priority_completeness('a/sealed/36000000-0000-4000-8000-000000000999.jpg',repeat('a',80),1,110,
  '2026-01-01T00:00:00Z','Hut','2026-01-01T01:00:00Z'),100::numeric,'Complete information earns all five completeness rules');
select extensions.is(private.priority_completeness('a/sealed/36000000-0000-4000-8000-000000000999.jpg','  '||repeat('a',79)||'  ',1,110,
  '2026-01-01T00:00:00Z',' Hu ','2026-01-01T01:00:00Z'),65::numeric,
  'A 79-character trimmed description and a 2-character location name earn no points');
select extensions.is(private.priority_completeness('not-a-sealed-path',repeat('a',80),1,110,
  '2026-01-02T00:00:00Z',null,'2026-01-01T00:00:00Z'),45::numeric,
  'Unsealed evidence, a future instant and a missing location name earn no points');
select extensions.ok(private.priority_recency('2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')=100
  and private.priority_recency('2026-01-01T00:00:00Z','2026-01-01T06:00:00Z')=100
  and private.priority_recency('2026-01-01T00:00:00Z','2026-01-01T06:00:01Z')=85
  and private.priority_recency('2026-01-01T00:00:00Z','2026-01-02T00:00:00Z')=85
  and private.priority_recency('2026-01-01T00:00:00Z','2026-01-02T00:00:01Z')=65
  and private.priority_recency('2026-01-01T00:00:00Z','2026-01-04T00:00:00Z')=65
  and private.priority_recency('2026-01-01T00:00:00Z','2026-01-04T00:00:01Z')=40
  and private.priority_recency('2026-01-01T00:00:00Z','2026-01-08T00:00:00Z')=40
  and private.priority_recency('2026-01-01T00:00:00Z','2026-01-08T00:00:01Z')=20,
  'Recency boundaries are inclusive at 6, 24, 72 and 168 hours');
select extensions.ok(private.priority_recency('2026-01-01T00:00:01Z','2026-01-01T00:00:00Z') is null,
  'A future incident instant has no recency score');
select extensions.ok(private.priority_recency_expires_at('2026-01-01T00:00:00Z','2026-01-01T01:00:00Z')='2026-01-01T06:00:00Z'
  and private.priority_recency_expires_at('2026-01-01T00:00:00Z','2026-01-01T06:00:01Z')='2026-01-02T00:00:00Z'
  and private.priority_recency_expires_at('2026-01-01T00:00:00Z','2026-01-05T00:00:00Z')='2026-01-08T00:00:00Z'
  and private.priority_recency_expires_at('2026-01-01T00:00:00Z','2026-01-08T00:00:01Z') is null,
  'Each stored recency score records the next boundary when it becomes stale');
select extensions.ok(private.priority_nearby_score(0)=0 and private.priority_nearby_score(1)=40
  and private.priority_nearby_score(2)=70 and private.priority_nearby_score(3)=100 and private.priority_nearby_score(12)=100,
  'Nearby counts map 0/1/2/3+ to 0/40/70/100');
select extensions.ok(abs(private.distance_km(0,0,0,1)-111.195)<0.01
  and private.distance_km(1,110,1.0179,110)<2 and private.distance_km(1,110,1.0181,110)>2
  and abs(private.distance_km(-3.8,102.2,-3.8,102.2))<0.000001,
  'Haversine distance is accurate around the 2 km radius');

insert into auth.users(id,email,raw_user_meta_data) values
  ('16000000-0000-4000-8000-000000000001','priority-owner@example.invalid','{"full_name":"Priority test owner"}'),
  ('16000000-0000-4000-8000-000000000002','priority-other@example.invalid','{"full_name":"Priority test other"}'),
  ('16000000-0000-4000-8000-000000000003','priority-officer@example.invalid','{"full_name":"Priority test officer"}');
update public.profiles set role='admin' where id='16000000-0000-4000-8000-000000000003';

create function pg_temp.pid(p_n integer) returns uuid language sql immutable as $$
  select ('26000000-0000-4000-8000-'||lpad(p_n::text,12,'0'))::uuid
$$;
create function pg_temp.priority_fixture(p_n integer, p_category public.threat_category, p_latitude numeric,
  p_longitude numeric, p_age interval, p_simulation boolean default false) returns uuid language sql as $$
  insert into public.reports(id,user_id,report_code,title,category,description,image_path,latitude,longitude,
    location_name,incident_time,idempotency_key,is_simulation)
  values (pg_temp.pid(p_n),'16000000-0000-4000-8000-000000000001','TEST-PRIORITY-'||p_n,'[SIMULASI] Pengujian prioritas '||p_n,
    p_category,'Fixture prioritas terisolasi untuk pengujian aturan skor; bukan bukti atau laporan kejadian lingkungan nyata apa pun.',
    '16000000-0000-4000-8000-000000000001/sealed/'||('36000000-0000-4000-8000-'||lpad(p_n::text,12,'0'))||'.jpg',
    p_latitude,p_longitude,'Lokasi uji prioritas',now()-p_age,('46000000-0000-4000-8000-'||lpad(p_n::text,12,'0'))::uuid,p_simulation)
  returning id
$$;
create function pg_temp.latest(p_n integer) returns public.threat_priorities language sql stable as $$
  select * from public.threat_priorities where report_id=pg_temp.pid(p_n) order by calculated_at desc,report_revision desc limit 1
$$;
create function pg_temp.calculations(p_n integer) returns bigint language sql stable as $$
  select count(*) from public.threat_priorities where report_id=pg_temp.pid(p_n)
$$;
create temp table rimba_priority_state(key text primary key,result jsonb);
alter table rimba_priority_state enable row level security;
grant select,insert,update on rimba_priority_state to service_role;
create function pg_temp.has_report(p_key text, p_n integer) returns boolean language sql stable as $$
  select exists(select 1 from rimba_priority_state s, jsonb_array_elements(s.result->'reports') as e(item)
    where s.key=p_key and e.item->>'id'=pg_temp.pid(p_n)::text)
$$;

select pg_temp.priority_fixture(1,'forest_fire',1.0,110.0,interval '1 hour');
select pg_temp.priority_fixture(2,'forest_fire',1.0170,110.0,interval '1 hour');
select pg_temp.priority_fixture(3,'forest_fire',1.0185,110.0,interval '1 hour');
select pg_temp.priority_fixture(4,'land_clearing',1.0,110.0,interval '1 hour');
select pg_temp.priority_fixture(5,'forest_fire',1.0,110.0,interval '8 days');
select pg_temp.priority_fixture(6,'forest_fire',1.0,110.0,interval '1 hour',true);
select pg_temp.priority_fixture(7,'forest_fire',1.0,110.0,interval '1 hour');
update public.reports set status='rejected',revision=2 where id=pg_temp.pid(7);
insert into rimba_priority_state values('updated-before',(select jsonb_object_agg(id,updated_at) from public.reports
  where id in (pg_temp.pid(1),pg_temp.pid(2))));

select extensions.ok((select bool_and(priority_dirty and priority_recalculate_at is null) from public.reports
  where id in (pg_temp.pid(1),pg_temp.pid(2),pg_temp.pid(3),pg_temp.pid(4),pg_temp.pid(5),pg_temp.pid(6),pg_temp.pid(7))),
  'New reports start stale with no calculation');

set local role service_role;
select extensions.throws_ok($$ select public.refresh_threat_priorities(null,0,false) $$,'22023','invalid_priority_refresh',
  'Refresh batches are bounded');
select extensions.throws_ok($$ select public.refresh_threat_priorities(array[null]::uuid[],10,false) $$,'22023','invalid_priority_refresh',
  'Refresh rejects a null report identifier');
select extensions.throws_ok($$ insert into public.threat_priorities(report_id,report_revision,effective_category,category_source,
  threat_severity,evidence_completeness,recency_score,nearby_reports_score,nearby_reports_count,total_score,priority_level,
  explanation,scoring_version,input_snapshot) values ('26000000-0000-4000-8000-000000000001',1,'forest_fire','user',100,100,100,100,3,100,
  'high','Skor buatan','forged','{}') $$,'42501',null,'The server credential cannot write a forged score');
insert into rimba_priority_state values('first',public.refresh_threat_priorities(array[pg_temp.pid(1),pg_temp.pid(2),
  pg_temp.pid(3),pg_temp.pid(4),pg_temp.pid(5),pg_temp.pid(6),pg_temp.pid(7)],50,true));
reset role;

select extensions.ok((select (result->>'busy')::boolean=false and (result->>'refreshed')::integer>=7 and (result->>'failed')::integer=0
  from rimba_priority_state where key='first'),'Refresh processes the requested stale reports without failures');
select extensions.ok((select bool_and(not priority_dirty) from public.reports
  where id in (pg_temp.pid(1),pg_temp.pid(2),pg_temp.pid(3),pg_temp.pid(4),pg_temp.pid(5),pg_temp.pid(6),pg_temp.pid(7))),
  'Every processed report is marked fresh');
select extensions.ok((select p.threat_severity=95 and p.evidence_completeness=100 and p.recency_score=100
  and p.nearby_reports_count=1 and p.nearby_reports_score=40 and p.total_score=86.25 and p.priority_level='high'
  and p.effective_category='forest_fire' and p.category_source='user' and p.scoring_version='rimbaguard-priority-v1'
  and p.report_revision=1 from pg_temp.latest(1) p),
  'A persisted calculation stores every component, the formula total, class, source and version');
select extensions.ok((select p.explanation like 'Prioritas tinggi (skor 86,25 dari 100)%' and p.explanation like '%1 laporan serupa%'
  and p.explanation like '%bukan bukti bahwa kejadian benar terjadi%' from pg_temp.latest(1) p),
  'The explanation names the class, score and components without claiming the incident is true');
select extensions.ok((select (p.input_snapshot->'neighborhood'->>'category')='forest_fire' and (p.input_snapshot->>'content_revision')::integer=1
  and (p.input_snapshot->>'nearby_radius_km')::integer=2 and (p.input_snapshot->>'nearby_window_days')::integer=7
  and not (p.input_snapshot ? 'nearby_report_ids') from pg_temp.latest(1) p),
  'The input snapshot is auditable without naming other reports');
select extensions.ok((pg_temp.latest(1)).nearby_reports_count=1 and (pg_temp.latest(3)).nearby_reports_count=1,
  'A report 1.89 km away counts and one 2.06 km away does not');
select extensions.ok((pg_temp.latest(2)).nearby_reports_count=2 and (pg_temp.latest(2)).nearby_reports_score=70
  and (pg_temp.latest(2)).total_score=92.25,'Nearby counting excludes the report itself');
select extensions.ok((pg_temp.latest(4)).nearby_reports_count=0 and (pg_temp.latest(4)).total_score=73
  and (pg_temp.latest(4)).priority_level='medium','A different effective category is not a similar report');
select extensions.ok((pg_temp.latest(5)).nearby_reports_count=0 and (pg_temp.latest(5)).recency_score=20,
  'Reports outside the 7-day incident window are not similar reports');
select extensions.ok((pg_temp.latest(6)).nearby_reports_count=0,
  'Simulation and real reports never corroborate each other');
select extensions.ok((select priority_recalculate_at=incident_time+interval '6 hours' from public.reports where id=pg_temp.pid(1))
  and (select priority_recalculate_at is null from public.reports where id=pg_temp.pid(7)),
  'Active reports record their next recency boundary; rejected reports need no time refresh');
select extensions.ok((select jsonb_object_agg(id,updated_at) from public.reports where id in (pg_temp.pid(1),pg_temp.pid(2)))
  =(select result from rimba_priority_state where key='updated-before'),'Score bookkeeping does not change report updated_at');

set local role service_role;
insert into rimba_priority_state values('fresh',public.refresh_threat_priorities(array[pg_temp.pid(1)],1,true));
reset role;
select extensions.is(pg_temp.calculations(1),1::bigint,'A fresh report is not recalculated');

select pg_temp.priority_fixture(8,'forest_fire',0.9995,110.0,interval '2 hours');
set local role service_role;
insert into rimba_priority_state values('added',public.refresh_threat_priorities(array[pg_temp.pid(8)],50,true));
reset role;
select extensions.ok((pg_temp.latest(8)).nearby_reports_count=2,'A new report counts its eligible neighbors');
select extensions.ok((pg_temp.latest(1)).nearby_reports_count=2 and (pg_temp.latest(1)).total_score=92.25
  and (pg_temp.latest(2)).nearby_reports_count=3 and (pg_temp.latest(2)).nearby_reports_score=100,
  'A new nearby report recalculates the existing neighborhood in the same refresh');
select extensions.is(pg_temp.calculations(3),1::bigint,'Reports outside the changed neighborhood are not recalculated');

update public.reports set latitude=5.0,revision=2,priority_dirty=true where id=pg_temp.pid(8);
insert into public.report_updates(report_id,report_revision,actor_type,actor_id,action,previous_status,new_status)
values (pg_temp.pid(8),2,'user','16000000-0000-4000-8000-000000000001','report_corrected','pending_analysis','pending_analysis');
set local role service_role;
insert into rimba_priority_state values('moved',public.refresh_threat_priorities(array[pg_temp.pid(8)],50,true));
reset role;
select extensions.ok((pg_temp.latest(8)).nearby_reports_count=0 and (pg_temp.latest(8)).report_revision=2
  and (pg_temp.latest(1)).nearby_reports_count=1 and (pg_temp.latest(2)).nearby_reports_count=2,
  'Moving a report recalculates its previous neighborhood as well as its own score');

update public.reports set status='rejected',revision=2,priority_dirty=true where id=pg_temp.pid(2);
set local role service_role;
insert into rimba_priority_state values('rejected',public.refresh_threat_priorities(array[pg_temp.pid(2)],50,true));
reset role;
select extensions.ok((pg_temp.latest(1)).nearby_reports_count=0 and (pg_temp.latest(3)).nearby_reports_count=0
  and (pg_temp.latest(1)).total_score=78.25 and (pg_temp.latest(1)).priority_level='high',
  'A rejected report stops corroborating its former neighbors');

update public.reports set priority_recalculate_at=clock_timestamp()-interval '1 second' where id=pg_temp.pid(4);
set local role service_role;
insert into rimba_priority_state values('sweep',public.refresh_threat_priorities(null,500,false));
reset role;
select extensions.ok(pg_temp.calculations(4)=1 and (select not priority_dirty and priority_recalculate_at>clock_timestamp()
  from public.reports where id=pg_temp.pid(4)),
  'A sweep rechecks an expired score and an unchanged result adds no duplicate history');
select private.compute_report_priority(pg_temp.pid(4),now()+interval '7 hours');
select extensions.ok(pg_temp.calculations(4)=2 and (pg_temp.latest(4)).recency_score=85 and (pg_temp.latest(4)).total_score=70,
  'Crossing a recency boundary appends a new calculation');

select pg_temp.priority_fixture(9,'other_environmental_threat',3.0,115.0,interval '1 hour');
select pg_temp.priority_fixture(10,'other_environmental_threat',3.5,115.0,interval '1 hour');
select pg_temp.priority_fixture(11,'other_environmental_threat',4.0,115.0,interval '1 hour');
insert into public.ai_analyses(id,report_id,report_revision,analysis_status,detected_category,detected_indicators,visual_observation,
  reasoning_summary,confidence,risk_level,recommendation,model_name,prompt_version,completed_at)
select ('56000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,pg_temp.pid(n),1,'succeeded',
  case when n=10 then 'uncertain' else 'forest_fire' end,'[]','[SIMULASI] Observasi uji.','[SIMULASI] Ringkasan uji.',0.5,
  'medium','Verifikasi petugas.','test-only-model','test-v1',now()
from unnest(array[9,10,11]) as n;
update public.reports set revision=2,priority_dirty=true where id=pg_temp.pid(11);
insert into public.report_updates(report_id,report_revision,actor_type,actor_id,action,previous_status,new_status)
values (pg_temp.pid(11),2,'user','16000000-0000-4000-8000-000000000001','report_corrected','pending_analysis','pending_analysis');
set local role service_role;
insert into rimba_priority_state values('categories',public.refresh_threat_priorities(array[pg_temp.pid(9),pg_temp.pid(10),pg_temp.pid(11)],50,true));
reset role;
select extensions.ok((pg_temp.latest(9)).effective_category='forest_fire' and (pg_temp.latest(9)).category_source='ai'
  and (pg_temp.latest(9)).threat_severity=95,'A validated non-uncertain AI category becomes the effective category');
select extensions.ok((pg_temp.latest(10)).effective_category='other_environmental_threat' and (pg_temp.latest(10)).category_source='user',
  'An uncertain AI result leaves the reporter category as a provisional category');
select extensions.ok((pg_temp.latest(11)).category_source='user' and (pg_temp.latest(11)).threat_severity=40,
  'An AI result for content that was corrected later no longer applies');
update public.reports set status='pending_verification',revision=2,priority_dirty=true where id=pg_temp.pid(9);
set local role service_role;
insert into rimba_priority_state values('status-bump',public.refresh_threat_priorities(array[pg_temp.pid(9)],50,true));
reset role;
select extensions.ok((pg_temp.latest(9)).report_revision=2 and (pg_temp.latest(9)).category_source='ai',
  'A status-only revision keeps the AI category for unchanged content');
update public.reports set officer_category='land_clearing',revision=3,priority_dirty=true where id=pg_temp.pid(9);
set local role service_role;
insert into rimba_priority_state values('officer',public.refresh_threat_priorities(array[pg_temp.pid(9)],50,true));
reset role;
select extensions.ok((pg_temp.latest(9)).effective_category='land_clearing' and (pg_temp.latest(9)).category_source='officer'
  and (pg_temp.latest(9)).threat_severity=80,'An officer category correction takes precedence over AI');

select pg_temp.priority_fixture(12,'forest_fire',1.5,110.5,interval '30 minutes');
select pg_temp.priority_fixture(13,'forest_fire',1.234567,110.987654,interval '1 hour');
update public.reports set status='verified',revision=2,is_public=true,
  public_summary='Ringkasan publik pengujian yang telah ditinjau petugas.',
  published_by='16000000-0000-4000-8000-000000000003',published_at=now()
where id=pg_temp.pid(13);
update public.reports set priority_dirty=true where id=pg_temp.pid(1);

set local role service_role;
select extensions.throws_ok($$ select public.admin_map_reports('16000000-0000-4000-8000-000000000002') $$,
  '42501','admin_required','A citizen cannot read the officer map projection');
select extensions.throws_ok($$ select public.admin_map_reports('16000000-0000-4000-8000-000000000003',p_dataset=>'unknown') $$,
  '22023','invalid_map_filters','Officer map filters are validated');
select extensions.throws_ok($$ select public.admin_map_reports('16000000-0000-4000-8000-000000000003',
  p_from=>'2026-01-02T00:00:00Z',p_to=>'2026-01-01T00:00:00Z') $$,'22023','invalid_map_filters','An inverted date range is rejected');
insert into rimba_priority_state values('admin-fire',public.admin_map_reports('16000000-0000-4000-8000-000000000003',p_category=>'forest_fire'));
insert into rimba_priority_state values('admin-simulation',public.admin_map_reports('16000000-0000-4000-8000-000000000003',p_dataset=>'simulation'));
insert into rimba_priority_state values('admin-high',public.admin_map_reports('16000000-0000-4000-8000-000000000003',p_priority=>'high',p_dataset=>'real'));
insert into rimba_priority_state values('admin-none',public.admin_map_reports('16000000-0000-4000-8000-000000000003',p_priority=>'none'));
insert into rimba_priority_state values('admin-rejected',public.admin_map_reports('16000000-0000-4000-8000-000000000003',p_status=>'rejected'));
insert into rimba_priority_state values('admin-recent',public.admin_map_reports('16000000-0000-4000-8000-000000000003',
  p_from=>now()-interval '2 days',p_to=>now()+interval '1 day'));
insert into rimba_priority_state values('admin-page',public.admin_map_reports('16000000-0000-4000-8000-000000000003',
  p_category=>'forest_fire',p_dataset=>'real',p_limit=>1,p_offset=>0));
reset role;
select extensions.ok(pg_temp.has_report('admin-fire',1) and pg_temp.has_report('admin-fire',3) and not pg_temp.has_report('admin-fire',4),
  'The officer map filters by effective category in the database');
select extensions.ok(pg_temp.has_report('admin-simulation',6) and not pg_temp.has_report('admin-simulation',1),
  'The officer map separates simulation data on request');
select extensions.ok(pg_temp.has_report('admin-high',1) and not pg_temp.has_report('admin-high',4),
  'The officer map filters by the latest priority class');
select extensions.ok(pg_temp.has_report('admin-none',12) and not pg_temp.has_report('admin-none',1),
  'Reports without a calculation are available as an unscored filter');
select extensions.ok(pg_temp.has_report('admin-rejected',2) and not pg_temp.has_report('admin-rejected',1),
  'The officer map filters by workflow status');
select extensions.ok(pg_temp.has_report('admin-recent',1) and not pg_temp.has_report('admin-recent',5),
  'The officer map filters by incident date range');
select extensions.ok((select jsonb_array_length(result->'reports')=1 and (result->>'total')::integer>=4
  from rimba_priority_state where key='admin-page'),'The officer map is paginated and reports the filtered total');
select extensions.ok((select (e.item->>'latitude')::numeric=1.0 and e.item->>'title'='[SIMULASI] Pengujian prioritas 1'
  and (e.item->'priority'->>'stale')::boolean and e.item->'priority'->>'level'='high'
  from rimba_priority_state s, jsonb_array_elements(s.result->'reports') as e(item)
  where s.key='admin-fire' and e.item->>'id'=pg_temp.pid(1)::text),
  'Officers see exact coordinates and a stale flag until the score is refreshed');

set local role service_role;
insert into rimba_priority_state values('public-all',public.public_map_reports());
insert into rimba_priority_state values('public-one',public.public_map_reports(p_report_id=>pg_temp.pid(13)));
insert into rimba_priority_state values('public-other-category',public.public_map_reports(p_category=>'land_clearing'));
select extensions.throws_ok($$ select public.public_map_reports(p_status=>'pending_verification') $$,'22023','invalid_map_filters',
  'The public map cannot be asked for unpublished workflow states');
reset role;
select extensions.ok(pg_temp.has_report('public-all',13) and not pg_temp.has_report('public-all',1)
  and not pg_temp.has_report('public-all',6) and not pg_temp.has_report('public-other-category',13),
  'The public map lists only published real reports and filters them in the database');
select extensions.ok((select (result->>'total')::integer=1 and (result->'reports'->0->>'approximateLatitude')::numeric=1.23
  and (result->'reports'->0->>'approximateLongitude')::numeric=110.99
  and (result->'reports'->0->>'coordinatesAreApproximate')::boolean
  from rimba_priority_state where key='public-one'),'Public coordinates are rounded to 0.01 degree and labeled approximate');
select extensions.ok((select array_agg(k order by k) from rimba_priority_state s, jsonb_object_keys(s.result->'reports'->0) as k
  where s.key='public-one')=array['approximateLatitude','approximateLongitude','category','coordinatesAreApproximate',
  'id','incidentTime','priority','publishedAt','reportCode','status','summary'],'The public map item is an explicit field allowlist');
select extensions.ok((select result::text not like '%Fixture prioritas%' and result::text not like '%16000000-0000-4000-8000-000000000001%'
  and result::text not like '%1.234567%' and result::text not like '%sealed%' and result::text not like '%[SIMULASI]%'
  from rimba_priority_state where key='public-one'),'No identity, exact point, title, description or evidence path reaches the public map');
update public.reports set is_public=false where id=pg_temp.pid(13);
set local role service_role;
insert into rimba_priority_state values('public-withdrawn',public.public_map_reports(p_report_id=>pg_temp.pid(13)));
reset role;
select extensions.ok((select (result->>'total')::integer=0 from rimba_priority_state where key='public-withdrawn'),
  'A withdrawn publication disappears from the public map');

select extensions.throws_ok($$ update public.threat_priorities set total_score=100 where report_id='26000000-0000-4000-8000-000000000001' $$,
  '23514','history_is_immutable','Priority history cannot be rewritten');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select extensions.throws_ok($$ select public.refresh_threat_priorities(null,10,false) $$,'42501',null,
  'A browser session cannot trigger score refreshes');
select extensions.throws_ok($$ select public.admin_map_reports('16000000-0000-4000-8000-000000000003') $$,'42501',null,
  'Even an officer browser session cannot call the map projection directly');
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select extensions.is((select count(id) from public.threat_priorities where report_id=pg_temp.pid(1)),0::bigint,
  'Another citizen cannot read a report priority history');
reset role;
set local role anon;
select extensions.throws_ok($$ select public.public_map_reports() $$,'42501',null,'Anonymous database access must go through the Nuxt endpoint');
reset role;
select * from extensions.finish(true);
rollback;
