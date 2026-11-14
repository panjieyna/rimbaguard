-- Run only against a disposable Supabase test database. All fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
select extensions.no_plan();

select extensions.ok(
  (select bool_and(relrowsecurity) from pg_class
   where oid in ('public.profiles'::regclass, 'public.reports'::regclass,
     'public.ai_analyses'::regclass, 'public.threat_priorities'::regclass,
     'public.report_updates'::regclass, 'private.rate_limit_windows'::regclass)),
  'RLS is enabled on all application tables'
);
select extensions.ok(not has_table_privilege('anon', 'public.reports', 'SELECT'),
  'Anonymous role has no raw report SELECT grant');
select extensions.ok(not has_table_privilege('authenticated', 'public.reports', 'INSERT'),
  'Citizen role has no direct report INSERT grant');
select extensions.ok(not has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE'),
  'Citizen role cannot update authorization roles');
select extensions.ok(not has_column_privilege('service_role', 'public.profiles', 'role', 'UPDATE'),
  'Application service cannot directly promote profiles');
select extensions.ok(not has_column_privilege('service_role', 'public.reports', 'status', 'UPDATE'),
  'Report status changes require a narrow RPC');
select extensions.ok(not has_function_privilege('anon',
  'public.consume_rate_limit(text,integer,integer)', 'EXECUTE'),
  'Anonymous role cannot invoke rate-limit writes');
select extensions.ok(not has_function_privilege('authenticated',
  'public.admin_change_report_status(uuid,uuid,integer,public.report_status,text)', 'EXECUTE'),
  'Browser sessions cannot invoke the privileged status RPC');

insert into auth.users (id, email, raw_user_meta_data) values
  ('10000000-0000-4000-8000-000000000001', 'rls-citizen-a@example.invalid',
    '{"full_name":"Test Citizen A","role":"admin"}'::jsonb),
  ('10000000-0000-4000-8000-000000000002', 'rls-citizen-b@example.invalid',
    '{"full_name":"Test Citizen B"}'::jsonb),
  ('10000000-0000-4000-8000-000000000003', 'rls-officer@example.invalid',
    '{"full_name":"Test Officer"}'::jsonb);

select extensions.is(
  (select role::text from public.profiles where id = '10000000-0000-4000-8000-000000000001'),
  'public', 'Registration ignores an admin role supplied in user metadata'
);

-- This is trusted test setup, modeling the documented operator-only promotion.
update public.profiles set role = 'admin'
where id = '10000000-0000-4000-8000-000000000003';

insert into public.reports (
  id, user_id, report_code, title, category, description, image_path,
  latitude, longitude, incident_time, idempotency_key, is_simulation
) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
    'TEST-RLS-A', 'Laporan pengujian A', 'forest_fire',
    'Fixture pengujian terisolasi, bukan laporan kejadian aktual.',
    '10000000-0000-4000-8000-000000000001/sealed/30000000-0000-4000-8000-000000000001.jpg',
    0, 0, now() - interval '1 hour', '40000000-0000-4000-8000-000000000001', true),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002',
    'TEST-RLS-B', 'Laporan pengujian B', 'forest_fire',
    'Fixture pengujian terisolasi, bukan laporan kejadian aktual.',
    '10000000-0000-4000-8000-000000000002/sealed/30000000-0000-4000-8000-000000000002.jpg',
    0, 0, now() - interval '1 hour', '40000000-0000-4000-8000-000000000002', true);

select extensions.is(
  (select count(*) from public.report_updates
   where report_id = '20000000-0000-4000-8000-000000000001' and action = 'report_created'),
  1::bigint, 'Creation automatically records an audit event in the same transaction'
);

