begin;
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to anon,authenticated,service_role;
select extensions.no_plan();

select extensions.ok((select relrowsecurity from pg_class where oid='public.report_assistant_drafts'::regclass),'Assistant drafts enforce RLS');
select extensions.ok(not has_table_privilege('anon','public.report_assistant_drafts','SELECT'),'Anonymous users cannot read drafts');
select extensions.ok(not has_table_privilege('authenticated','public.report_assistant_drafts','INSERT'),'Citizens cannot forge drafts');
select extensions.ok(not has_table_privilege('service_role','public.report_assistant_drafts','UPDATE'),'Service writes use transactional RPCs');
select extensions.ok(not has_function_privilege('authenticated','public.claim_report_assistant(uuid,uuid,uuid,text,text,text)','EXECUTE'),'Citizens cannot call privileged assistant RPCs');

insert into auth.users(id,email,raw_user_meta_data) values
('81000000-0000-4000-8000-000000000001','assistant-sql-a@example.invalid','{}'),
('81000000-0000-4000-8000-000000000002','assistant-sql-b@example.invalid','{}');
insert into public.evidence_uploads(id,user_id,incoming_path,sealed_path,declared_mime_type,declared_size) values
('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',
'81000000-0000-4000-8000-000000000001/incoming/82000000-0000-4000-8000-000000000001.jpg',
'81000000-0000-4000-8000-000000000001/sealed/82000000-0000-4000-8000-000000000001.jpg','image/jpeg',100);

create function pg_temp.assistant_fixture_output() returns jsonb language sql as $$
 select '{"visual_observations":[],"reported_summary":"Fixture SQL terisolasi, bukan laporan kejadian nyata.","suggested_title":"[SIMULASI] Asisten SQL","suggested_category":"uncertain","questions":[{"id":"q1","text":"Apa yang Anda ketahui langsung?","reason":"Membedakan pengamatan dan dugaan."}],"limitations":"Bukti fixture tidak menunjukkan kondisi lapangan.","needs_human_review":true}'::jsonb
$$;
create function pg_temp.assistant_fixture_payload() returns jsonb language sql as $$
 select '{"title":"[SIMULASI] Asisten SQL","description":"Keterangan fixture SQL terisolasi yang sudah ditinjau pengguna, bukan kejadian nyata.","category":"other_environmental_threat","evidencePath":"81000000-0000-4000-8000-000000000001/sealed/82000000-0000-4000-8000-000000000001.jpg","latitude":-3,"longitude":102,"incidentTime":"2020-01-01T00:00:00Z"}'::jsonb
$$;
set local role service_role;
select extensions.throws_ok($$select public.claim_report_assistant('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','Cerita fixture asisten SQL terisolasi.','gemini-test','assistant-test')$$,'23514','assistant_evidence_not_finalized','Unfinalized evidence is rejected');
select public.claim_evidence_upload('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001');
select public.complete_evidence_upload('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001',80,'image/jpeg',repeat('a',64));
select extensions.throws_ok($$select public.claim_report_assistant('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000001','Cerita fixture asisten SQL terisolasi.','gemini-test','assistant-test')$$,'P0002','assistant_evidence_not_found','A foreign upload is not disclosed');
select extensions.is(public.claim_report_assistant('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','Cerita fixture asisten SQL terisolasi.','gemini-test','assistant-test')->>'claimed','true','First request claims one provider attempt');
select extensions.is(public.claim_report_assistant('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','Cerita fixture asisten SQL terisolasi.','gemini-test','assistant-test')->>'claimed','false','Concurrent repeated request reuses processing attempt');
select extensions.throws_ok($$select public.claim_report_assistant('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','Isi berbeda pada kunci yang sama.','gemini-test','assistant-test')$$,'PT409','assistant_input_conflict','Same draft ID cannot change its evidence story');
select extensions.throws_ok($$select public.finish_report_assistant('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000002',pg_temp.assistant_fixture_output())$$,'PT409','assistant_lease_conflict','Wrong lease cannot complete an attempt');
select extensions.throws_ok($$select public.finish_report_assistant('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',(select lease_token from public.report_assistant_drafts where id='83000000-0000-4000-8000-000000000001'),jsonb_set(pg_temp.assistant_fixture_output(),'{needs_human_review}','false'))$$,'22023','invalid_assistant_output','Human review cannot be disabled');
select public.finish_report_assistant('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',(select lease_token from public.report_assistant_drafts where id='83000000-0000-4000-8000-000000000001'),pg_temp.assistant_fixture_output());
select extensions.is((select status from public.report_assistant_drafts where id='83000000-0000-4000-8000-000000000001'),'ready','Provider result persists before answering');
select extensions.is(public.claim_report_assistant('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','Cerita fixture asisten SQL terisolasi.','gemini-test','assistant-test')->>'claimed','false','Completed result is reused without another provider call');
select extensions.throws_ok($$select public.create_assisted_report('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',1,false,'85000000-0000-4000-8000-000000000001',pg_temp.assistant_fixture_payload(),true)$$,'22023','assistant_confirmation_required','Explicit confirmation is mandatory');
select extensions.throws_ok($$select public.create_assisted_report('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',1,true,'85000000-0000-4000-8000-000000000001',pg_temp.assistant_fixture_payload(),true)$$,'22023','assistant_answers_required','Questions must be answered before submission');
select extensions.throws_ok($$select public.answer_report_assistant('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',1,'[{"id":"q2","text":"Jawaban tidak dikenal"}]')$$,'22023','invalid_assistant_answers','Foreign question IDs are rejected');
select public.answer_report_assistant('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',1,'[{"id":"q1","text":"Saya tidak tahu; ini hanya fixture uji."}]');
select extensions.is((select version from public.report_assistant_drafts where id='83000000-0000-4000-8000-000000000001'),2,'Saving answers advances the version');
select extensions.throws_ok($$select public.answer_report_assistant('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',1,'[{"id":"q1","text":"Jawaban lama"}]')$$,'PT409','assistant_version_conflict','Stale answers cannot overwrite a newer version');
select extensions.is(public.create_assisted_report('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',2,true,'85000000-0000-4000-8000-000000000001',pg_temp.assistant_fixture_payload(),true)->>'reused','false','Confirmed draft creates a report atomically');
select extensions.is(public.create_assisted_report('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',2,true,'85000000-0000-4000-8000-000000000001',pg_temp.assistant_fixture_payload(),true)->>'reused','true','Retry reuses the same report');
select extensions.is((select count(*)::integer from public.reports where user_id='81000000-0000-4000-8000-000000000001'),1,'Repeated submission does not duplicate the report');
select extensions.is((select status from public.report_assistant_drafts where id='83000000-0000-4000-8000-000000000001'),'submitted','Draft is linked to the submitted report');
select extensions.throws_ok($$select public.answer_report_assistant('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002',2,'[]')$$,'P0002','assistant_not_found','Foreign draft mutation reveals no record');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select extensions.is((select count(*)::integer from public.report_assistant_drafts where id='83000000-0000-4000-8000-000000000001'),0,'RLS hides another citizen draft');
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.is((select count(*)::integer from public.report_assistant_drafts where id='83000000-0000-4000-8000-000000000001'),1,'Owner can reload the persisted draft');
reset role;
select * from extensions.finish();
rollback;
