# Supabase foundation

The migration defines the PRD tables, strict read policies, private evidence storage, and server-only rate-limit/status operations. It contains no accounts, reports, demonstration data, or keys.

Apply it to a new disposable Supabase project first, using your normal Supabase migration workflow or the Dashboard SQL Editor. Keep the migration tracked as the source of schema truth. Database application and policy tests remain pending until a real project or local Supabase instance is configured.

## Apply through Supabase SQL Editor

Project URL and API keys connect Auth, the Data API, and Storage; they do not provide a SQL migration connection.

1. Open the intended project in Supabase Dashboard, then **SQL Editor → New query**.
2. Copy the entire contents of [20261114000100_foundation.sql](migrations/20261114000100_foundation.sql), paste into that query, and run it once on the new project.
3. Confirm execution completes without an error. This creates all five application tables, constraints, grants/RLS, privileged workflow functions, and the private `report-evidence` bucket.
4. Run `npm.cmd run check:services` locally. Missing-schema code `PGRST205` means the requested table is not available to the Data API; a successful Auth request alone does not mean migrations are applied.
5. Run the full rollback-based [database test suite](../tests/database/foundation.test.sql) in a disposable database to verify role isolation and workflow rules. API connectivity checks do not replace this suite.

Alternatively, configure a private `SUPABASE_DB_URL` in local `.env` using the PostgreSQL connection string from **Connect**. This is different from `SUPABASE_URL`, which is the HTTP project URL. A database connection permits an authorized migration runner to apply SQL and run rollback-based tests without putting credentials in shell arguments or source control. Do not paste either credential into chat.

## Access boundaries

- `anon` cannot read the domain tables or invoke privileged functions.
- `authenticated` can read its own reports, normalized AI results, and priority histories. An admin can read all reports. Raw AI responses are excluded from authenticated column grants. Always select explicit columns on `ai_analyses`; `SELECT *` is intentionally denied for user-scoped clients.
- Raw `report_updates` is admin-only because notes may contain internal information. Later owner-facing status history must be an authorized server projection.
- Browser roles cannot insert, update, or delete reports, profiles, analysis, priorities, or audit records. Public registration cannot set an admin role. The server still must validate every protected request and derive actor identity from its verified session.
- The service role can create reports and analyses, finalize active analysis attempts, and insert priority history. Report mutations need narrow RPCs; status and audit are already one atomic RPC. Owner corrections and AI acceptance RPCs will be added in their corresponding phases.
- `consume_rate_limit(p_key, p_limit, p_window_seconds)` is service-only and atomic across server instances. Keys must be derived by the server, such as operation plus user UUID or a hashed client identifier. Do not put raw access tokens or private form content into rate-limit keys. Arrange periodic deletion of expired windows when deployment scheduling is configured.

These controls combine grants and RLS; neither replaces authorization in Nuxt. The service-role credential bypasses RLS and must never be returned to browsers or logged. The role check in `admin_change_report_status` supplements, rather than authenticates, its server-supplied actor ID. See the official [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) and [Storage access controls](https://supabase.com/docs/guides/storage/security/access-control).

## Evidence lifecycle

1. The server creates a unique `<user-id>/incoming/<uuid>.<extension>` path and issues a signed upload token with overwrite disabled.
2. The browser uploads directly into the private `report-evidence` bucket, using only the scoped token. Reusable project credentials stay on the server.
3. The server downloads and checks actual bytes, size, decoded dimensions, MIME/signature agreement, and ownership. Bucket MIME metadata alone is insufficient.
4. After validation/normalization, the server stores an immutable `<user-id>/sealed/<uuid>.jpg`, `.png`, or `.webp` object with overwrite disabled and attaches that sealed path to the report. The migration rejects any report evidence path outside this namespace.
5. The server returns an expiring signed read URL only to an authorized owner/admin. An incoming upload token cannot reference the sealed object. Never store the read URL in the report row.
6. Cleanup removes only abandoned incoming/unreferenced objects after a grace period. Attached sealed evidence is excluded.

Use Storage APIs for object creation/deletion, not direct writes to `storage.objects`. Confirm direct upload and replay/overwrite behavior against the actual configured Storage service before marking Phase 2 complete.

## Restricted first-admin provisioning

1. Register an ordinary email/password account through Supabase Auth with a real controlled email, then confirm that email. The database trigger ignores any metadata role and creates `public`.
2. In the Supabase Dashboard Auth Users page, copy that verified account's UUID. Confirm the person and environment before promoting it.
3. From the project owner's SQL Editor or a direct trusted database connection, execute a transaction using the actual UUID, not a password or API key:

```sql
begin;
update public.profiles
set role = 'admin'
where id = '<verified-auth-user-uuid>'::uuid
  and exists (
    select 1 from auth.users u
    where u.id = profiles.id and u.email_confirmed_at is not null
  );
-- Verify that exactly the intended, confirmed account is now an admin.
select id, role from public.profiles where id = '<verified-auth-user-uuid>'::uuid;
commit;
```

This is an operator procedure, not an application endpoint or a seed containing credentials. Do not expose it through public registration or profile updates. No API role has permission to change `profiles.role`.

## Database verification

`tests/database/foundation.test.sql` contains pgTAP checks for trusted role creation, grants/RLS, owner isolation, immutable audit, protected storage, rate limiting, and transactional workflow rules. It uses isolated synthetic fixtures inside a rolled-back transaction. It must only be run against a disposable test database.

With Supabase CLI and Docker configured, use the Supabase project's database test command with the SQL path, or a `pg_prove` connection to the disposable database. The suite enables pgTAP in `extensions` inside its transaction. Never run its role impersonation fixtures against production. See [Supabase database testing](https://supabase.com/docs/guides/database/testing).

`shared/types/database.ts` is a handwritten initial representation of this migration. Replace/regenerate it with Supabase CLI-generated database types after the migration is successfully applied; until then it must not be described as generated from a live database.

## Phase 2 reporting migration

Apply [20261114000200_reporting.sql](migrations/20261114000200_reporting.sql) after the foundation migration. It adds the server-only `evidence_uploads` ledger, finalization leases, exact idempotency binding, transactional receipt-bound report creation, owned corrections with revision checks, and actual platform aggregates. It contains no seeded accounts/reports. Do not rerun migration 001 to install these additions.

Then run [reporting.test.sql](../tests/database/reporting.test.sql) in a separate SQL Editor query. It rolls back every test fixture and calls `finish(true)` so a failed assertion raises an error. The existing foundation suite and this reporting suite cover different rules; both remain tracked. Use `npm.cmd run check:reporting` to verify read-only readiness from the app environment.

Evidence receipts have a two-hour lifetime. Actual stored bytes are checked/normalized by the server before completion; SQL receipts alone do not certify image validity. `create_report` consumes one finalized receipt and writes its audit atomically. A request retry returns the same report only for the same owner, idempotency key, canonical payload, and simulation flag. Corrections retain report identity, increment revision, reset analysis to pending, withdraw publication, and preserve history.

When more information is requested, that specific request note is visible to the owner so they can respond; other internal officer notes stay private. `RIMBAGUARD_TEST_USER_ID` is a server-only operator setting for a dedicated simulation account. Clients cannot choose it or submit simulation flags. Public statistics/maps exclude simulated reports.