insert into public.ai_analyses (
  id, report_id, report_revision, model_name, prompt_version
) values (
  '50000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001', 1, 'test-only-provider', 'test-only-v1'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select extensions.is(
  (select count(*) from public.reports where id = '20000000-0000-4000-8000-000000000001'),
  1::bigint, 'Citizen can read own private report'
);
select extensions.is(
  (select count(*) from public.reports where id = '20000000-0000-4000-8000-000000000002'),
  0::bigint, 'Citizen cannot read another citizen private report'
);
select extensions.is(
  (select count(*) from public.profiles where id = '10000000-0000-4000-8000-000000000002'),
  0::bigint, 'Citizen cannot read another citizen profile'
);
select extensions.is(
  (select count(id) from public.ai_analyses where report_id = '20000000-0000-4000-8000-000000000001'),
  1::bigint, 'Owner can read the allowed normalized analysis columns'
);
select extensions.is(
  (select count(*) from public.report_updates where report_id = '20000000-0000-4000-8000-000000000001'),
  0::bigint, 'Raw internal audit notes are not exposed to report owners'
);
select extensions.throws_ok($$
  select raw_response from public.ai_analyses
  where report_id = '20000000-0000-4000-8000-000000000001'
$$, '42501', null, 'Owner cannot read raw model payloads');
select extensions.throws_ok($$
  update public.profiles set role = 'admin'
  where id = '10000000-0000-4000-8000-000000000001'
$$, '42501', null, 'Citizen cannot promote their own role');
select extensions.throws_ok($$
  update public.reports set status = 'verified'
  where id = '20000000-0000-4000-8000-000000000001'
$$, '42501', null, 'Citizen cannot forge verification status');
select extensions.throws_ok($$
  delete from public.reports where id = '20000000-0000-4000-8000-000000000001'
$$, '42501', null, 'Citizen cannot delete a report');
select extensions.throws_ok($$
  select * from public.consume_rate_limit('test:forged', 2, 60)
$$, '42501', null, 'Citizen cannot reset or consume another rate-limit key');

select set_config('request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select extensions.is(
  (select count(id) from public.ai_analyses where report_id = '20000000-0000-4000-8000-000000000001'),
  0::bigint, 'Another citizen cannot read analysis history'
);

select set_config('request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select extensions.is(
  (select count(*) from public.reports where id in (
    '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002')),
  2::bigint, 'Officer can read both fixture reports'
);
select extensions.is(
  (select count(*) from public.report_updates where report_id = '20000000-0000-4000-8000-000000000001'),
  1::bigint, 'Officer can read internal audit history'
);
select extensions.throws_ok($$
  update public.reports set status = 'verified'
  where id = '20000000-0000-4000-8000-000000000001'
$$, '42501', null, 'Even an officer browser session cannot bypass the status API/RPC');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok($$
  select id from public.reports where id = '20000000-0000-4000-8000-000000000001'
$$, '42501', null, 'Anonymous users cannot read raw incident rows');
select extensions.throws_ok($$
  select id from public.profiles where id = '10000000-0000-4000-8000-000000000001'
$$, '42501', null, 'Anonymous users cannot read reporter identities');

reset role;
-- Trusted setup of a report ready for human review.
update public.reports set status = 'pending_verification'
where id in ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002');

set local role service_role;
select extensions.throws_ok($$
  select public.admin_change_report_status(
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001', 1, 'verified', null)
$$, '42501', 'admin_required', 'Status RPC independently rejects a citizen actor');
select extensions.is(
  (public.admin_change_report_status(
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000003', 1, 'verified', 'Bukti diperiksa untuk pengujian.')
  ).status::text,
  'verified', 'Officer can verify through the privileged RPC'
);
select extensions.is(
  (select revision from public.reports where id = '20000000-0000-4000-8000-000000000001'),
  2, 'Status write increments the concurrency revision'
);
select extensions.is(
  (select count(*) from public.report_updates
   where report_id = '20000000-0000-4000-8000-000000000001' and action = 'status_changed'
     and actor_id = '10000000-0000-4000-8000-000000000003'
     and previous_status = 'pending_verification' and new_status = 'verified'),
  1::bigint, 'Status change records its actor and before/after status atomically'
);
select extensions.throws_ok($$
  select public.admin_change_report_status(
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000003', 1, 'in_progress', null)
$$, '40001', 'report_revision_conflict', 'Stale revisions cannot overwrite human decisions');
select extensions.throws_ok($$
  select public.admin_change_report_status(
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000003', 2, 'resolved', null)
$$, '23514', 'invalid_status_transition', 'Cannot skip in-progress response tracking');
select extensions.is(
  (select count(*) from public.report_updates
   where report_id = '20000000-0000-4000-8000-000000000001' and action = 'status_changed'),
  1::bigint, 'Rejected transitions do not append misleading audit events'
);
select extensions.is(
  (public.admin_change_report_status(
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000003', 2, 'in_progress', null)).status::text,
  'in_progress', 'Verified report can enter response handling'
);
select extensions.is(
  (public.admin_change_report_status(
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000003', 3, 'resolved', null)).status::text,
  'resolved', 'In-progress report can be resolved'
);
select extensions.is(
  (public.admin_change_report_status(
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003', 1, 'rejected', 'Bukti tidak memadai pada fixture.')).status::text,
  'rejected', 'A rejection remains rejected, not resolved'
);
select extensions.throws_ok($$
  select public.admin_change_report_status(
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003', 2, 'resolved', null)
$$, '23514', 'invalid_status_transition', 'A rejected report cannot be silently resolved');

select extensions.is((select allowed from public.consume_rate_limit('test:shared-window', 2, 60)),
  true, 'Rate limiter permits the first request');
select extensions.is((select remaining from public.consume_rate_limit('test:shared-window', 2, 60)),
  0, 'Rate limiter counts the second request in its persisted window');
select extensions.is((select allowed from public.consume_rate_limit('test:shared-window', 2, 60)),
  false, 'Rate limiter blocks a request over the configured limit');
select extensions.ok((select retry_after_seconds > 0 from public.consume_rate_limit('test:shared-window', 2, 60)),
  'Denied requests include a retry-after interval');
select extensions.throws_ok($$
  select * from public.consume_rate_limit('test:invalid', 0, 60)
$$, '22023', 'invalid_rate_limit_configuration', 'Invalid rate-limit configuration is rejected');

reset role;
select extensions.throws_ok($$
  delete from public.report_updates where report_id = '20000000-0000-4000-8000-000000000001'
$$, '23514', 'history_is_immutable', 'Audit records cannot be deleted even through a privileged SQL mutation');
select extensions.is(
  (select public from storage.buckets where id = 'report-evidence'),
  false, 'Evidence bucket is private'
);
select extensions.is(
  (select file_size_limit from storage.buckets where id = 'report-evidence'),
  5000000::bigint, 'Evidence bucket enforces the specified five-million-byte limit'
);
select extensions.ok(
  (select allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
   from storage.buckets where id = 'report-evidence'),
  'Evidence bucket allows only the specified MIME types'
);
select extensions.ok(exists (
  select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'rimbaguard_evidence_server_only' and permissive = 'RESTRICTIVE'
), 'Private evidence has a restrictive browser policy even if another bucket adds a permissive policy');

select * from extensions.finish();
rollback;
