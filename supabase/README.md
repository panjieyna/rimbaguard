# Supabase foundation

The migrations define PRD tables, strict read policies, private evidence storage, and server-only transactional operations. They contain no production accounts, reports, or keys. Test fixtures are rolled back.

Apply migrations to a disposable Supabase project first, using your normal migration workflow or the Dashboard SQL Editor. Keep them tracked as the source of schema truth. The current application uses migrations `001`–`008`; see the implementation checklists for hosted verification records.

## Report assistant (008)

After migrations `001`–`006`, run the complete [JALANKAN_ASISTEN_PELAPORAN.sql](JALANKAN_ASISTEN_PELAPORAN.sql) bundle in a new SQL Editor query. Migration `007` adds account photos and is independent of the assistant. Expected `finish`: `1..26` without errors. The bundle commits the schema but rolls back its fixtures. The user confirmed this hosted result on 18 November 2026.

Private drafts use owner-only RLS, server-only RPC writes, a 90-second inference lease, optimistic versions and receipt-bound expiration (two hours). `create_assisted_report` validates confirmation and complete answers, calls the existing idempotent report transaction, and links the draft atomically. Never insert synthetic successful AI results into a live project to make a demo appear operational. Provider failures are saved as failed drafts with no result.

## Apply through Supabase SQL Editor

Project URL and API keys connect Auth, the Data API, and Storage; they do not provide a SQL migration connection.

1. Open the intended project in Supabase Dashboard, then **SQL Editor → New query**.
2. Copy the entire contents of [20261114000100_foundation.sql](migrations/20261114000100_foundation.sql), paste into that query, and run it once on the new project.
3. Confirm execution completes without an error. This creates all five application tables, constraints, grants/RLS, privileged workflow functions, and the private `report-evidence` bucket.
4. In separate queries, apply [002 reporting](migrations/20261114000200_reporting.sql), then [003 conflict errors](migrations/20261114000300_conflict_errors.sql). Do not rerun `001` or `002` on an installed project. Apply all three before starting REST tests: the earlier business-conflict code is unsafe on PostgREST 14.
5. Run `npm.cmd run check:reporting` locally. Missing-schema code `PGRST205` means the requested table is not available to the Data API; successful Auth checks alone do not prove migration readiness.
6. Run the rollback-based [foundation](../tests/database/foundation.test.sql), [reporting](../tests/database/reporting.test.sql), and [conflict](../tests/database/conflicts.test.sql) suites separately. Their expected counts are 47, 29, and 10. Current SQL expectations require migration `003`. API connectivity checks do not replace these suites.

Alternatively, configure a private `SUPABASE_DB_URL` in local `.env` using the PostgreSQL connection string from **Connect**. This is different from `SUPABASE_URL`, which is the HTTP project URL. A database connection permits an authorized migration runner to apply SQL and run rollback-based tests without putting credentials in shell arguments or source control. Do not paste either credential into chat.

## Access boundaries

- `anon` cannot read the domain tables or invoke privileged functions.
- `authenticated` can read its own reports, normalized AI results, and priority histories. An admin can read all reports. Raw AI responses are excluded from authenticated column grants. Always select explicit columns on `ai_analyses`; `SELECT *` is intentionally denied for user-scoped clients.
- Raw `report_updates` is admin-only because notes may contain internal information. Later owner-facing status history must be an authorized server projection.
- Browser roles cannot insert, update, or delete reports, profiles, analysis, priorities, or audit records. Public registration cannot set an admin role. The server still must validate every protected request and derive actor identity from its verified session.
- The service role creates/corrects reports through narrow transactional RPCs; direct report insertion is revoked by `002`. It can insert analysis attempts and priority histories. Status/audit and owned correction/audit are atomic; AI acceptance RPCs remain for Phase 3.
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

## Phase 4 priority and maps migration

After `001`–`004`, run the entire [Phase 4 bundle](JALANKAN_FASE_4.sql). It applies [20261115000500_priority.sql](migrations/20261115000500_priority.sql) and runs 66 rollback-based checks from [priority.test.sql](../tests/database/priority.test.sql) inside a savepoint. Expected `finish`: `1..66`. The bundle is idempotent.

