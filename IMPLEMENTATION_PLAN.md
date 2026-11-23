# RimbaGuard implementation plan

Planning baseline: 14 November 2026, Asia/Jakarta. Source of product requirements: [PRD.md](PRD.md), version 1.0.

This document tracks implementation and verification. A checked phase means its acceptance checks passed; a page rendering, an unavailable-service message, or a mocked integration does not complete a phase.

## Inspection and current status

- [x] Read all 1,673 lines of the supplied PRD before writing application code.
- [x] Inspect the workspace, including hidden entries and applicable ancestor instructions.
- [x] Confirm the workspace initially contains no files, application, dependency manifest, lockfile, environment file, tests, or Git repository.
- [x] Preserve the supplied attachment as `PRD.md`, unchanged; verify its SHA-256 matches the source.
- [x] Inspect the development tools and check service-variable presence without printing values.
- [x] Review requirements and security architecture independently before setting the implementation sequence.
- [x] Create this phased checklist with acceptance gates and explicit product assumptions.
- [x] Phase 1: project foundation.
- [x] Phase 2: public application and persisted reporting.
- [x] Phase 3: AI integration.
- [x] Phase 4: threat intelligence and maps.
- [x] Phase 5: administration and response workflow.
- [ ] Phase 6: integrated QA and deployment preparation.

Available: Node.js `24.21.0`, npm `11.19.0` through `npm.cmd`, Git `2.55.0.windows.5`, and Bun. Use npm and one `package-lock.json`; do not mix package managers. PowerShell blocks `npm.ps1`, so use `npm.cmd` without changing execution policy. No Supabase CLI or pnpm was found on PATH. Node/package availability does not establish registry connectivity.

Phases 1 and 2 are complete. Foundation/reporting/repair SQL results report `1..47`, `1..29`, and `1..10`; all 11 readiness probes and the complete 13-test browser/API suite passed after the hosted repair/restart. A subsequent local-origin regression fix passed 173 unit tests and 12 focused browser/public tests, with isolated full type checking and production build passing without changing the active development types. The user explicitly confirms receiving the registration email, confirming it, and logging in. Phase 3 is complete as of 15 November 2026: with `GEMINI_MODEL=gemini-3.5-flash`, the live Gemini retry/concurrency acceptance test passed and one validated analysis was persisted (see the Phase 3 validation record). Phase 4 is complete as of 15 November 2026: the hosted bundle returned `1..66`, and the scoring, officer map and public map passed live browser/API tests (see the Phase 4 implementation record). Phase 5 is complete as of 15 November 2026: the hosted bundle returned `1..64`, and the officer workflow passed live browser/API tests. The 5 MB upload test awaits a faster connection (see the Phase 5 implementation record). Phase 6 remains open.

## Product and architecture decisions

