-- RIMBAGUARD AI: PERBAIKAN KONFLIK HTTP 409
-- Salin SELURUH isi file ini ke Supabase SQL Editor -> New query -> Run.
-- Prasyarat: migrasi fondasi 001 dan pelaporan 002 sudah terpasang.
-- Mengganti hanya kode konflik bisnis pada lima fungsi; data dan izin dipertahankan.
-- Sepuluh pengujian memakai fixture simulasi yang dibatalkan melalui savepoint.
-- Hasil sukses: finish menampilkan 1..10 tanpa error. Aman dijalankan ulang.
-- Migrasi batal jika bentuk fungsi tidak sesuai atau pengujian gagal.
-- Perbaikan ini tidak menghentikan permintaan lama yang sudah terjebak retry.
-- Setelah berhasil, restart proyek dari Dashboard untuk membersihkan loop QA lama.
-- Rujukan resmi: https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b
-- Sumber: migrations/20261114000300_conflict_errors.sql dan ../tests/database/conflicts.test.sql.

begin;

-- BAGIAN 1: MIGRASI 003
-- Business conflicts must not use PostgreSQL serialization_failure (40001).
-- PostgREST 14 retries that state indefinitely; PT409 is a non-retryable HTTP 409.
-- Apply after migrations 001 and 002. Existing data, permissions and owners stay intact.

do $rimbaguard_conflict_errors$
declare
  target record;
  function_id regprocedure;
  definition text;
  previous_owner oid;
  previous_acl aclitem[];
  previous_definer boolean;
  previous_config text[];
  old_count integer;
  new_count integer;
  old_literal constant text := 'errcode = ''40001''';
  new_literal constant text := 'errcode = ''PT409''';
begin
  for target in
    select * from (values
      ('public.admin_change_report_status(uuid,uuid,integer,public.report_status,text)', 1),
      ('public.claim_evidence_upload(uuid,uuid,uuid)', 1),
      ('public.complete_evidence_upload(uuid,uuid,uuid,integer,text,text)', 2),
      ('public.fail_evidence_upload(uuid,uuid,uuid)', 1),
      ('public.update_owned_report(uuid,uuid,integer,jsonb)', 1)
    ) as allowlist(signature, expected_count)
  loop
    function_id := pg_catalog.to_regprocedure(target.signature);
    if function_id is null then
      raise exception 'Required RimbaGuard function is missing: %', target.signature;
    end if;
    select p.proowner, p.proacl, p.prosecdef, p.proconfig,
      pg_catalog.pg_get_functiondef(p.oid)
    into previous_owner, previous_acl, previous_definer, previous_config, definition
    from pg_catalog.pg_proc p where p.oid = function_id;

    old_count := (length(definition) - length(replace(definition, old_literal, ''))) / length(old_literal);
    new_count := (length(definition) - length(replace(definition, new_literal, ''))) / length(new_literal);
    if old_count = target.expected_count and new_count = 0 then
      -- pg_get_functiondef emits CREATE OR REPLACE with the existing signature,
      -- defaults, SECURITY DEFINER and SET options. Replacement preserves its OID/ACL.
      execute replace(definition, old_literal, new_literal);
    elsif old_count = 0 and new_count = target.expected_count then
      null; -- Already repaired: safe to rerun this migration/bundle.
    else
      raise exception 'Unexpected conflict definition; no repair applied: %', target.signature;
    end if;

    select pg_catalog.pg_get_functiondef(p.oid) into definition
    from pg_catalog.pg_proc p where p.oid = function_id;
    new_count := (length(definition) - length(replace(definition, new_literal, ''))) / length(new_literal);
    if strpos(definition, '40001') > 0 or new_count <> target.expected_count then
      raise exception 'Conflict replacement verification failed: %', target.signature;
    end if;
    if exists (
      select 1 from pg_catalog.pg_proc p where p.oid = function_id and (
        p.proowner is distinct from previous_owner or p.proacl is distinct from previous_acl
        or p.prosecdef is distinct from previous_definer or p.proconfig is distinct from previous_config
      )
    ) then
      raise exception 'Function security metadata changed; repair rolled back: %', target.signature;
    end if;
  end loop;