- Scoring v1 is calculated only in the database. `public.refresh_threat_priorities` is service-only, bounded (at most 500 iterations, 100 requested IDs), and serialized with a transaction advisory lock; a busy call returns immediately instead of blocking a read. An unchanged recalculation updates freshness only and appends no history.
- Direct `INSERT` on `threat_priorities` is revoked from `service_role`; history remains immutable. Private scoring helpers are not executable by any application role.
- `reports.updated_at` no longer changes when only `priority_dirty` or `priority_recalculate_at` move.
- `public.admin_map_reports` rechecks that the server-supplied actor is an admin. `public.public_map_reports` returns only published real reports, an explicit field allowlist and coordinates rounded to 0.01 degree. Both are service-only and called by Nuxt.
- The effective category uses the content revision (latest `report_created`/`report_corrected` audit event), because officer status changes also increment `reports.revision`. Phase 5 admin content corrections must add their audit action to `private.report_content_revision`.

## Phase 5 officer workflow migration

After `001`–`005`, run the entire [Phase 5 bundle](JALANKAN_FASE_5.sql). It applies [20261115000600_admin_workflow.sql](migrations/20261115000600_admin_workflow.sql) and runs 64 rollback-based checks from [admin.test.sql](../tests/database/admin.test.sql). Expected `finish`: `1..64`. The bundle is idempotent.

- Status changes stay in `public.admin_change_report_status`. The new service-only RPCs `admin_publish_report`, `admin_withdraw_publication`, `admin_set_officer_category` and `admin_add_report_note` each recheck the actor's admin role (`private.require_admin`). Every RPC except the note RPC locks the report and checks the expected revision. Each writes its audit event in the same transaction, so a failed audit write rolls the action back.
- Publication requires a real report in `verified`, `in_progress` or `resolved`. The audit keeps the approved public wording, and withdrawal requires an internal reason. Internal notes do not change the revision.
- `admin_map_reports` keeps its Phase 4 signature. It and the new `admin_report_queue` share `private.admin_report_page`, so the map and the queue always agree.
- `admin_analytics` separates real and simulation data and uses WIB calendar days. The statistic definitions are in [docs/API.md](../docs/API.md).

## Profile photos (migration 007)

After `001`–`006`, run the entire [profile photo bundle](JALANKAN_FASE_6_PROFIL.sql). It applies [20261117000700_profile_photos.sql](migrations/20261117000700_profile_photos.sql): a private `profile-photos` bucket (WebP only, 256 KB) and a restrictive policy that keeps every browser role out, like `report-evidence`. The bundle verifies both and is idempotent. It creates no data.

- The server re-encodes each photo to a 256 × 256 WebP without metadata and stores it as `<user-id>/<uuid>.webp`. The current path lives in the user's Auth `app_metadata`, which only the service role can write. The server accepts it only inside the owner's namespace and serves only the signed-in user's own photo.
- No table or grant changes are needed. Name changes use the existing service-role grant on `profiles.full_name`; password changes go through Supabase Auth after the current password is proven on a separate session.
- Without this bundle the feature still works: on the first upload the server creates the same private bucket through the Storage API (no browser policy grants access to it) and retries once. The bundle adds the restrictive policy as a second guard against a future broad storage policy, so running it is still recommended.

## Required business-conflict repair

For a project that already has `001` and `002`, run the entire [single repair bundle](JALANKAN_PERBAIKAN_KONFLIK.sql). It applies `003` and runs 10 checks inside a savepoint; fixtures roll back and the repair commits only if the checks pass. Expected `finish`: `1..10`. The bundle is idempotent and preserves function owners, grants, security-definer settings, data, and signatures.

The five allowlisted RPCs now raise `PT409` for business conflicts. Manually raised `40001` can trigger infinite retries on PostgREST 14; see [Supabase's official explanation](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b). A changed function does not stop loops already running. After applying the repair, restart the project in Dashboard to clear the known QA loops, or use the documented log-matched backend termination procedure. The bundle does not terminate sessions automatically. Resume REST conflict tests only after repair and cleanup.
