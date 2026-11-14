-- Phase 2 verification. Run on the disposable project after migration 002.
-- Every fixture and temporary object is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
select extensions.no_plan();

select extensions.ok((select relrowsecurity from pg_class where oid = 'public.evidence_uploads'::regclass), 'Upload receipt ledger has RLS');
select extensions.ok(not has_table_privilege('authenticated', 'public.evidence_uploads', 'SELECT'), 'Citizens cannot list upload receipts');
select extensions.ok(not has_table_privilege('authenticated', 'public.evidence_uploads', 'INSERT'), 'Citizens cannot forge upload receipts');
select extensions.ok(not has_table_privilege('service_role', 'public.reports', 'INSERT'), 'Report insertion requires the atomic create RPC');
select extensions.ok(not has_function_privilege('authenticated', 'public.create_report(uuid,uuid,jsonb,boolean)', 'EXECUTE'), 'Citizen cannot invoke privileged report creation directly');
select extensions.ok(not has_function_privilege('authenticated', 'public.update_owned_report(uuid,uuid,integer,jsonb)', 'EXECUTE'), 'Citizen cannot invoke privileged corrections directly');
select extensions.ok(not has_function_privilege('anon', 'public.platform_statistics()', 'EXECUTE'), 'Statistics use the safe server API');

create temp table rimba_reporting_test_state (report_id uuid, stats_before jsonb, payload jsonb);
insert into rimba_reporting_test_state (stats_before, payload)
select to_jsonb(s), jsonb_build_object(
  'title', '[PENGUJIAN] Laporan transaksi', 'category', 'forest_fire',
  'description', 'Fixture pengujian transaksi, bukan kejadian lapangan yang sebenarnya.',
  'evidencePath', '11000000-0000-4000-8000-000000000001/sealed/31000000-0000-4000-8000-000000000001.jpg',
  'latitude', -3.8, 'longitude', 102.2, 'incidentTime', '2020-01-01T00:00:00Z', 'locationName', 'Lokasi pengujian'
) from public.platform_statistics() s;
grant select, update on rimba_reporting_test_state to service_role;

insert into auth.users (id,email,raw_user_meta_data) values
('11000000-0000-4000-8000-000000000001','reporting-test-a@example.invalid','{"full_name":"Reporting test A"}'::jsonb),
('11000000-0000-4000-8000-000000000002','reporting-test-b@example.invalid','{"full_name":"Reporting test B"}'::jsonb);
insert into public.evidence_uploads (id,user_id,incoming_path,sealed_path,declared_mime_type,declared_size) values
('31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',
 '11000000-0000-4000-8000-000000000001/incoming/31000000-0000-4000-8000-000000000001.jpg',
 '11000000-0000-4000-8000-000000000001/sealed/31000000-0000-4000-8000-000000000001.jpg','image/jpeg',100);

set local role service_role;
select extensions.throws_ok($$
  select public.create_report('11000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',
    (select payload from rimba_reporting_test_state),true)
$$,'23514','upload_not_finalized','Unfinalized evidence cannot be attached');
select extensions.throws_ok($$
  select public.claim_evidence_upload('31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000001')
$$,'42501','upload_owner_mismatch','Another user cannot claim an upload');
select extensions.is((public.claim_evidence_upload(
  '31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001')).status::text,
  'processing','An upload claim acquires a processing lease');
select extensions.throws_ok($$
  select public.claim_evidence_upload('31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000002')
$$,'40001','upload_processing_conflict','Concurrent upload finalization is serialized');
select extensions.is((public.complete_evidence_upload(
  '31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001',
  100,'image/jpeg',repeat('a',64))).status::text,'finalized','Validated sealed evidence can be finalized');
select extensions.is((public.complete_evidence_upload(
  '31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001',
  100,'image/jpeg',repeat('a',64))).status::text,'finalized','An identical finalization retry is idempotent');
select extensions.throws_ok($$
  select public.complete_evidence_upload('31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000001',101,'image/jpeg',repeat('b',64))
$$,'40001','upload_completion_conflict','A retry cannot replace finalized evidence metadata');

-- Call the mutating RPC exactly once; expanding (rpc()).* can call it per column.
update rimba_reporting_test_state set report_id = (
  select id from public.create_report('11000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',
    (select payload from rimba_reporting_test_state),true)
);
select extensions.is((select status::text from public.reports where id=(select report_id from rimba_reporting_test_state)),
  'pending_analysis','Created reports start pending analysis');
select extensions.is((select status::text from public.evidence_uploads where id='31000000-0000-4000-8000-000000000001'),
  'attached','Creating the report atomically consumes its receipt');
select extensions.is((select count(*) from public.report_updates where report_id=(select report_id from rimba_reporting_test_state)),
  1::bigint,'Report creation has exactly one audit event');
select extensions.is((select id from public.create_report('11000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',
  (select payload from rimba_reporting_test_state),true)),(select report_id from rimba_reporting_test_state),'Submission retries return the original report');
select extensions.throws_ok($$
  select public.create_report('11000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',
    (select payload || '{"title":"Different request title"}'::jsonb from rimba_reporting_test_state),true)
$$,'23505','idempotency_key_reused','An idempotency key cannot create a different report');
select extensions.throws_ok($$
  select public.create_report('11000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',
    (select payload from rimba_reporting_test_state),false)
$$,'23505','idempotency_key_reused','Simulation status cannot be changed by replay');
select extensions.is((select to_jsonb(s) from public.platform_statistics() s),(select stats_before from rimba_reporting_test_state),
  'Simulation reports do not alter public statistics');
select extensions.throws_ok($$
  select public.update_owned_report('11000000-0000-4000-8000-000000000002',(select report_id from rimba_reporting_test_state),1,
    (select payload from rimba_reporting_test_state))
$$,'42501','report_owner_required','Another user cannot correct a private report');
select extensions.throws_ok($$
  select public.update_owned_report('11000000-0000-4000-8000-000000000001',(select report_id from rimba_reporting_test_state),1,
    (select payload || '{"status":"verified"}'::jsonb from rimba_reporting_test_state))
$$,'22023','unsupported_report_fields','Corrections cannot forge verification status');
select extensions.is((public.update_owned_report('11000000-0000-4000-8000-000000000001',
  (select report_id from rimba_reporting_test_state),1,
  (select payload || '{"title":"[PENGUJIAN] Koreksi laporan"}'::jsonb from rimba_reporting_test_state))).revision,
  2,'Owner correction increments the report revision');
select extensions.is((select count(*) from public.report_updates where report_id=(select report_id from rimba_reporting_test_state)),
  2::bigint,'Correction and its audit entry commit together');
select extensions.throws_ok($$
  select public.update_owned_report('11000000-0000-4000-8000-000000000001',(select report_id from rimba_reporting_test_state),1,
    (select payload from rimba_reporting_test_state))
$$,'40001','report_revision_conflict','Stale corrections cannot overwrite a newer revision');
select extensions.is(public.delete_expired_evidence_upload('31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001'),
  false,'Cleanup never removes attached evidence');

reset role;
update public.reports set status='resolved' where id=(select report_id from rimba_reporting_test_state);
set local role service_role;
select extensions.throws_ok($$
  select public.update_owned_report('11000000-0000-4000-8000-000000000001',(select report_id from rimba_reporting_test_state),2,
    (select payload from rimba_reporting_test_state))
$$,'23514','report_not_editable','Handled reports cannot be silently edited by their owner');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select extensions.throws_ok($$ select id from public.evidence_uploads $$,'42501',null,'Authenticated clients cannot enumerate receipts');
reset role;

select * from extensions.finish(true);
rollback;