end;
$rimbaguard_conflict_errors$;


savepoint rimbaguard_conflict_checks;

-- BAGIAN 2: SEPULUH PENGUJIAN
-- Run after migrations 001, 002 and 003. Every fixture is rolled back.
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
select extensions.no_plan();

with targets(signature, expected_count) as (values
  ('public.admin_change_report_status(uuid,uuid,integer,public.report_status,text)', 1),
  ('public.claim_evidence_upload(uuid,uuid,uuid)', 1),
  ('public.complete_evidence_upload(uuid,uuid,uuid,integer,text,text)', 2),
  ('public.fail_evidence_upload(uuid,uuid,uuid)', 1),
  ('public.update_owned_report(uuid,uuid,integer,jsonb)', 1)
)
select extensions.ok(count(p.oid) = 5 and bool_and(
  strpos(p.prosrc, '40001') = 0
  and (length(p.prosrc) - length(replace(p.prosrc, 'errcode = ''PT409''', ''))) / length('errcode = ''PT409''') = t.expected_count
), 'All five RPCs use PT409 for exactly their intended business conflicts')
from targets t left join pg_proc p on p.oid = to_regprocedure(t.signature);

with targets(signature) as (values
  ('public.admin_change_report_status(uuid,uuid,integer,public.report_status,text)'),
  ('public.claim_evidence_upload(uuid,uuid,uuid)'),
  ('public.complete_evidence_upload(uuid,uuid,uuid,integer,text,text)'),
  ('public.fail_evidence_upload(uuid,uuid,uuid)'),
  ('public.update_owned_report(uuid,uuid,integer,jsonb)')
)
select extensions.ok(count(p.oid) = 5 and bool_and(p.prosecdef and p.proconfig @> array['search_path=""']::text[]),
  'Repaired RPCs retain SECURITY DEFINER and the empty search path')
from targets t left join pg_proc p on p.oid = to_regprocedure(t.signature);

with targets(signature) as (values
  ('public.admin_change_report_status(uuid,uuid,integer,public.report_status,text)'),
  ('public.claim_evidence_upload(uuid,uuid,uuid)'),
  ('public.complete_evidence_upload(uuid,uuid,uuid,integer,text,text)'),
  ('public.fail_evidence_upload(uuid,uuid,uuid)'),
  ('public.update_owned_report(uuid,uuid,integer,jsonb)')
)
select extensions.ok(bool_and(
  has_function_privilege('service_role', signature, 'EXECUTE')
  and not has_function_privilege('anon', signature, 'EXECUTE')
  and not has_function_privilege('authenticated', signature, 'EXECUTE')
), 'Only the server service role can execute the repaired application RPCs')
from targets;

insert into auth.users (id,email,raw_user_meta_data) values
  ('12000000-0000-4000-8000-000000000001','conflict-owner@example.invalid','{"full_name":"Conflict test owner"}'::jsonb),
  ('12000000-0000-4000-8000-000000000002','conflict-officer@example.invalid','{"full_name":"Conflict test officer"}'::jsonb);
-- Trusted fixture setup only; no user is promoted outside this rolled-back test.
update public.profiles set role='admin' where id='12000000-0000-4000-8000-000000000002';
insert into public.reports (
  id,user_id,report_code,title,category,description,image_path,
  latitude,longitude,incident_time,idempotency_key,is_simulation
) values (
  '22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001',
  'TEST-CONFLICT-REPAIR','[SIMULASI] Pengujian konflik','forest_fire',
  'Fixture pengujian konflik transaksi, bukan kejadian lingkungan yang sebenarnya.',
  '12000000-0000-4000-8000-000000000001/sealed/32000000-0000-4000-8000-000000000002.jpg',
  -3.8,102.2,'2020-01-01T00:00:00Z','42000000-0000-4000-8000-000000000001',true
);
update public.reports set revision=2,status='pending_verification' where id='22000000-0000-4000-8000-000000000001';
insert into public.evidence_uploads (
  id,user_id,incoming_path,sealed_path,declared_mime_type,declared_size
) values (
  '32000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001/incoming/32000000-0000-4000-8000-000000000001.jpg',
  '12000000-0000-4000-8000-000000000001/sealed/32000000-0000-4000-8000-000000000001.jpg',
  'image/jpeg',100
);
update public.evidence_uploads set status='processing',
  processing_token='52000000-0000-4000-8000-000000000001',
  processing_expires_at=clock_timestamp()+interval '120 seconds'