1. **Keep the specified stack.** Nuxt 4, Vue Composition API, strict TypeScript, Tailwind CSS, Nuxt server APIs, Supabase Auth/PostgreSQL/Storage, Gemini, Leaflet/OpenStreetMap, Zod, and Chart.js. Pin Nuxt to the 4.x line and record resolved compatible dependency versions in the lockfile. Add map, AI, and chart dependencies in their respective phases. Use the official Tailwind Vite integration and Nuxt 4 `app/`, `server/`, and `shared/` directories. See [Nuxt structure](https://nuxt.com/docs/4.x/directory-structure) and [Tailwind's Nuxt guide](https://tailwindcss.com/docs/installation/framework-guides/nuxt).
2. **Use Bahasa Indonesia for the application.** Preserve the specified English hero headline and brand tagline. Use the exact PRD forest palette, Inter, generous whitespace, 8–12 px radii, subtle borders, and visible focus. Check text contrast rather than assuming every palette combination is accessible. Use licensed tropical forest photography with attribution where required.
3. **Keep every reusable API key on the server.** The master instruction takes precedence over the PRD's public Supabase key variable name. Prefer private `SUPABASE_URL` and `SUPABASE_ANON_KEY` configuration, alongside private `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY`; only the application URL belongs in public runtime configuration. Keep the original PRD unchanged and explain the naming decision in `.env.example` and README. Browser authentication and data access use Nuxt endpoints; no browser Supabase client needs a reusable project key.
4. **Use server-managed sessions.** Supabase Auth remains responsible for password hashing and account lifecycle. Nuxt handles registration, login, logout, email-confirmation callback, refresh, and session inspection using secure HttpOnly cookies. Validate identity server-side and obtain current role from protected database state. Do not authorize using an unverified session object. Add same-origin/CSRF checks for cookie-authenticated mutations. See [Supabase server authentication](https://supabase.com/docs/guides/auth/server-side/creating-a-client).
5. **Apply authorization twice.** All protected APIs enforce identity, ownership, and role. RLS and column/function permissions independently prevent direct database access from bypassing business rules. A registration trigger always creates role `public`; users cannot modify roles. Provision the first admin through a documented restricted operator procedure, never public registration or hardcoded credentials. Use request-scoped user credentials for ordinary database access; isolate narrowly scoped privileged operations.
6. **Persist evidence and reports before AI.** Return a durable report ID after creation. The reporting flow then invokes the bounded analysis endpoint automatically and awaits its result. Store analysis attempts and recover interrupted attempts through expiring processing leases. Do not rely on detached background promises. A reload can retrieve the report and resume or retry authorized analysis.
7. **Separate AI from scoring.** `server/services/ai/threat-analysis.ts` invokes a replaceable provider and validates structured output. `server/services/threat-priority.ts` computes deterministic rules; model confidence never replaces a scoring component. Missing AI leaves the submitted category available for a clearly labeled provisional priority.
8. **Publish deliberately.** Anonymous visitors receive aggregate platform statistics and an explicit public-safe map projection. Reports are private by default. Publication requires officer approval and safe summary review; only verified, in-progress, or resolved reports are eligible. Exclude identities, exact coordinates, evidence URLs, raw descriptions, AI payloads, and internal notes. Derive rounded coordinates from real submitted points and label them approximate; retain the exact point for the owner/admin. Use `/map?report=<id>` for public-safe details. Keep `/reports/[id]` owner/admin-only. Newly submitted reports appear immediately on the officer map; publication to the public map is a separate decision.
9. **Distinguish zero from unavailable.** A successful empty query returns zero/empty states. Missing configuration or a failed query returns an explicit unavailable state. Do not substitute zeros for connectivity failures or generate sample statistics, markers, charts, AI results, or satellite layers.
10. **Implement the detailed mandatory behavior.** Own-report history, map filters, dashboard aggregates, and the three specified dashboard charts remain in the MVP despite broader secondary-feature wording. `/about` provides the required product explanation. Analytics uses the same real aggregates; settings provides functional account/session controls and non-secret service availability. Exports and broader education wait until the MVP passes its gates. Do not ship inert navigation.

## Data, upload, and workflow contracts

Use the five PRD domain tables with foreign keys, check constraints, indexes, timezone-aware timestamps, RLS, and generated TypeScript database types:

| Table | Required implementation details |
| --- | --- |
| `profiles` | References `auth.users`; trusted role assignment; restrict editable profile columns. |
| `reports` | Required evidence and valid coordinates; unique report code; owner-scoped idempotency key; private evidence object path; revision/concurrency guard; publication controls; explicit simulation flag. |
| `ai_analyses` | Append-only attempt history; all validated output fields, including `reasoning_summary` and `needs_human_verification`; model/prompt version; report revision; processing lease; safe failure code. |
| `threat_priorities` | Append-only calculations; all component inputs and scores, effective category/source, nearby count, total, explanation, scoring version, and calculation time. |
| `report_updates` | Immutable events with actor type/user, action, before/after status, safe note, report revision, and timestamp. Extend the recommended `admin_id` model to represent owner and system actions too. |

Add only supporting persistence required by implemented behavior, such as atomic rate-limit windows. Keep scoring configuration in versioned server constants initially. Public aggregate and map queries must use restricted allowlisted projections, not unrestricted report serialization. Audit evidence, AI histories, and scoring histories are not writable by public clients.

Upload contract:

- Accept JPEG, PNG, and WebP with a documented maximum of 5,000,000 bytes, validated in the browser, bucket configuration, and server finalization.
- Nuxt authorizes an upload and generates a unique owner-scoped object path. The browser uploads directly to private Supabase Storage with a scoped signed upload URL; it does not receive a reusable project API key.
- Finalization verifies actual stored size, file signature/decodability, MIME agreement, ownership, and object existence before attaching evidence to a report. Bound decoded image dimensions; strip image metadata when normalizing evidence for display/AI.
- Disable overwrite and prevent changing an attached object. Reject arbitrary image URLs. Store a durable object reference, never an expiring signed URL or image base64. Issue short-lived read URLs only after authorization.
- Clean failed or abandoned unreferenced uploads after a grace period without deleting attached evidence.
- This direct upload is required to preserve the full 5 MB allowance on Vercel: its documented function payload limit is 4.5 MB. See [Vercel limits](https://vercel.com/docs/functions/limitations) and [Supabase signed uploads](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl).

Proposed status transitions, enforced in transactional database operations as well as APIs:

| Actor / trigger | Allowed transition |
| --- | --- |
| System on submission | Create `pending_analysis`. |
| System after validated analysis | `pending_analysis` → `pending_verification`. |
| System after failed or expired attempt | `pending_analysis` → `analysis_failed`. |
| Owner/admin retry | `analysis_failed` → `pending_analysis`, with rate limit and a processing lease. |
| Admin manual review | `pending_verification` or `analysis_failed` → `verified`, `rejected`, or `needs_more_information`. |
| Owner supplies requested corrections | `needs_more_information` → `pending_analysis`, server-controlled after allowed edits. |
| Admin response | `verified` → `in_progress` → `resolved`. |

Owners may correct only allowlisted evidence fields while awaiting review, after analysis failure, or when more information is requested; material edits invalidate old AI/scoring results and start a new report revision. Terminal and actively handled reports cannot be silently edited. Admin corrections follow the same revision/audit rules. Rejected and resolved reports remain distinct. Admin reanalysis may append an analysis without resetting a human handling status. Commit a status change and audit event atomically. Accept AI results only for their original current report revision and eligible workflow state; stale responses cannot overwrite officer decisions. Return a conflict on concurrent incompatible updates.

Scoring v1 decisions, recorded explicitly because the PRD leaves these details open:

- Follow the stated formula: `severity × .35 + completeness × .25 + recency × .20 + nearby × .20`. The PRD example computes to **85.5**, not 86.5; preserve this correction in tests and documentation.
- Use high `>= 75`, medium `>= 45 and < 75`, low `< 45`. Classify using the full calculated value, then format for display.
- Use the PRD base severities. Effective category is an officer correction first, otherwise a validated non-uncertain AI category, otherwise the user category; persist the source and avoid treating a category as proof of illegality.
- Completeness: validated photo 25, description with at least 80 trimmed characters 25, valid coordinates 20, valid incident time 20, location name with at least 3 trimmed characters 10. These are product heuristics for information completeness, not evidence authenticity or scientific risk measures; display the exact rules.
- Recency boundaries: age through 6 h → 100; over 6 h through 24 h → 85; over 24 h through 72 h → 65; over 72 h through 168 h → 40; older → 20. Reject future incident instants; convert local input correctly to UTC and localize display.
- Nearby means other real, non-rejected reports with the same effective category, within a configurable 2 km radius and a configurable rolling 7-day incident window. Exclude self and simulated records. Use the PRD count mapping 0/1/2/3+ → 0/40/70/100 and a tested geographic distance calculation. Nearby reports are corroborating submissions, not confirmation of truth. (Refined in Phase 4: the window is ±7 days around the subject's incident, and simulation records are counted only with other simulation records; see the Phase 4 implementation record.)
- Recalculate on edits, effective category/status eligibility changes, new nearby reports, configuration version changes, and recency boundaries. Update both affected neighborhoods, not only the newest report. Use database-backed dirty/freshness tracking and refresh stale active-report scores before queue sorting; define a deployment-compatible scheduled sweep where available. Preserve input snapshots and past calculations. (Implemented in Phase 4 with stored recency boundaries and read-time refresh, so no scheduled sweep is required.)

## Phase 1 — project foundation

- [x] Initialize the root Nuxt 4 project and Git repository; configure npm, Node engine, strict TypeScript, `.gitignore`, and one lockfile.
- [x] Configure Tailwind through `@tailwindcss/vite`, global CSS tokens matching PRD section 5, typography, spacing, focus states, and responsive public/admin layout primitives.
- [x] Establish the PRD directory structure. Keep shared contracts in `shared/` and frontend-only types in `app/`; avoid duplicate interfaces and speculative components.
- [x] Configure private Supabase/Gemini runtime fields and a secret-free `.env.example`. Validate server configuration on startup; production rejects incomplete required configuration. Document an explicit local setup state that disables unavailable service actions.
- [x] Prepare SQL migrations for the schema, trusted profile creation, constraints, audit operations, RLS, and private storage policies. Establish the report/status enums and shared Zod schemas.
- [x] Establish reusable server error responses, session/role helpers, request validation, CSRF/origin checks, and database-backed throttling boundaries.
- [x] Establish layouts and route metadata without shipping unfinished decorative controls. Prepare README setup instructions and scripts for type checks, focused tests, and production builds.

Gate: dependency installation, Nuxt preparation, type check, and build pass. Verify server secrets are excluded from public runtime data. Apply migrations to a disposable Supabase environment and verify role assignment, denied cross-user reads, and protected role/status columns. If service configuration is missing, mark those checks pending; do not mark Phase 1 fully complete or bypass its security prerequisites.

Phase 1 validation record, 14 November 2026:

| Check | Result |
| --- | --- |
| Dependency installation and Nuxt preparation | Passed. Nuxt 4.6.4, Tailwind 4.3.5, Vue 3.5.45; exact resolution is in `package-lock.json`. Router is explicitly aligned with Nuxt's required 5.x dependency. |
| `npm.cmd run typecheck` | Passed after fixing router compatibility and stream/header types. |
| `npm.cmd run test` | Passed: 105 tests in 6 files after adding service-checker security/diagnostic cases, alongside input schemas, image paths/limits, AI uncertainty, environment validation, streamed body limits, origin checks, and session failure classification. |
| `npm.cmd run build` | Passed. Font Inter is loaded from a local Latin WOFF2 asset. |
| `npm.cmd run test:smoke` against the running local dev server | Passed: 9 HTTP checks covering SSR pages, safe health/session payloads, anonymous admin denial, foreign origin, non-JSON, and oversized metadata. |
| Browser output configuration scan | Passed: no private key/configuration identifiers in `.output/public`; no private fields in the SSR runtime payload. No real keys are configured yet. |
| Local PostgreSQL migration verification | Passed: full migration execution plus 21 security/workflow checks in isolated PGlite with minimal Supabase auth/storage schema stubs. This is local SQL verification, not hosted service integration. Temporary QA tooling stays ignored inside `.npm-cache/qa-db/`, outside application dependencies. |
| `.env` and QA cache exclusion | Verified ignored by Git; the original PRD remains byte-for-byte unchanged. |
| Live Supabase credential/reachability check | Passed after the user filled `.env`: Auth settings HTTP 200 and server Auth Admin permission HTTP 200. No credential values or user records were printed. |
| `npm.cmd run check:services` | Passed: all 9 read-only live checks. Verifies all required columns across 5 domain tables; anonymous report access is denied with database permission code `42501`; bucket is private, limited to 5,000,000 bytes and JPEG/PNG/WebP. This does not prove full authenticated-user RLS or upload/login flows. |
| Supabase foundation RLS/workflow pgTAP suite | Passed: user-supplied SQL Editor result shows `finish()` returning only `1..47`, with no failed-test diagnostic. Covers database roles, owner isolation, protected fields, status/audit transactions, rate limiting and private storage policy. Fixtures roll back; actual login/upload flows remain Phase 2 checks. |
| Responsive browser and keyboard inspection | Not run: no local browser automation/preview tool is available in this session. Responsive primitives exist, but visual acceptance is not claimed. |

Remaining Phase 1 service gate:

- [x] Configure the intended Supabase project and fill local private environment values; read-only Auth/server-credential checks pass.
- [x] Apply the tracked migration to the configured project; all five table projections and private bucket are verified through live APIs.
- [x] Run the full rollback-based database policy/workflow tests against the configured disposable test database: 47 assertions passed according to the supplied SQL Editor result.
- [x] Verify foundation Auth/Storage connectivity and database access boundaries before advancing to Phase 2 live reporting.

## Phase 2 — public application and persisted reporting

- [x] Build the editorial landing page with specified hero/CTAs, three-step explanation, database-backed statistics endpoint, footer disclaimer, and `/about`. Missing statistics RPC returns unavailable rather than invented zeros; the embedded map preview was added in Phase 4.
- [x] Implement functional login/register/logout, confirmation callback where configured, session refresh/expiry handling, safe return URLs, and role-based redirection.
- [x] Implement `/report` with shared client/server validation for every required field and the exact threat categories; authenticated browser acceptance remains in the phase gate.
- [x] Implement private signed upload authorization/finalization and actionable file-size/type/upload-failure messages.
- [x] Implement geolocation only after explicit user action, coordinate display/validation, and a usable client-only Leaflet point picker when GPS fails or permission is denied.
- [x] Implement idempotent `POST /api/reports`, owned list/detail/update APIs, `/reports`, and `/reports/[id]`. Persist image reference, coordinates, incident time, and `pending_analysis` before AI exists.
- [x] Implement loading, successful submission, empty, unavailable, validation, expired-session, and retryable network states. Preserve form input after failure.

Gate: type check, focused tests, and build pass. With real Supabase, register/login/logout, upload valid evidence, submit, refresh, and retrieve the same report and image. Verify the full 5,000,000-byte boundary and direct browser upload using only the scoped signed URL/token, without a project API key. Prove a previously issued upload token cannot overwrite finalized or attached evidence. Verify duplicate retries create one report; reject invalid/future timestamps, invalid coordinates, spoofed/oversized uploads, other-user evidence, unauthorized reads, and client-supplied status/role/score/analysis. Exercise GPS denial and upload failure. AI remains explicitly pending at this phase, not simulated.

Phase 2 implementation record, 14 November 2026:

- Public pages now include the editorial landing, real database statistics API, licensed self-hosted forest photo, `/about`, `/map`, `/login`, and `/register`.
- Protected pages include `/report`, `/reports`, and `/reports/[id]`, with submission feedback, image preview, explicit GPS permission, manual/map coordinates, paging, signed private evidence, owner corrections, and a safe timeline. The admin entry route currently provides permitted report access; the full officer workflow remains Phase 5.
- Server routes implement registration/login/logout/callback, upload authorization/finalization, permission-scoped report CRUD, safe public statistics, and a restricted published-map projection. Session clients are cached per request so refreshed credentials are reused without crossing request boundaries.
- Image finalization checks actual bytes, MIME signatures, decode/dimension bounds, strips metadata, and writes a separate immutable JPEG before consuming its receipt. Reports persist as `pending_analysis`; there is no fabricated AI result.
- Migration `20261114000200_reporting.sql` adds upload receipts/leases, exact owner-scoped idempotency, transactional creation/correction/audit, simulation exclusion, and aggregate counts. `tests/database/reporting.test.sql` provides 29 rollback-based assertions with `finish(true)`.

| Check | Result |
| --- | --- |
| Unit suite | 173 tests passed across 11 files after adding serialized-Origin validation and development-only canonical-navigation cases to the existing auth, evidence, session, timeout and conflict coverage. |
| Type check and production build | Both passed after the final application changes: SSR session forwarding, numeric coordinate handling, DOM-ready Leaflet initialization, hydration-safe controls, service timeouts, and conflict mapping. |
| Configured credential scan | Passed against final `.output/public`: configured server credential values were not found in frontend assets; no values were printed. |
| Browser public flows | 9 tests passed in local Chrome: 375/768/1280/1440 widths, navigation, keyboard skip, protected-route redirection, strict local form validation, and basic public map/list. Desktop and mobile screenshots inspected. |
| Browser authenticated report flow | Passed in the complete 13-test rerun after the repair/restart. Covers login, nonempty HttpOnly cookies, exactly 5,000,000-byte direct upload without reusable keys, private evidence, persisted reload, duplicate replay, upload-failure recovery, GPS denial, point selection with failed tiles, blocked incoming/sealed token replay with unchanged evidence digest, changed-payload conflict409, forged-field422, simulation exclusion, owner correction, stale-revision409 and logout/protected-route denial. |
| Session refresh and callback | 2 live tests passed. Generated token exchange establishes the expected identity and HttpOnly cookies; an invalid token redirects to a static error. An expired local session forces real refresh and proves the outer SSR response returns rotated cookies. No email was sent; this does not prove registration SMTP delivery. |
| Cross-user HTTP isolation | Passed with a second confirmed public QA identity: private report GET 404, foreign PATCH/finalization 403, scoped list, admin denial, foreign-Origin denial, owner data unchanged, and anonymous report/upload 401 after local logout. No incident was created by the reader. |
| Local reporting database checks | 26 workflow/security cases passed against both complete migrations in isolated PostgreSQL. The complete 29-assertion SQL sequence also executed/rolled back using local assertion functions. |
| Hosted reporting readiness and pgTAP | All 11 `check:reporting` probes pass. The user reports `1..29` without error from the supplied migration/test bundle. Foundation `1..47` remains separately verified. |
| Real registration/email | Passed according to the user's explicit confirmation: email received and confirmed, then successful login. No password or email token was requested or logged. |
| Hosted business-conflict repair | Passed: the user confirms bundle `1..10` and project restart; all 11 readiness probes pass. The complete browser rerun proves the repaired stale-revision request returns HTTP409 and cannot overwrite the correction. |
| Local conflict-repair validation | Passed: full `001 → 002 → 003` chain, 47 foundation + 29 reporting + 10 conflict assertions. Repair bundle ran twice successfully; fixtures rolled back, intended definitions changed, security metadata/OIDs/owners/ACLs stayed intact, and drifted definitions were rejected atomically. This does not substitute for applying `003` to the hosted project. |
| HTTP smoke checks | All 9 passed against the running app after the transport and map fixes. |
| Final full browser/API suite | `npm.cmd run test:e2e`: all 13 passed in one run after hosted migration003 and restart; no skipped cases. Includes public responsive/keyboard flows, real callback, cross-user HTTP isolation, reporting and SSR refresh. |
| Local-origin regression | Passed: 3 origin cases plus 9 public cases. Loopback GET navigation redirects temporarily to the configured local origin; invalid canonical registration reaches 422 validation without sending email, and foreign/alias/malformed mutation origins remain403. Full isolated type checking/build passed; active development type hashes stayed unchanged. |

Remaining Phase 2 gate:

- [x] Apply `supabase/migrations/20261114000200_reporting.sql` through SQL Editor or a private database connection.
- [x] Run `tests/database/reporting.test.sql` against the configured disposable project and verify all 29 assertions pass.
- [x] Apply `003` using `supabase/JALANKAN_PERBAIKAN_KONFLIK.sql`, confirm `1..10`, clear old retry loops through a project restart, and re-run conflict REST acceptance.
- [x] Configure the exact `/auth/callback` redirect URL, then verify registration and confirmation with an email controlled by the tester.
- [x] Run the authenticated reporting browser scenario with a designated simulation account; verify actual private upload/replay, persisted reload/correction, permission denial, and logout.
- [x] Verify GPS-denied/manual-location fallback and expired-session/upload failure behavior in the authenticated flow before closing the phase.

## Phase 3 — AI integration

Incremental slices: provider adapter/strict output tests; atomic claim/complete/fail persistence and rollback tests; authorized API orchestration and current-revision UI; then hosted migration and real Gemini acceptance. Keep public statistics and simulations separate, and keep scoring for Phase 4. A configured key or a rendered analysis panel alone does not complete this phase.

- [x] Implement the provider interface and Gemini adapter in `server/services/ai/threat-analysis.ts`; keep the configured model identifier on the server and verify its image/structured-output capability before selection.
- [x] Use the stored authorized image and bounded report text. Treat evidence text as untrusted data, not model instructions. Do not send reporter identity or unrelated private fields.
- [x] Require the complete PRD JSON output schema, bounded strings/arrays, allowed categories/risk values including `uncertain`, confidence within 0–1, and `needs_human_verification: true`. Validate again with Zod even when using provider structured output. See [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output).
- [x] Implement authorized, rate-limited `POST /api/reports/:id/analyze`, persisted attempts, concurrency leases, provider timeout, safe error codes, and bounded retries. Never log credentials, signed URLs, full provider responses, or sensitive evidence.
- [x] Connect automatic post-submission analysis, result display, explicit failure, and owner/admin retry. A failed request leaves the original report intact and visible to the officer.
- [x] Show current-revision analysis separately from historical attempts; old results cannot appear as the current assessment after an owner correction. Existing schema/table fields are a foundation, not a connected provider.
- [x] Persist all required AI fields and model/prompt/report versions. Explain that confidence is an uncalibrated model self-assessment; do not present AI as deciding legality or contacting officers.

Gate: type check, focused tests, and build pass. Exercise a live Gemini result and schema-invalid, timeout, quota/unavailable, interrupted, and concurrent-retry cases. Verify persisted failure, successful retry, and immunity to stale responses after a report edit or human decision. Test doubles belong only in isolated automated tests; they never supply application results.

Phase 3 checkpoint, 15 November 2026:

- Provider adapter, authorized/rate-limited API, current-revision result/history/retry panel, and save-intent-based automatic analysis are written. A crafted GET URL cannot initiate provider usage by itself.
- All 247 unit tests pass (57 provider cases and 17 orchestration/boundary cases included). Full isolated type check and production build pass while active development type files remain unchanged. Actual Gemini/Supabase/QA credential values were not found in the generated browser assets.
- Gemini key catalog check passed HTTP200; configured project advertises `gemini-3.8-flash` with generateContent. This is availability/configuration evidence, not a successful AI analysis.
- Local full SQL chain `001`–`004` passes foundation47/reporting29/conflicts10/analysis44. The single Phase3 bundle ran twice with rollback of fixtures; owner/force denial, active/expired leases, schema validation, atomic audit, cached/idempotent completion and stale/human-decision protection are exercised.
- Hosted `supabase/JALANKAN_FASE_3.sql` application is confirmed by the user: `1..44` without error. Real provider attempts reached `AI_TIMEOUT` and were persisted, with report status `analysis_failed`, intact report data and retry available. A read-only live browser test passed: error/retry visibility, reload persistence, no fabricated observation, and no automatic paid call from a crafted GET URL.
- Live success/concurrency test is not passed yet. Its response-order assumption was corrected (either request may win the lease), and fresh pending fixtures prevent prior per-report rate windows from contaminating repeated QA. Actual inference still timed out with the45-second deadline; a documented LOW thinking setting for the configured3.8model did not resolve it. Minimal direct generation probes also timed out on3.8 and3.1FlashLite; a legacy2.5probe returned404. No hidden model fallback was introduced, and no provider-success result is claimed.
- Final checkpoint checks pass: 247 unit tests, full isolated typecheck/build, and live failure-state browser test. Phase3 remains open for a genuine successful analysis/retry/concurrency acceptance run. User-requested design direction can proceed independently on this stable code checkpoint; Phases4–6 remain unfinished.

Phase 3 validation record, 15 November 2026 (gate passed):

| Check | Result |
| --- | --- |
| Root cause of earlier timeouts | Provider-side model availability, not credentials, network or code. Key accepted by the catalog (HTTP 200); a minimal text prompt to `gemini-3.8-flash` timed out at 60 s or returned HTTP 503 `UNAVAILABLE`; `gemini-3.7-flash` returned 503 and `gemini-flash-latest` timed out; `gemini-2.5-flash` returned 404. `gemini-3.5-flash` answered in about 1.7 s. |
| Model capability before selection | The real `GeminiThreatAnalysisProvider` with a JPEG image, `responseJsonSchema` and Zod validation succeeded on `gemini-3.5-flash` in about 4.9 s (`uncertain`/`uncertain`, `needs_human_verification: true`). The same call on `gemini-3.8-flash` ended in `AI_TIMEOUT` at the 45-second deadline. |
| Configuration | User set `GEMINI_MODEL=gemini-3.5-flash` in the local `.env` and `.env.example`. `DEFAULT_GEMINI_MODEL` was then changed to `gemini-3.5-flash`, so `thinkingLevel: LOW` is now sent to it; a live adapter call with that setting succeeded in about 2.4 s. This is an explicit server setting, not a hidden fallback. |
| Live success, retry and concurrency (`tests/e2e/analysis.spec.ts`, `E2E_GEMINI_LIVE=true`) | Passed twice: 19.5 s before the default change (no thinking setting) and 17.9 s after it (with `thinkingLevel: LOW`), each on a fresh simulation fixture. A labeled QA outage was persisted through the real RPCs; the owner retry invoked Gemini; a simultaneous request reused the same attempt; after reload the report is `pending_verification` at the same revision; stored output passes the schema, no raw response is exposed, and exactly one `succeeded` row exists for that revision. |
| Live failure state (`tests/e2e/analysis-failure.spec.ts`) | Passed (8.2 s): persisted failure, retry visibility and no fabricated output after reload. |
| Persisted result | Two `succeeded` rows in `ai_analyses`, one per tested report revision. Both have `model_name gemini-3.5-flash`, `prompt_version rimbaguard-threat-v2`, category and risk `uncertain` (the fixture image only reads "SIMULASI PENGUJIAN"), `needs_human_verification true`. |
| Schema-invalid, timeout, quota/unavailable and interrupted cases | Covered by the 57 provider unit cases; live `AI_TIMEOUT` failures were also persisted earlier. Stale-response and human-decision immunity are covered by the hosted `1..44` analysis SQL suite. |
| Unit tests, type check and build | After the default change: 247/247 unit tests pass, `nuxt typecheck` exits 0 and `nuxt build` completes (both run in place with the development server stopped). |

Follow-up before the demo/deployment (Phase 6): re-check `gemini-3.5-flash` availability and quota on the hosted environment, since provider-side model availability caused the earlier failures.

## Phase 4 — threat intelligence and maps

- [x] Implement and persist scoring v1, component explanations, category-source labels, calculation histories, and recalculation/freshness rules independently of Gemini.
- [x] Complete the landing map preview and build `/map` and protected `/admin/map` with Leaflet/OpenStreetMap attribution, client-only loading, clustering, priority colors, and text labels for verification/priority.
- [x] Implement bounded/paginated database-backed map queries, category/priority/status/date filters, selectable marker details, and meaningful loading/empty/tile-error states.
- [x] Implement the separately allowlisted public map endpoint and safe shareable details; show only published records and clearly label approximate coordinates. Never expose private `/reports/[id]` data through public selection.
- [x] Keep the officer map dominant in the desktop layout and usable with touch and mobile filters. Do not add forest boundaries or satellite claims without sourced geospatial data.

Gate: type check, focused tests, and build pass. Test formula/example, fractional thresholds, completeness criteria, recency boundaries, nearby distance/count/self-exclusion, stale scores, and reciprocal recalculation. Verify database filtering, marker placement, clustering, empty states, and strict public payload fields. Public map tests must prove that unpublished/withdrawn reports and all private data stay inaccessible.

Phase 4 implementation record, 15 November 2026:

- Migration `20261115000500_priority.sql` makes the database the only score calculator. `public.refresh_threat_priorities` is service-only, bounded and serialized by a transaction advisory lock; a busy call returns at once so reads never block. Each calculation marks the previous and current neighborhood when the inputs that define it change, and a report marked again later in the same batch is picked again. An unchanged recalculation updates freshness only, so history grows only when a result changes. Direct `INSERT` on `threat_priorities` is revoked from `service_role`.
- Refreshes run after report creation, owner correction and a successful AI result (awaited in the API handlers, fail-soft), and before officers read the map or a report detail. Each active report stores its next recency boundary in `priority_recalculate_at`, so reads refresh time-expired scores and no scheduled job is needed. Anonymous public map reads never calculate.
- `public.admin_map_reports` (role rechecked in SQL) and `public.public_map_reports` (published real reports, field allowlist, coordinates rounded to 0.01°) are service-only. Nuxt validates both projections with Zod, strips unknown keys and re-rounds public coordinates.
- `/map`, `/admin/map` and the landing preview use `ThreatMap.client.vue`: `leaflet.markercluster` 1.5.3, clusters colored by their highest priority, letter markers (T/S/R/–) with text labels, spiderfied identical points, keyboard selection, tile-error state, WIB date filters bound to the URL, pagination, list alternative and shareable `/map?report=<id>`. Filter fields also have names, so a submit before hydration still applies them. Officer report detail shows the components, the category source, freshness, the v1 rules and the calculation history. Citizens no longer receive priority data, because nearby counts reveal other people's submissions.
- A dedicated QA officer identity was created with `scripts/prepare-e2e-officer.mjs`; the user granted its admin role in the SQL Editor.

Refinements to the recorded scoring decisions, made during implementation:

- The 7-day window is centred on the subject's incident time (other incident within ±7 days). This is symmetric, so neighborhoods are reciprocal, and it does not decay with wall-clock time.
- Simulation records do not affect real reports. Instead of being excluded everywhere, nearby counting stays within one data partition: real reports count only real reports, and simulation reports count only simulation reports, so the labeled demo dataset can show corroboration.
- The effective AI category applies to the current *content* revision (the latest `report_created`/`report_corrected` audit event), because officer status changes also increment `reports.revision`.

| Check | Result |
| --- | --- |
| Local SQL chain `001`–`005` (isolated PGlite) | Foundation 47, reporting 29, conflicts 10, analysis 44 and priority 66 assertions pass. The Phase 4 bundle ran twice and the migration re-ran harmlessly; all fixtures rolled back. |
| Hosted `supabase/JALANKAN_FASE_4.sql` | Confirmed by the user: `finish` returned `1..66` without error. |
| SQL coverage | PRD example 85.5; fractional thresholds at 44.9999/45/74.9999/75; severity per category; completeness 79 vs 80 characters and 2 vs 3 location characters; inclusive recency boundaries at 6/24/72/168 h and future instants; haversine accuracy at 1.99/2.01 km; nearby self-exclusion, category, 7-day window, rejection and partition; reciprocal recalculation when a report is added, moved or rejected; stale sweep without duplicate history and a new row when recency changes; AI/officer/user category precedence including a status-only revision; admin and public filters, pagination, allowlist, rounding, withdrawal and role denials. |
| Unit tests | 281 pass, including 34 new cases for filter parsing and WIB ranges, fail-soft refresh, projection allowlists and error mapping, and a contract test that keeps the displayed rules identical to the SQL. |
| Type check and production build | Pass after the final changes. Built browser assets contain none of the six configured credential values. |
| Live browser/API (`tests/e2e/priority-map.spec.ts`) | 3 pass against hosted Supabase: public payload allowlist, 422 filters, unpublished simulation report returns 404 and shows "not found", empty and tile-error states, landing preview, no hydration warnings; a citizen gets 403 for the officer map and no priority data; the officer map lists every simulation report with a persisted score, a report's stored components match the formula, identical points cluster and spiderfy, a marker is selectable by keyboard, and database filters return the empty state. |
| Full e2e regression | All other specs pass: 20 tests in total, including report creation and correction with the new refresh hooks, ownership isolation, session refresh, origin checks and the AI failure state. The paid Gemini success test (`analysis.spec.ts`) was not re-run; it passed earlier on 15 November. |
| Persisted hosted data | All 7 simulation reports are fresh: severity 40, completeness 100, recency 20, 6 nearby (score 100), total 63, medium, category source "user". 14 calculations exist; rows were added only when a neighbor appeared or a report was corrected. |
| Visual inspection | `/map` and `/admin/map` at 1440 and 375 px, a spiderfied cluster with a selected marker, and the officer priority panel were inspected from screenshots. |

Not verified with real data: the public map has no positive marker test against hosted data because no real report has been published yet (publication is Phase 5, and simulation reports cannot be published). Positive public filtering, rounding and withdrawal are covered by the SQL suite.

Carry-over to Phase 5:

- The analysis panel treats any revision change as a new report version. After an officer status change it would show the AI result as "before the report changed"; align it with the content revision used by scoring.
- Admin content corrections must add their audit action to `private.report_content_revision`.
- Officer publication will populate the public map; add a positive public-map browser test then.

## Phase 5 — administration and response workflow

- [x] Protect every admin page and endpoint using server identity/role checks, with route middleware for navigation behavior.
- [x] Build `/admin/dashboard`, `/admin/reports`, and `/admin/reports/[id]` with real counts, a paginated priority queue, evidence, AI results, component scores, map context, and histories.
- [x] Implement all verification actions, explicit publication review, request-for-information notes, allowed report corrections, and the proposed transactional status matrix.
- [x] Store immutable actor/status/note/timestamp events atomically with each important action; show the complete relevant timeline without exposing internal notes to public views.
- [x] Add the three required database-backed charts: reports over time, category distribution, and status distribution. Reuse aggregates on `/admin/analytics`; real zero-data states remain empty.
- [x] Make `/admin/settings` functional for account/session controls and safe service-status information; keep scoring rules/version visible without adding an unnecessary configuration-management subsystem.
- [x] Define statistic meanings in API documentation, including whether verified counts include reports now in progress/resolved. Label counts of submitted location names accurately; do not imply authoritative administrative regions or environmental impact.

Gate: type check, focused tests, and build pass. Complete `pending_verification → verified → in_progress → resolved`, rejection, more-information/correction/resubmission, and manual review after AI failure. Verify invalid transitions, concurrent writes, missing admin role, public role escalation, audit rollback, publication withdrawal, and late AI responses. Confirm dashboard/charts match actual database rows and simulated data is excluded from live totals.

Phase 5 implementation record, 15 November 2026:

- Migration `20261115000600_admin_workflow.sql` adds service-only `admin_report_queue`, `admin_publish_report`, `admin_withdraw_publication`, `admin_set_officer_category`, `admin_add_report_note` and `admin_analytics`. Every RPC rechecks the actor's admin role in SQL. Mutations lock the report, check the expected revision and write their audit event in the same transaction. Status changes keep the tested `admin_change_report_status` matrix. `admin_map_reports` keeps its signature and now shares `private.admin_report_page` with the queue.
- Publication: only real `verified`/`in_progress`/`resolved` reports. The audit stores the approved wording. Withdrawal needs an internal reason and keeps the summary as a private draft. Internal notes do not change the revision.
- Nuxt: `/api/admin/{dashboard,reports,reports/:id,reports/:id/status|publication|category|notes,analytics,settings}`. Each handler calls `requireAdmin`, validates strictly with Zod and rate-limits mutations; database outcomes map to fixed Indonesian messages. Logout accepts `scope: 'global'` (all devices). Officers return to allowlisted officer pages after login.
- Pages use the admin layout (sidebar on desktop, drawer on phones): dashboard (PRD G.1–G.4), queue (G.2), review (H.1–H.5), map, analytics, settings. Charts use Chart.js 4.5.1. Each is a single series in one validated hue (`#287A52`, which passes lightness, chroma and contrast checks), with thin bars, a hairline grid, tooltips, tip labels on ranked bars, wrapped axis labels and a table view. Review actions reload the report before reporting success, so a follow-up action never uses a stale revision.
- Reporter privacy: `server/utils/report-timeline.ts` hides internal events. A reporter reads a note only when it is a rejection reason, an information request or the approved public summary. The current request or rejection reason is shown prominently on the report page.
- Phase 4 carry-over fixed: the analysis panel treats an AI result as current while `analysis.reportRevision >= report.contentRevision`, so officer decisions no longer mark it outdated.
- Statistic meanings are documented in `docs/API.md` and on the analytics page.

| Check | Result |
| --- | --- |
| Local SQL chain `001`–`006` (isolated PGlite) | Foundation 47, reporting 29, conflicts 10, analysis 44, priority 66 and admin 64 assertions pass; bundle ran twice; fixtures rolled back. |
| Hosted `supabase/JALANKAN_FASE_5.sql` | Confirmed by the user: `finish` returned `1..64` without error. |
| SQL coverage | Full verification chain with audit actor/status/revision; stale revision `PT409`; skipped and final-state transitions; notes required for rejection and information requests; manual review after AI failure; reporter correction returning to analysis; rejection never resolvable; publication eligibility, simulation refusal, summary bounds, update, withdrawal and public-map effect; audit-failure rollback; category correction precedence in scoring; internal note without revision change; queue scopes, ordering and bounds; map behavior on the shared projection; analytics deltas for real vs simulation, statuses, high priority, WIB days and effective categories; citizen actors, officer browser sessions and role escalation denied. |
| Unit tests | 327 pass, including 46 new cases: action schemas, workflow contract against migrations 001/006, reporter timeline privacy, admin service argument passing, error mapping and secret-free settings, and officer login return paths. |
| Type check and production build | Pass after the final changes. |
| Live officer workflow (`tests/e2e/admin-workflow.spec.ts`) | Passes against hosted Supabase: dashboard numbers equal direct database counts (simulation and real); charts render; queue; manual review after an AI failure through verified → in progress → resolved; category correction reflected in the score; internal note with officer name; stale revision 409, invalid transition 422, simulation publication 422, forged field 422; information request; reporter sees the request but no internal note or category reason, corrects the report and it returns to analysis; citizen gets 403 on officer APIs; analytics weekly view, settings and the phone drawer work. |
| Regression e2e | `priority-map`, `public`, `ownership`, `session-refresh`, `confirmation`, `origin` and `analysis-failure` pass on the final code. `session-refresh` now allows 30 s for the hosted login, like the other specs. Two tests were made independent of retained data: fixture selection and the unverified label follow the actual state. |
| Visual inspection | Dashboard, queue, review, analytics and settings at 1440 px and the dashboard and review at 375 px were inspected. Clipped chart labels were fixed by wrapping, raw AI failure codes in the officer timeline now show readable messages, and a truncated select option was shortened. |

Not verified in this phase:

- `tests/e2e/reporting.spec.ts` could not complete. Supabase Storage uploads from this machine measured about 36 KB/s (1 MB in 27–28 s), so the 5,000,000-byte evidence upload exceeds the client's 60 s limit. The upload code is unchanged since it passed in Phase 4. Re-run it on a faster connection.
- The rejection action and publication were exercised in SQL but not in the browser. Simulation data cannot be published, and no real report should be fabricated for a test.
- Late AI responses after officer decisions rely on the Phase 3 analysis suite.

Carry-over to Phase 6:

- Re-run the complete e2e suite, including `reporting.spec.ts`, on a connection that uploads 5 MB within 60 s.
- Add a positive public-map and publication browser test once an officer has published a genuinely reviewed real report.
- Admin content corrections (title, description, location) are not implemented; officers correct the category and ask the reporter for other changes. If they are added, add their audit action to `private.report_content_revision`.

## Phase 6 — integrated QA and deployment preparation

- [x] Run the full citizen-to-officer flow using real Supabase persistence and Gemini success or an explicit persisted provider failure; verify records survive reload and new sessions.
- [x] Run adversarial API/RLS/storage checks for anonymous access, cross-user access, forged role/status/results, object-path abuse, revoked/expired sessions, CSRF, duplicate submissions, and rate limiting across server instances.
- [ ] Exercise database outage, missing configuration, AI outage, empty map/statistics/charts, slow network, tile failure, invalid evidence, and denied geolocation without fabricated fallbacks.
- [ ] Test keyboard navigation, labels, focus, contrast, touch map operation, and layouts at 375, 768, 1280, and 1440 px. Provide a usable report list/detail alternative to map-only navigation.
- [x] Optimize actual bottlenecks: lazy-load Leaflet/charts, bound queries, use appropriate indexes, avoid private-response caching, size images responsibly, and inspect generated browser assets for secrets.
- [x] Finalize README, architecture and API documentation, migration/setup instructions, admin provisioning, scoring rationale/version, service failure behavior, and a clearly labeled simulation-only competition demo script.
- [ ] Prepare the PRD deployment target: Vercel server runtime plus hosted Supabase. Verify request-duration settings, upload limits, environment validation, scheduled-score refresh support, HTTPS cookies, and auth callback URLs before release.
- [ ] When deployment access is configured, apply reviewed production migrations, configure secrets in the host secret manager, deploy, and smoke-test the actual public URL. Do not claim deployment based only on a successful local build.

Gate: final type check, relevant unit/integration/security/browser tests, and production build pass. Record the actual commands/results and any untested external dependency. Completion requires the PRD acceptance criteria, including real persistence, enforced permissions, functional responsive flows, and an accessible deployed URL; unresolved critical issues prevent release.

Record (15 November 2026; deployment items excluded at the user's request for now, nothing committed):

| Check | Result |
|---|---|
| Citizen-to-officer journey (`tests/e2e/journey.spec.ts`, runs only with `E2E_GEMINI_LIVE=true`) | Passes against hosted Supabase and real Gemini: submission, validated AI result, persisted v1 score (71.25, medium), verification → in progress → resolved, complete audit trail, and the same state after new citizen and officer sessions. Passed again in the final full run. |
| Adversarial checks (`security.spec.ts`, with `ownership` and `origin`) | Passed on the final security code. Anonymous 401 on every citizen and officer endpoint. Missing, foreign and look-alike origins get 403; a wrong content type 415; a body over 64 KB 413. No public Storage URL serves evidence. A signed-in citizen gets 422 for path traversal, SVG, oversized or forged uploads, 404 for another user's report, and 403 on officer APIs. The database-backed limiter returns 429 with `Retry-After`. Signed-in pages are `private, no-store`. A copied session cookie returns 401 after "sign out everywhere". Duplicate submissions are covered by the idempotency cases in `reporting.spec.ts` (see below). |
| Degraded operation (`npm.cmd run check:degraded`) | 21/21. A production build with Supabase unreachable keeps serving pages: the API answers `503 DATABASE_UNAVAILABLE` quickly, home and map show "unavailable" messages instead of zeros, login fails fast, and responses and logs contain no credentials. Production refuses to start with incomplete configuration, setup mode or a non-HTTPS URL. AI failure is covered by `analysis-failure.spec.ts`; tile failure and empty states by `priority-map.spec.ts`. |
| Accessibility and layout (`accessibility.spec.ts`, axe-core WCAG 2.2 A/AA) | 0 violations on 14 public, citizen and officer pages, and no horizontal overflow at 375, 768, 1280 and 1440 px. Map clusters and markers work with the keyboard (Enter/Space), a skip link is present, and every map has a list alternative. |
| Optimization (production build) | Landing JavaScript 525 → 230 KB: route prefetch on interaction only and a map preview loaded near the viewport. Hero image 395 → 81 KB (768/1080 px WebP `srcset`). Leaflet, markercluster and Chart.js load only on routes that use them. Map (500) and queue (20) queries are bounded. A scan of the 55 browser files for the 6 configured secret values found none. |
| Documentation | README, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DEMO.md` (simulation-only demo script) and `supabase/README.md` updated. |
| Unit, type check and build | 327 unit tests pass. `vue-tsc -b --noEmit` passes against the generated Nuxt types. The production build passes in an isolated copy, so the running development server was untouched. |
| Final full e2e run (all specs except `reporting`) | **16 passed, 11 failed** (12.3 min). The failures are HTTP 503 `DATABASE_UNAVAILABLE`, 30 s navigation timeouts and failed fetches. They happened while the hosted Supabase connection from this machine was disrupted, the same period in which uploads failed. `check:services` passed at 22:02 WIB, and each failing spec had passed earlier in Phase 5 or 6. The run must be repeated on a stable connection before the gate. |

Not verified yet:

- A clean repeat of the full e2e suite, and `reporting.spec.ts` (the 5 MB upload needs roughly 90 KB/s; this machine measured 14–36 KB/s).
- Map operation on a touch device and the denied-geolocation path in a browser. Code paths exist: Leaflet touch handling, and the form message that falls back to map or manual coordinates.
- A positive public map and publication flow in the browser; this needs a genuinely reviewed real report.
- Deployment preparation and the deployed URL (the last two items above).

## Validation and execution discipline

The `typecheck`, `test`, `build`, `test:smoke`, and `check:services` scripts now exist. On this Windows machine, run them through `npm.cmd run <script>`. `test:smoke` requires a running local server and does not establish browser usability or external service integration. The actual Phase 1 results and pending checks are recorded above.

At each gate, record commands, results, service environment, and remaining limitations here. Fix failures before advancing. Test business rules and security boundaries rather than copying implementation details into redundant tests. Mocks may inject provider failures in tests; only a configured live environment proves external integration. Keep unfinished checks unchecked.

Use the PRD seven-day timeline as a sequencing target: Day 1 foundation; Day 2 authentication/reporting; Day 3 AI; Day 4 scoring/maps; Day 5 admin; Day 6 integrated QA; Day 7 release/documentation/demo. Service setup and failed gates can extend this target; do not trade persistence, privacy, or working flows for calendar completion.

The user-supplied `../GUIDEBOOK WEB DEV IT RUSH.pdf` was reviewed as competition reference, not as instructions overriding the user's request. It specifies 20 November 2026 at 23:59 WIB as the deadline (page 5), public deployment availability through 30 November 2026 and preserved public repository commit history (page 3), AI/tool/library disclosure in README and proposal (page 3), and a 3–5 minute YouTube Unlisted demo (page 4). It also requires proposal/declaration PDFs and controlled demo credentials when login is used. The seven-day target therefore maps to 14–20 November. Successful live AI integration must be demonstrated for the competition; explicit AI failure handling alone is insufficient evidence. No external submission/publication has been performed.

## Design refinement requested on 16 November 2026

- [x] Replace the portrait hero with a wide rainforest background and place the white heading, description, and calls to action over the image, following the user's SIGAP screenshot reference. Use a rounded hero and overlapping forest-green capsule header. The locally stored panorama is explicitly labeled as an AI illustration.
- [x] Use a short Indonesian heading, more readable text, larger form labels and buttons, and clearer spacing while retaining the forest palette and real data states. This user-requested refinement supersedes the original English hero headline; the source PRD is preserved.
- [x] Separate public-layout sign-out from primary navigation into an accessible account disclosure, preserving the actual logout API, errors, and role-based links. The existing officer account footer remains separate.
- [x] Inspect the revised background-image composition in desktop and mobile visual previews.
- [x] Redesign the reporting workflow as a transparent cartoon character using a phone beside three readable vertical steps and a functional report CTA. Keep AI's role preliminary, preserve privacy wording, and use one brief entrance animation with reduced-motion support. Do not use the discarded photographic character concept.
- [x] Refine that section to follow the user's latest illustrated reference: add a separate forest environment, camera/analysis/clipboard icons, a quiet first-step highlight, a privacy strip, and one grouped information strip. Keep the character asset transparent; avoid unverified encryption or environmental-impact claims. Inspect desktop and mobile compositions visually; automated test work remains deferred at the user's request.
- [x] Apply the subsequent cleanup: remove the first-step highlight and white icon treatment so all three steps share the same background; remove visible AI-asset captions and simulation-counting commentary from the homepage. Retain accurate privacy and AI-function information, actual data filtering, and asset provenance in repository documentation. Decorative images have empty alt text and no dangling caption references. Test-file work remains deferred.
- [x] Give `/login` and `/register` a shared split-screen authentication layout: a forest image and inverted brand at left, readable Inter form at right, compact stacked composition on mobile, working home/about links, and a reusable show/hide password control. The same login serves citizen and officer entry; existing API calls, role-aware redirects, `next`, field validation, and email-confirmation state remain intact. Visual inspection covers 320, 375, 768, 1280 and 1440 px; no test files were edited or suites run for this design pass.
- [x] Resume automated checks after the user requested test updates. Replace obsolete photo-ratio/alt-caption assertions with backdrop containment and real navigation checks; cover uniform workflow backgrounds, decorative image loading, reduced motion, split-screen authentication, keyboard password controls, and the account control in the homepage capsule.

Design regression record, 16 November 2026:

- `npm.cmd run test`: 327 unit tests pass across 20 files.
- Isolated type check and production build: pass; the preview's generated type files were preserved.
- Playwright collects 42 tests across 15 files. The selected 32 tests across `public`, `auth-layout`, `accessibility`, `account-navigation`, `origin`, `confirmation`, `ownership`, and `session-refresh` all pass against the dedicated simulation-mode server and hosted Supabase. No skips in this selected group. Real QA sessions, email-token callback without sending email, cookie rotation, and denied cross-user access remain verified after the redesign.
- This run creates no reports and invokes no Gemini inference. The other 10 collected tests (upload, paid/live AI journey, officer workflow, security/rate-limit scenarios and priority-map coverage) were not rerun for this bounded design regression; the selected results do not certify the entire suite or complete Phase 6.
- `npm.cmd run test:e2e:ui` now provides the focused public/authentication/account/accessibility regression command. Keep the ordinary preview stopped while its dedicated test server uses port 3000; retained fixture requirements and explicit skips are documented in README.

This is a bounded design refinement. It does not mark the remaining Phase 6 release and deployment gates complete.

## Admin design refinement — 17 November 2026

- [x] Reapply the admin-only redesign after the user discarded the first attempt. Use an Inter-based forest-green navigation shell, clear active states, readable page headings, separate account/logout controls, and shared panel/filter styling scoped to the admin workspace.
- [x] Redesign Ringkasan, Laporan, Peta, Analitik and Pengaturan. Group queue metadata into readable rows, retain practical filters and pagination, give the map and its selectable report list their own panels, retain chart table alternatives, and organize settings into account, session security, service information and scoring rules.
- [x] Preserve real API/data behavior, role guards, report review links, dataset distinctions, missing/stale score states, error/empty states and global-signout confirmation. Keep score meanings and service configuration claims accurate; no backend, database, user-page or test-file changes are part of this pass.
- [x] Inspect the five pages directly using a retained QA officer session at 1440 px and 375 px. Fix truncated map filters and improve chart rendering/readability. The inspected pages have no horizontal overflow or browser runtime errors. This visual inspection is not a substitute for the deferred functional checks.
- [ ] Update and run relevant automated checks after the user requests testing. No test suites, type check or production build were run during this design-only pass.
- [x] Refine only the shared statistic cards after reverting the broader typography pass: use a muted sage background, 18 px semibold labels, 44–48 px counts, and 16 px descriptions/actions. Keep navigation, queue typography, real counts and report links unchanged. Inspect Ringkasan and Analitik directly at 1440 px and 375 px: no horizontal overflow or browser runtime errors. Automated checks remain deferred.
- [x] Make Analitik understandable without chart literacy: open the selected period with generated plain-language key points (volume and busiest day/week/month, most-reported category, unverified and resolved counts) and readable WIB dates; give the trend axis titles and value labels (every bar when the labels fit, otherwise only the peak); replace the category and eight-status charts with a ranked share list (one line per category on wide panels; zero categories folded into one sentence) and a four-stage handling tracker (left to right on wide panels, vertical on narrow ones; rejected listed separately; per-status table retained). Following the user's review, the panels stack full width so no panel is stretched into empty space when its neighbour or a table grows, and the all-time statistics sit below the period as a plain hairline-separated row with an explicit "Semua waktu" scope instead of cards. Statistic values, API data and dashboard charts are unchanged.
- [x] Fix two pre-existing issues found during that pass: the admin layout account links take their accessible name from their visible text plus screen-reader-only purpose text (axe `label-content-name-mismatch`, which failed the officer accessibility audit), and the evidence endpoint passes `content-length` as a number as h3 types require. Direct QA-officer inspection with real and simulation data over 7/30/90/365 days at 1440/1024/768/375/320 px, including opened tables: no horizontal overflow and no axe WCAG 2.2 AA violations. Isolated `vue-tsc` passes for the app and server configurations; test suites were not run.

## Account settings and profile photos — 17 November 2026

- [x] Let citizens and officers change their name, password and profile photo. `PATCH /api/account/profile` uses the existing service-role grant on `profiles.full_name`. `POST /api/account/password` proves the current password on a separate memory-only session (closed at once), updates through the user's own session, then signs out other sessions; attempts are limited to 5 per 15 minutes. `PUT/DELETE/GET /api/account/avatar` accept a browser-cropped photo of at most 45,000 bytes inside the 64 KB JSON limit, re-encode it with Sharp to a 256 × 256 WebP without metadata, store it privately as `<user-id>/<uuid>.webp`, and keep the path in Auth `app_metadata` (service-role only, rechecked against the owner's namespace on every read). The session exposes only a versioned same-origin `avatarUrl`.
- [x] Add migration `007` and `supabase/JALANKAN_FASE_6_PROFIL.sql`: private `profile-photos` bucket plus a restrictive server-only storage policy, with built-in verification.
- [x] The user's first upload still failed because the hosted project had no `profile-photos` bucket (read-only check: only `report-evidence` existed). The server now creates the same private bucket through the Storage API when an upload reports it missing, then retries once. Verified end to end with the QA officer: the bucket was created (private, 262,144 bytes, WebP only); the photo saved as 256 × 256 WebP (18,724 bytes) and showed in the profile header, sidebar and top bar; `GET` returned `200 image/webp` with `private, max-age=86400`, another version `404`, no session `401`; removal restored the initials and the removed version answered `404`. The test photo was removed afterwards.
- [ ] Recommended: run `JALANKAN_FASE_6_PROFIL.sql` in the hosted SQL Editor to add the restrictive policy as a second guard.
- [x] The officer top-bar profile button opens an account menu (same disclosure pattern as the public "Akun saya"): name, email, Pengaturan akun, Situs publik and Keluar. It closes on a menu link, Escape (focus returns to the button), an outside click or a route change, and paints above the Leaflet map. The profile photo fills its circle (no white ring or line-box gap). The queue photo buttons now carry their visible text in their accessible names ("Lihat foto", "Coba kembali"). Direct QA-officer check: no axe WCAG 2.2 AA violations with the menu open on Ringkasan; menu sign-out ends the session.
- [x] Follow the user's review: remove the green cover banner from the profile header, and show every settings section in one column on `/admin/settings` and `/account` (profile header, profile with name and read-only email side by side, password with the three fields in one row on wide screens, sessions, then service status and scoring for officers). Direct inspection at 1440/1024/768/375/320 px: no horizontal overflow and no axe WCAG 2.2 AA violations.
- [x] Redesign `/admin/settings` (profile header with photo controls, profile, password with a live checklist, sessions, service status, full-width scoring weights; balanced columns without stretched cards) and add the citizen page `/account` from the same components. Layout avatars show the photo or initials; the public account menu links to the right settings page, and `/account` joins the citizen redirect allowlist.
- [x] Verification: isolated `vue-tsc` passes for app and server; 327 existing unit tests pass. Direct QA sessions at 1440/1024/768/375/320 px: no horizontal overflow and no axe WCAG 2.2 AA violations on either page. Functional checks with the QA officer: name changed, shown in header and sidebar, then restored; mismatched confirmation and a wrong current password are rejected; a photo preview appears and saving reports the missing bucket as expected. A successful password change was not run, because it would sign out the operator's other sessions. No automated regression tests were added. The stale e2e assertion `'Terkonfigurasi · gemini-3.5-flash'` in `admin-workflow.spec.ts` predates this pass.

## Private report photos in officer queues — 17 November 2026

- [x] Add lazy photo thumbnails to the shared officer queue used by Ringkasan and Laporan, with an accessible native dialog for the full stored photo, close/Escape/focus restoration and explicit loading/error/retry states. Keep photo controls outside report links, including the stacked mobile layout.
- [x] Add `GET /api/admin/reports/:id/evidence?size=thumbnail|full`. Recheck the officer session and report RLS before reading only the stored sealed evidence path. Generate a bounded 384 × 288 WebP thumbnail using the existing Sharp dependency; stream the full supported stored image only on demand. Do not expose Storage paths, signed URLs, service keys, or evidence through public APIs. No SQL migration is required.
- [x] Direct browser inspection with retained QA sessions: actual thumbnails and full JPEG return 200 with `private, no-store`; malformed size returns 422, missing report 404, anonymous access 401 and citizen access 403. Thumbnail/full viewing, Escape/focus restoration and the shared report-list view work; the inspected 375 px layout has no horizontal overflow or runtime errors. This creates no reports or AI requests.
- [ ] Add automated regression coverage in the next requested testing pass. No test files or test suites were changed/run for this feature; the direct inspection does not certify the full suite.

## Citizen report-list design — 17 November 2026

- [x] Redesign `/reports` with a muted sage introduction, a clear creation link, a readable history heading and reusable report cards. Give each card a 22–24 px title, textual status badge, labeled location/incident time and a single accessible link to its existing report detail. Preserve ownership, server pagination, total count, simulation labels and loading/error/empty states.
- [x] Inspect the actual retained citizen reports at 1440, 768, 375 and 320 px: no horizontal overflow or browser runtime errors. No reports or AI requests are created by this inspection.
- [ ] Automated regression checks remain deferred during this design pass; no test files or suites were changed/run.

## Report form and location usability — 17 November 2026

- [x] Follow the user's subsequent review: remove the entire side guide and its unused styles; let the form span the content width in one column. Location and submission controls remain in the form.

- [x] Restyle `/report` and its shared creation/correction form with three numbered fieldsets, sage and cream surfaces, readable labels, a photo preview, a prominent submit area and a desktop guide with working section anchors. Preserve the existing upload, validation, persistence, correction revision and analysis-intent flow.
- [x] Make the existing geolocation action prominent as `Gunakan lokasi saya`. Request location only after a click, retain accuracy feedback and map/manual correction, distinguish permission/timeout/unavailable failures, and explain the HTTPS requirement. Prevent duplicate location requests and submission while location is being obtained; ignore callbacks after unmount.
- [x] Direct visual inspection at 1440, 768, 375 and 320 px: no horizontal overflow or browser runtime errors. Browser-emulated GPS fills coordinates; map selection changes them; emulated permission denial restores the button and allows manual coordinates; an empty submission shows validation without saving a report. Physical-device GPS accuracy was not verified. No report uploads, writes or AI requests were performed in this inspection.
- [ ] Automated regression coverage remains deferred; no test files or suites were changed/run during this pass.

## About page design — 17 November 2026

- [x] Replace the cropped 3:1 panorama on About with a new native 1254 × 1254 forest scene generated with the built-in image tool. Store high-quality responsive WebP copies, use correct intrinsic dimensions and image sizes, and center the forest opening in the panel. Record the fictional decorative asset and exact prompt in `public/images/ATTRIBUTION.md`.

- [x] Redesign `/about` to match the current public pages: sage introduction with the existing decorative forest panorama, readable Inter typography, working report/map links, three grouped workflow steps, privacy information and a forest-green explanation of human review. Keep AI preliminary, priority rule-based, public coordinates approximate and all content free of fabricated statistics or environmental-impact claims.
- [x] Inspect the actual page at 1440, 768, 375 and 320 px: no horizontal overflow or browser runtime errors. Automated test work remains deferred; no test files or suites were changed/run.

## Public map usability — 17 November 2026

- [x] Clarify `/map` as the public view of officer-reviewed, published reports. Put the filter form behind an optional native disclosure, keep it expanded for active filters, retain all existing query filters/reset/date semantics, and make the map/list and empty-state explanation readable in the forest/sage palette. Link the empty state to report creation and the owner's report list; do not invent markers or publish private reports.
- [x] Preserve shared links, pagination, approximate coordinates and existing protected API projections. Add focus movement to selected details/back to the list and clipboard failure feedback. The shared filter's optional `expanded` prop leaves the admin's default behavior intact.
- [x] Direct inspection: initial page at 1440/768/375/320 px and expanded filters at 1440/1024/768/320 px have no horizontal overflow or browser runtime errors. Applying a category, resetting filters and recovering from an invalid query work. The live public dataset is empty; a positive published-report selection journey was not rerun, and no reports were published or edited during this pass.
- [ ] Automated regression coverage remains deferred during design work; no test files or suites were changed/run.

## Public navigation and video hero — 21 November 2026

- [x] Follow the user's Gojek.io layout reference: transparent fixed homepage navigation, solid forest background after scrolling or opening the mobile menu, full-width video hero, readable Inter typography and working report/map actions. Keep the account disclosure and logout separate from primary navigation.
- [x] Replace the homepage photograph with licensed Pexels forest footage by Mikhail Nilov, served locally as silent eight-second 1080p (1.28 MB) / 720p (0.69 MB) loops with responsive posters. Preserve source/license details in `public/images/ATTRIBUTION.md`, README and proposal.
- [x] Provide suspension outside the viewport/hidden tabs, poster fallback on failure, and no automatic video download for reduced-motion or data-saving preferences. The visible pause/play control was subsequently removed at the user's request on 21 November 2026.
- [x] Verify actual playback, pause/resume, mobile video dimensions, keyboard navigation, fallback and account/logout behavior: 22 relevant browser scenarios passed, including automated accessibility checks. Isolated typecheck and production build passed. Direct final officer navigation checks at 1280/1440 px show no overflow; update the actual homepage capture in `docs/assets/home-hero.png`.
- [x] Resume only the requested design work. Delcom CI/CD setup remains deferred by the user; this change does not deploy or push the repository.

## Video controls and profile photo restoration — 21 November 2026

- [x] Remove the visible homepage video pause/play control and unused state/styles as requested. Retain silent looping, automatic suspension, image fallback and reduced-motion/data-saving preferences; update the related regression tests and asset documentation.
- [x] Follow the user's final clarification: restore the original full-circle photo presentation, using `object-fit: cover` with no inner padding. Restore the original center-square browser preparation and 256 × 256 WebP normalization, including the existing validation and metadata removal. Preview and saved avatars share the same circular appearance for citizens and officers.
- [x] Remove the temporary regression tests and documentation for the superseded uncropped-photo behavior. The visible video control remains removed as requested.

## Homepage workflow and activity alignment — 21 November 2026

- [x] Connect the video hero to a compact forest-green activity band with readable real counts, consistent column dividers, responsive grouping and simpler labels. Preserve the statistics API, zero values, loading/error messages and retry behavior.
- [x] Remove the illustrated forest backdrop, invitation card and, following the user's final review, the phone-user character. Use a clean ivory section, consistent three-step rows, thin dividers, a working report action and plain privacy text. Align the report button/privacy note with the introduction and remove the illustration's reserved space. Retain Inter and the forest palette.
- [x] Verify isolated typecheck and production build, plus 17 existing public/video browser scenarios. Direct visual and automated accessibility inspection at 1440/1024/768/375/320 px shows no horizontal overflow or axe WCAG 2.2 A/AA violations in the changed sections. Controlled statistics failure shows a clear message without invented counts, and retry restores the actual four values. No reports, photos, emails or Gemini requests are created by these checks.
- [x] After removing the character, rerun the three targeted workflow/navigation checks, the five-width visual/accessibility/statistics-recovery inspection and production build. All pass; the report button and privacy note now align with the introduction.

## Illustrated workflow composition — 21 November 2026

- [x] Apply the user's approved layout trial: a contained forest landscape on the left, with the heading, three reporting steps, report action and plain privacy note on the right. Stack the content on phones and retain the forest/ivory palette, original destinations and real platform statistics.
- [x] Generate a new landscape without people, text or brand elements using built-in imagegen. Save transparent WebP derivatives at `public/images/workflow-landscape-v2.webp` and `workflow-landscape-v2-640.webp`; record actual dimensions, preparation and the exact prompt in `public/images/ATTRIBUTION.md`.
- [x] Three targeted browser workflow scenarios pass. Visual/accessibility inspection at 1440/1024/768/375/320 px shows no overflow or automated WCAG A/AA violations in the changed sections; statistics failure/retry still works with actual data. No reports, uploads, emails or Gemini requests are created.
- [x] Isolated typecheck and production build pass for the final composition; active development types remain unchanged.
- [x] Follow the user's size/spacing review: align the desktop illustration to the top of the heading column, enlarge it into the available left margin without covering text or clipping the artwork, and increase its tablet/mobile size. Direct inspection at 1920/1440/1024/768/375/320 px confirms top alignment on desktop and no horizontal overflow; production build passes.

## Final minimalist reporting workflow — 21 November 2026

- [x] Follow the user's final direction: remove the landscape illustration and its reserved space. Use a balanced two-column text layout with a clear heading, short introduction, report action and plain privacy note on the left, and three numbered steps on the right. Stack the sections on phones.
- [x] Simplify the instructions to adding a photo/story, checking the AI-assisted draft, then submitting and tracking officer review. Remove redundant benefit statements, duplicate visual markers and unused component data/styles; retain Inter, the forest/ivory palette and genuine activity statistics.
- [x] Update existing workflow checks and asset documentation to reflect the final layout. Keep former generated artwork archived without loading it on the homepage.
- [x] Final verification passes: 17 public/video browser scenarios, isolated typecheck and production build. Direct checks at 1440/1024/768/375/320 px find no horizontal overflow or automated WCAG A/AA violations in the changed sections. Statistics error/retry restores actual values; report navigation works. No reports, uploads, emails or Gemini requests are created.

## Public map visual alignment — 21 November 2026

- [x] Match the homepage's minimalist direction: align the content with the 80rem navigation container, replace the large sage introduction with a concise plain header, remove its duplicate creation action, and use a compact native filter disclosure.
- [x] Present the map and report list in one white workspace with thin borders, subtle rounding, readable Inter typography and forest-green accents. Keep creation available through navigation and a secondary empty-state action. Match the SSR loading footprint to the responsive map height; preserve query filters, selection, sharing, pagination and privacy projections.
- [x] Two existing public-map browser scenarios pass against the actual API, including filter validation, simulation exclusion and private-report non-disclosure. Collapsed and expanded-filter views at 1920/1440/1024/768/375/320 px align with the navbar and show no horizontal overflow or automated WCAG A/AA violations.
- [x] Invalid-date recovery and service-failure retry work. Selected-report rendering, focus restoration and keyboard marker selection pass with an explicitly labeled browser-only simulation; it is neither saved nor published. The real public dataset remains empty, so no live published-report journey is claimed. No database writes, uploads, emails or Gemini calls occur during these checks.
- [x] Isolated typecheck, production build and patch validation pass; the main development server remains running at port 3000.

## About and citizen-report visual alignment — 21 November 2026

- [x] Align `/about`, `/reports`, `/report` and `/reports/:id` with the final homepage and public map: shared content width, plain ivory introductions, Inter typography, restrained white surfaces and forest-green pill actions. Keep the existing About photograph and readable workflow/privacy sections; simplify report cards, the three-step form, assistant and detail sidebar without changing report permissions or submission behavior.
- [x] Fix a validation issue discovered during mobile inspection: missing or invalid categories now show a short Indonesian instruction instead of raw enum values. Allow error text to wrap so long messages cannot widen the form.
- [x] Inspect all four pages at 1440/768/375/320 px: 16 layout checks pass with aligned headings and no horizontal overflow. Seven existing browser navigation/accessibility scenarios, 54 contract unit tests, isolated typecheck and production build pass. Verify local photo preview, invalid submission and browser-emulated GPS without creating reports, uploading evidence or calling Gemini. Physical-device GPS accuracy is outside this inspection.
- [x] Preserve the running development server, existing data, simulation labels and previous changes. Delcom deployment and GitHub publishing remain deferred.

## Citizen report-card photos — 21 November 2026

- [x] Follow the 22 November thumbnail review: preserve the whole evidence image with centered contain fitting and a neutral background, including the readable SIMULASI PENGUJIAN fixture text. Keep original evidence unchanged. Landscape/portrait edge-preservation tests, the existing thumbnail/privacy browser scenarios and desktop/mobile visual inspection pass; no report writes or AI calls occur.

- [x] Show the report's actual evidence thumbnail in `/reports`: photo beside the content on desktop, above it on phones, lazy loading, fixed dimensions and a clear failure message that keeps the detail link available. Preserve status, ownership, pagination and simulation labels.
- [x] Add authenticated `GET /api/reports/:id/thumbnail`, reusing the officer image service as `report-evidence.ts`. Authorize with the current user's report RLS and ownership before privileged Storage reads; return a bounded WebP with `private, no-store`, without exposing Storage paths or signed URLs. Keep officer thumbnail/full-photo access restricted by `requireAdmin`; no migration is required.
- [x] Pass 25 focused unit checks and two read-only browser scenarios covering actual stored QA photos, 1440/1024/768/375/320 px layouts, accessibility, image failure/detail navigation, anonymous 401, unrelated-user 404, malformed ID 422 and officer thumbnail/full-photo regression. Isolated typecheck/build pass; inspect desktop/mobile captures. No reports, uploads or AI calls are created.

## Admin visual alignment — 22 November 2026

- [x] Align the shared status dot to the center of the first text line and prevent it from shrinking into an oval. Preserve existing colors and labels. Read-only checks cover 14 statuses at 1920/1440/375/320 px and a wrapped label; production build passes.

- [x] Refine the shared officer navigation, page headers, panels and actions to match the public forest/ivory design: narrower forest sidebar, pill navigation/actions, sticky contextual header, restrained borders and consistent Inter hierarchy. Preserve all five destinations and separate account/logout controls.
- [x] Redesign dashboard summary cards with a forest-green total, muted semantic accents and a compact mobile layout. Improve priority-queue headings, report titles and review actions; retain actual counts, data selection, evidence previews and existing review links. Format the actual date range for readability and remove the redundant bottom action panel.
- [x] Isolated typecheck and production build pass. Existing officer accessibility regression passes for dashboard, queue, report detail, map, analytics and settings. Direct inspection covers all five primary pages at 1920/1440/1024/768/375/320 px (30 checks) without horizontal overflow or runtime errors. Real/simulation counts match the API; account Escape/focus restoration, mobile navigation and full-photo viewing work after hydration. No report mutations, uploads or Gemini calls occur.

## Analytics content design — 22 November 2026

- [x] Follow the user's subsequent review: revert the equal-height category/handling panels. Restore independent content heights and the original disclosure positions; retain the rest of the Analytics redesign.

- [x] Refine period/source controls into a compact filter row. Present selected-period volume in a forest-green summary beside three plain-language insights, followed by a readable trend and responsive category/handling panels. Separate all-time figures in a subdued strip with explicit scope labels; preserve expandable data tables and reading guidance.
- [x] Preserve actual calculations, query filters and officer permissions. All eight real/simulation and 7/30/90/365-day combinations match API figures; daily/weekly/monthly chart labels remain appropriate. Inspect 1920/1440/1280/1024/768/375/320 px layouts and expanded tables at 1440/768/375/320 px without overflow. Automated WCAG A/AA inspection, isolated typecheck and production build pass. Browser-only controlled empty/error responses show the intended states and retry restores actual data; no reports, uploads or Gemini calls are created.

## Public scroll animation — 22 November 2026

- [x] Record the user's confirmation that the submission deadline was extended to 23 November. Deployment remains on hold until the user's next deployment instruction.
- [x] Add restrained, once-only fade/rise reveals to below-the-fold homepage statistics, reporting introduction/steps, map introduction and About information. Keep the hero's first paint, interactive maps, navigation, forms and actual statistics stable. Use native IntersectionObserver, bounded staggering and a short initial scroll-settle check; disconnect observers/listeners and clear timers on cleanup. Honor reduced motion, immediate keyboard focus and no-JavaScript/observer fallbacks without new dependencies.
- [x] Verify 24 public/video/scroll browser scenarios plus the existing public accessibility scenario. Route-to-route reveals, preference changes, keyboard actions and SSR/observer fallbacks pass. Direct inspection at 1920/1440/1024/768/375/320 px shows no horizontal overflow or automated WCAG A/AA violations after reveal; statistics remain unchanged. Isolated typecheck and final production build pass. No reports, uploads, emails or Gemini requests are created.

## Product name — 22 November 2026

- [x] Use RimbaGuard consistently in the brand, accessible labels, page titles, package/lock metadata, PRD, documentation, SQL header comments and proposal/wireframe assets. Preserve AI feature names, prompts, credentials, permissions and technical behavior. A source scan finds no previous brand variants.
- [x] Pass 21 existing public/auth-layout browser scenarios and the public accessibility scenario, isolated typecheck and production build. Inspect seven representative public/auth/citizen/officer routes and five public viewport widths; refresh three actual proposal captures dated 22 November. No reports, uploads, emails or Gemini requests are created. Deployment remains paused as requested.

## Competition proposal PDF — 22 November 2026

- [x] Re-read the official guidebook/template and inspect its A4, 1-inch margins and Times New Roman 12 pt formatting. Preserve every required section 1.1–4.2.
- [x] Use the supplied team identities, with the user's corrected chair: Panji Ananda Lumbantoruan (chair), Daniel Simanjuntak, Jose Simon Harris Purba, Martulut Simbolon; Institut Teknologi Del. Website/video links and demo-account fields remain blank at the user's request; this is a review edition.
- [x] Re-run the current unit suite: 370 tests in 23 files passed. Keep historical browser/provider/SQL evidence dated and separate from this run; no invented field research or environmental-impact figures.
- [x] Capture the current local UI at 2x scale using retained QA identities. No report submission or new Gemini generation. Correct the analysis-panel capture after map layout settles. A transport diagnostic printed QA session headers; the QA officer's sessions were revoked and the helper now reports only safe errors.
- [x] Build the PDF from the editable Markdown source using an offline Playwright/Chromium renderer and existing Sharp dependency. Include actual UI, vector architecture/flow/wireframes, automatic contents/figure page references, source attribution, AI disclosures and rubric mapping.
- [x] Export `docs/ITRUSH26_semogabisamagang_RimbaGuard.pdf`: 27 A4 pages and 15 figures; all required sections are present, fonts are embedded, and the PDF has bookmarks and a tagged structure. Inspect rendered pages and correct overflow, stray paragraphs and clipped screenshots before handoff.
- [ ] Complete submission links and intentional demo credentials on the private submission copy, verify production, and supply the separate signed declaration/video. PDF export does not resume deployment, publish the repository or submit the entry.

## Originality declaration and chair correction — 23 November 2026

- [x] Read and download the original declaration template linked by the guidebook. Preserve the required declaration clauses, page dimensions, margins and styling; replace all sample identities, work title and unrelated AI-use examples.
- [x] Use the user's corrected chair, Panji Ananda Lumbantoruan; Daniel Simanjuntak is a member. Update the editable proposal and rebuild its 27-page PDF; verify the chair/member roles in extracted cover text.
- [x] Fill the declaration with the supplied programme, contact details and signing place/date, Sitoluama, 23 November 2026. The user confirms the template's originality and competition-history declarations are accurate. Do not create a signature or stamp.
- [x] Select the AI-use checkbox and disclose Gemini, Codex/ChatGPT, Claude Code and image generation consistently with the README. List Supabase and OpenStreetMap separately as non-AI services.
- [x] Produce `docs/ITRUSH26_semogabisamagang_Surat_Orisinalitas_RimbaGuard.docx`. Validate all member NIMs, chair, programme/contact/date, unchanged required clauses, checked option, six disclosure entries, unique paragraph IDs, original margins and absence of foreign sample data.
- [x] Inspect a two-page layout approximation generated from OOXML. Word opened a filled build read-only, but its native preview export stalled; close all task-owned Word instances. Do not present the approximation as a successful native Word export.
- [ ] Team review, signature and actual meterai remain manual completion steps before submission. No publication, repository push or competition submission was performed.

## External setup needed before live phase gates

### Competition improvement update — 18 November 2026

Audit ulang 20 November 2026: 353 unit tests, isolated typecheck/build, 34 distinct browser scenarios and the genuine assistant/report/officer flow passed. Proposal now follows the organizer's actual chapter structure and includes native wireframes plus real UI captures. See the [current competition audit](docs/COMPETITION_IMPROVEMENT_PLAN.md#audit-ulang-komponen-penilaian--20-november-2026). The user explicitly deferred Delcom deployment and member details until component improvements are finished; no deployment, external publishing or submission is claimed.

- [x] Private AI report assistant: sealed photo/story, at most three clarification questions, owner-only draft persistence, source-preserving description and explicit confirmation before atomic report creation.
- [x] Hosted migration `008` confirmed by the user: `1..26`. Local SQL bundle also passes twice with rolled-back fixtures.
- [x] Live assistant acceptance and post-submission analysis pass with `gemini-3.5-flash-lite`; previous Flash 3.5 timeout/503 is resolved by an explicit verified model change in default configuration, `.env.example` and local `.env`.
- [x] 353 unit tests, isolated typecheck/build, manual 5 MB upload/correction, officer workflow, map/privacy/security and automated accessibility regression pass. Detailed scopes and limits: [competition improvement checklist](docs/COMPETITION_IMPROVEMENT_PLAN.md).
- [x] README/API/architecture updated; draft proposal and 3–5 minute demo script prepared. Team: **semogabisamagang**, institution: **Institut Teknologi Del**. Members/NIM/roles are deferred at the user's request.
- [ ] Deploy and verify HTTPS Delcom URL; prepare final demo accounts, video and proposal PDF after the remaining details are available. Public deployment and final submission are not claimed complete.

| Dependency | Required setup | Needed by |
| --- | --- | --- |
| Supabase | A project URL, anonymous/publishable project credential kept server-side, server service-role credential, access to apply SQL/storage policies, Auth site/redirect configuration, and a restricted initial-admin provisioning path. | Phase 1 database gate and Phase 2 live authentication/reporting. |
| Gemini | A server API key, available quota, and an enabled model with image input and structured output. | Phase 3 live AI gate. |
| Hosting | Access to the campus Delcom server selected by the user, deployment secrets, HTTPS production URL/callback configuration, and the documented request-driven score refresh. | Phase 6 deployment gate. |
| Content | Licensed forest photograph; official contact information only if supplied. | Public landing page and final content review. |

The user supplied Supabase configuration and applied migrations `001`–`006`. Hosted SQL results report 47 foundation, 29 reporting, 10 repair, 44 analysis, 66 priority, and 64 officer-workflow assertions passed. Registration/email confirmation/login passed by user confirmation; the Gemini key is present and accepted by the model catalog. With `GEMINI_MODEL=gemini-3.5-flash`, genuine inference succeeds and the live success/retry/concurrency test passed on 15 November 2026; the failure path remains verified with retained simulation reports. Two public QA identities and one QA officer identity (admin role granted by the user in the SQL Editor) remain in ignored `.env.e2e`; simulation data stays outside public totals/maps. Credentials stay in ignored local environment files or the host secret manager. Phases 1–5 are complete; completion of Phase 6 is not claimed.