where id='32000000-0000-4000-8000-000000000001';
insert into public.evidence_uploads (
  id,user_id,incoming_path,sealed_path,declared_mime_type,declared_size
) values (
  '32000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001/incoming/32000000-0000-4000-8000-000000000002.jpg',
  '12000000-0000-4000-8000-000000000001/sealed/32000000-0000-4000-8000-000000000002.jpg',
  'image/jpeg',100
);
update public.evidence_uploads set status='finalized',sealed_size=100,
  sealed_mime_type='image/jpeg',sealed_sha256=repeat('a',64)
where id='32000000-0000-4000-8000-000000000002';

set local role service_role;
select extensions.throws_ok($$
  select public.admin_change_report_status('22000000-0000-4000-8000-000000000001',
    '12000000-0000-4000-8000-000000000002',1,'verified',null)
$$,'PT409','report_revision_conflict','Stale officer status changes fail immediately with PT409');
select extensions.throws_ok($$
  select public.update_owned_report('12000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000001',1,jsonb_build_object(
      'title','[SIMULASI] Pengujian konflik','category','forest_fire',
      'description','Fixture pengujian konflik transaksi, bukan kejadian lingkungan yang sebenarnya.',
      'evidencePath','12000000-0000-4000-8000-000000000001/sealed/32000000-0000-4000-8000-000000000002.jpg',
      'latitude',-3.8,'longitude',102.2,'incidentTime','2020-01-01T00:00:00Z'))
$$,'PT409','report_revision_conflict','Stale owner corrections fail immediately with PT409');
select extensions.throws_ok($$
  select public.claim_evidence_upload('32000000-0000-4000-8000-000000000001',
    '12000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000002')
$$,'PT409','upload_processing_conflict','A competing upload lease returns PT409');
select extensions.throws_ok($$
  select public.complete_evidence_upload('32000000-0000-4000-8000-000000000001',
    '12000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000002',100,'image/jpeg',repeat('a',64))
$$,'PT409','upload_lease_conflict','Completion with the wrong lease returns PT409');
select extensions.throws_ok($$
  select public.fail_evidence_upload('32000000-0000-4000-8000-000000000001',
    '12000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000002')
$$,'PT409','upload_lease_conflict','Failure recovery with the wrong lease returns PT409');
select extensions.throws_ok($$
  select public.complete_evidence_upload('32000000-0000-4000-8000-000000000002',
    '12000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001',101,'image/jpeg',repeat('b',64))
$$,'PT409','upload_completion_conflict','Conflicting finalized evidence metadata returns PT409');
select extensions.ok(
  (select revision=2 and status='pending_verification' and title='[SIMULASI] Pengujian konflik'
    from public.reports where id='22000000-0000-4000-8000-000000000001')
  and (select count(*)=1 from public.report_updates where report_id='22000000-0000-4000-8000-000000000001')
  and (select status='processing' and processing_token='52000000-0000-4000-8000-000000000001'::uuid
    from public.evidence_uploads where id='32000000-0000-4000-8000-000000000001')
  and (select status='finalized' and sealed_size=100 and sealed_sha256=repeat('a',64)
    from public.evidence_uploads where id='32000000-0000-4000-8000-000000000002'),
  'All rejected conflicts preserve report, audit, active lease and sealed metadata'
);
reset role;
select * from extensions.finish(true);

rollback to savepoint rimbaguard_conflict_checks;
release savepoint rimbaguard_conflict_checks;
commit;
