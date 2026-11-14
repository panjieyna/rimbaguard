# RimbaGuard AI implementation plan

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
- [ ] Phase 2: public application and persisted reporting.
- [ ] Phase 3: AI integration.
- [ ] Phase 4: threat intelligence and maps.
- [ ] Phase 5: administration and response workflow.
- [ ] Phase 6: integrated QA and deployment preparation.

Available: Node.js `24.21.0`, npm `11.19.0` through `npm.cmd`, Git `2.55.0.windows.5`, and Bun. Use npm and one `package-lock.json`; do not mix package managers. PowerShell blocks `npm.ps1`, so use `npm.cmd` without changing execution policy. No Supabase CLI or pnpm was found on PATH. Node/package availability does not establish registry connectivity.

Phase 1 is complete. All nine foundation service checks pass, and the supplied Supabase SQL Editor `finish()` result of only `1..47` confirms the 47 foundation assertions passed without a failure diagnostic. Phase 2 UI/API/SQL implementation is written and passes the local checks below. Its separate hosted reporting migration, authenticated persistence/Storage tests, and controlled-email confirmation remain pending, so Phase 2 is not marked complete.

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
- Nearby means other real, non-rejected reports with the same effective category, within a configurable 2 km radius and a configurable rolling 7-day incident window. Exclude self and simulated records. Use the PRD count mapping 0/1/2/3+ → 0/40/70/100 and a tested geographic distance calculation. Nearby reports are corroborating submissions, not confirmation of truth.
- Recalculate on edits, effective category/status eligibility changes, new nearby reports, configuration version changes, and recency boundaries. Update both affected neighborhoods, not only the newest report. Use database-backed dirty/freshness tracking and refresh stale active-report scores before queue sorting; define a deployment-compatible scheduled sweep where available. Preserve input snapshots and past calculations.

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

- [x] Build the editorial landing page with specified hero/CTAs, three-step explanation, database-backed statistics endpoint, footer disclaimer, and `/about`. Missing statistics RPC returns unavailable rather than invented zeros; the embedded map preview remains for Phase 4.
- [ ] Implement functional login/register/logout, confirmation callback where configured, session refresh/expiry handling, safe return URLs, and role-based redirection.
- [x] Implement `/report` with shared client/server validation for every required field and the exact threat categories; authenticated browser acceptance remains in the phase gate.
- [ ] Implement private signed upload authorization/finalization and actionable file-size/type/upload-failure messages.
- [ ] Implement geolocation only after explicit user action, coordinate display/validation, and a usable client-only Leaflet point picker when GPS fails or permission is denied.
- [ ] Implement idempotent `POST /api/reports`, owned list/detail/update APIs, `/reports`, and `/reports/[id]`. Persist image reference, coordinates, incident time, and `pending_analysis` before AI exists.
- [ ] Implement loading, successful submission, empty, unavailable, validation, expired-session, and retryable network states. Preserve form input after failure.

Gate: type check, focused tests, and build pass. With real Supabase, register/login/logout, upload valid evidence, submit, refresh, and retrieve the same report and image. Verify the full 5,000,000-byte boundary and direct browser upload using only the scoped signed URL/token, without a project API key. Prove a previously issued upload token cannot overwrite finalized or attached evidence. Verify duplicate retries create one report; reject invalid/future timestamps, invalid coordinates, spoofed/oversized uploads, other-user evidence, unauthorized reads, and client-supplied status/role/score/analysis. Exercise GPS denial and upload failure. AI remains explicitly pending at this phase, not simulated.

Phase 2 implementation record, 14 November 2026:

- Public pages now include the editorial landing, real database statistics API, licensed self-hosted forest photo, `/about`, `/map`, `/login`, and `/register`.
- Protected pages include `/report`, `/reports`, and `/reports/[id]`, with submission feedback, image preview, explicit GPS permission, manual/map coordinates, paging, signed private evidence, owner corrections, and a safe timeline. The admin entry route currently provides permitted report access; the full officer workflow remains Phase 5.
- Server routes implement registration/login/logout/callback, upload authorization/finalization, permission-scoped report CRUD, safe public statistics, and a restricted published-map projection. Session clients are cached per request so refreshed credentials are reused without crossing request boundaries.
- Image finalization checks actual bytes, MIME signatures, decode/dimension bounds, strips metadata, and writes a separate immutable JPEG before consuming its receipt. Reports persist as `pending_analysis`; there is no fabricated AI result.
- Migration `20261114000200_reporting.sql` adds upload receipts/leases, exact owner-scoped idempotency, transactional creation/correction/audit, simulation exclusion, and aggregate counts. `tests/database/reporting.test.sql` provides 29 rollback-based assertions with `finish(true)`.

| Check | Result |
| --- | --- |
| Unit suite | 139 tests passed across 8 files, including authentication errors/redirects and real image decoding/normalization. |
| Type check and production build | Passed after correcting shared-module imports and request/session client reuse. |
| Configured credential scan | Passed against final `.output/public`: configured server credential values were not found in frontend assets; no values were printed. |
| Browser public flows | 9 tests passed in local Chrome: 375/768/1280/1440 widths, navigation, keyboard skip, protected-route redirection, strict local form validation, and basic public map/list. Desktop and mobile screenshots inspected. |
| Browser authenticated report flow | 1 test explicitly skipped: no dedicated simulation account configured in ignored `.env.e2e`. This is not counted as a passed persistence test. The test checks login, HttpOnly sessions, upload, report creation/reload, idempotency, corrections, and logout when configured. |
| Local reporting database checks | 26 workflow/security cases passed against both complete migrations in isolated PostgreSQL. The complete 29-assertion SQL test sequence also executed/rolled back using local assertion functions; actual hosted pgTAP results are still required. |
| Hosted reporting readiness | Not ready at latest check: `evidence_uploads` returns `PGRST205`; `platform_statistics` returns `PGRST202`. The user has been asked to apply migration `002` and run its SQL test file. Use `npm.cmd run check:reporting` after applying it. |
| Real registration/email, signed direct upload/replay, cross-user APIs, and persistence | Pending hosted migration and a controlled test account. No persistent test accounts/reports were created by the agent. |

Remaining Phase 2 gate:

- [ ] Apply `supabase/migrations/20261114000200_reporting.sql` through SQL Editor or a private database connection.
- [ ] Run `tests/database/reporting.test.sql` against the configured disposable project and verify all 29 assertions pass.
- [ ] Configure the exact `/auth/callback` redirect URL, then verify registration and confirmation with an email controlled by the tester.
- [ ] Run the authenticated reporting browser scenario with a designated simulation account; verify actual private upload/replay, persisted reload/correction, permission denial, and logout.
- [ ] Verify GPS-denied/manual-location fallback and expired-session/upload failure behavior in the authenticated flow before closing the phase.

## Phase 3 — AI integration

- [ ] Implement the provider interface and Gemini adapter in `server/services/ai/threat-analysis.ts`; keep the configured model identifier on the server and verify its image/structured-output capability before selection.
- [ ] Use the stored authorized image and bounded report text. Treat evidence text as untrusted data, not model instructions. Do not send reporter identity or unrelated private fields.
- [ ] Require the complete PRD JSON output schema, bounded strings/arrays, allowed categories/risk values including `uncertain`, confidence within 0–1, and `needs_human_verification: true`. Validate again with Zod even when using provider structured output. See [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output).
- [ ] Implement authorized, rate-limited `POST /api/reports/:id/analyze`, persisted attempts, concurrency leases, provider timeout, safe error codes, and bounded retries. Never log credentials, signed URLs, full provider responses, or sensitive evidence.
- [ ] Connect automatic post-submission analysis, result display, explicit failure, and owner/admin retry. A failed request leaves the original report intact and visible to the officer.
- [ ] Persist all required AI fields and model/prompt/report versions. Explain that confidence is an uncalibrated model self-assessment; do not present AI as deciding legality or contacting officers.

Gate: type check, focused tests, and build pass. Exercise a live Gemini result and schema-invalid, timeout, quota/unavailable, interrupted, and concurrent-retry cases. Verify persisted failure, successful retry, and immunity to stale responses after a report edit or human decision. Test doubles belong only in isolated automated tests; they never supply application results.

## Phase 4 — threat intelligence and maps

- [ ] Implement and persist scoring v1, component explanations, category-source labels, calculation histories, and recalculation/freshness rules independently of Gemini.
- [ ] Complete the landing map preview and build `/map` and protected `/admin/map` with Leaflet/OpenStreetMap attribution, client-only loading, clustering, priority colors, and text labels for verification/priority.
- [ ] Implement bounded/paginated database-backed map queries, category/priority/status/date filters, selectable marker details, and meaningful loading/empty/tile-error states.
- [ ] Implement the separately allowlisted public map endpoint and safe shareable details; show only published records and clearly label approximate coordinates. Never expose private `/reports/[id]` data through public selection.
- [ ] Keep the officer map dominant in the desktop layout and usable with touch and mobile filters. Do not add forest boundaries or satellite claims without sourced geospatial data.

Gate: type check, focused tests, and build pass. Test formula/example, fractional thresholds, completeness criteria, recency boundaries, nearby distance/count/self-exclusion, stale scores, and reciprocal recalculation. Verify database filtering, marker placement, clustering, empty states, and strict public payload fields. Public map tests must prove that unpublished/withdrawn reports and all private data stay inaccessible.

## Phase 5 — administration and response workflow

- [ ] Protect every admin page and endpoint using server identity/role checks, with route middleware for navigation behavior.
- [ ] Build `/admin/dashboard`, `/admin/reports`, and `/admin/reports/[id]` with real counts, a paginated priority queue, evidence, AI results, component scores, map context, and histories.
- [ ] Implement all verification actions, explicit publication review, request-for-information notes, allowed report corrections, and the proposed transactional status matrix.
- [ ] Store immutable actor/status/note/timestamp events atomically with each important action; show the complete relevant timeline without exposing internal notes to public views.
- [ ] Add the three required database-backed charts: reports over time, category distribution, and status distribution. Reuse aggregates on `/admin/analytics`; real zero-data states remain empty.
- [ ] Make `/admin/settings` functional for account/session controls and safe service-status information; keep scoring rules/version visible without adding an unnecessary configuration-management subsystem.
- [ ] Define statistic meanings in API documentation, including whether verified counts include reports now in progress/resolved. Label counts of submitted location names accurately; do not imply authoritative administrative regions or environmental impact.

Gate: type check, focused tests, and build pass. Complete `pending_verification → verified → in_progress → resolved`, rejection, more-information/correction/resubmission, and manual review after AI failure. Verify invalid transitions, concurrent writes, missing admin role, public role escalation, audit rollback, publication withdrawal, and late AI responses. Confirm dashboard/charts match actual database rows and simulated data is excluded from live totals.

## Phase 6 — integrated QA and deployment preparation

- [ ] Run the full citizen-to-officer flow using real Supabase persistence and Gemini success or an explicit persisted provider failure; verify records survive reload and new sessions.
- [ ] Run adversarial API/RLS/storage checks for anonymous access, cross-user access, forged role/status/results, object-path abuse, revoked/expired sessions, CSRF, duplicate submissions, and rate limiting across server instances.
- [ ] Exercise database outage, missing configuration, AI outage, empty map/statistics/charts, slow network, tile failure, invalid evidence, and denied geolocation without fabricated fallbacks.
- [ ] Test keyboard navigation, labels, focus, contrast, touch map operation, and layouts at 375, 768, 1280, and 1440 px. Provide a usable report list/detail alternative to map-only navigation.
- [ ] Optimize actual bottlenecks: lazy-load Leaflet/charts, bound queries, use appropriate indexes, avoid private-response caching, size images responsibly, and inspect generated browser assets for secrets.
- [ ] Finalize README, architecture and API documentation, migration/setup instructions, admin provisioning, scoring rationale/version, service failure behavior, and a clearly labeled simulation-only competition demo script.
- [ ] Prepare the PRD deployment target: Vercel server runtime plus hosted Supabase. Verify request-duration settings, upload limits, environment validation, scheduled-score refresh support, HTTPS cookies, and auth callback URLs before release.
- [ ] When deployment access is configured, apply reviewed production migrations, configure secrets in the host secret manager, deploy, and smoke-test the actual public URL. Do not claim deployment based only on a successful local build.

Gate: final type check, relevant unit/integration/security/browser tests, and production build pass. Record the actual commands/results and any untested external dependency. Completion requires the PRD acceptance criteria, including real persistence, enforced permissions, functional responsive flows, and an accessible deployed URL; unresolved critical issues prevent release.

## Validation and execution discipline

The `typecheck`, `test`, `build`, `test:smoke`, and `check:services` scripts now exist. On this Windows machine, run them through `npm.cmd run <script>`. `test:smoke` requires a running local server and does not establish browser usability or external service integration. The actual Phase 1 results and pending checks are recorded above.

At each gate, record commands, results, service environment, and remaining limitations here. Fix failures before advancing. Test business rules and security boundaries rather than copying implementation details into redundant tests. Mocks may inject provider failures in tests; only a configured live environment proves external integration. Keep unfinished checks unchecked.

Use the PRD seven-day timeline as a sequencing target: Day 1 foundation; Day 2 authentication/reporting; Day 3 AI; Day 4 scoring/maps; Day 5 admin; Day 6 integrated QA; Day 7 release/documentation/demo. Service setup and failed gates can extend this target; do not trade persistence, privacy, or working flows for calendar completion.

The user-supplied `../GUIDEBOOK WEB DEV IT RUSH.pdf` was reviewed as competition reference, not as instructions overriding the user's request. It specifies 20 November 2026 at 23:59 WIB as the deadline (page 5), public deployment availability through 30 November 2026 and preserved public repository commit history (page 3), AI/tool/library disclosure in README and proposal (page 3), and a 3–5 minute YouTube Unlisted demo (page 4). It also requires proposal/declaration PDFs and controlled demo credentials when login is used. The seven-day target therefore maps to 14–20 November. Successful live AI integration must be demonstrated for the competition; explicit AI failure handling alone is insufficient evidence. No external submission/publication has been performed.

## External setup needed before live phase gates

| Dependency | Required setup | Needed by |
| --- | --- | --- |
| Supabase | A project URL, anonymous/publishable project credential kept server-side, server service-role credential, access to apply SQL/storage policies, Auth site/redirect configuration, and a restricted initial-admin provisioning path. | Phase 1 database gate and Phase 2 live authentication/reporting. |
| Gemini | A server API key, available quota, and an enabled model with image input and structured output. | Phase 3 live AI gate. |
| Hosting | Access to the intended Vercel project, deployment secrets, production URL/callback configuration, and supported score-refresh scheduling or the documented request-driven fallback. | Phase 6 deployment gate. |
| Content | Licensed forest photograph; official contact information only if supplied. | Public landing page and final content review. |

The user supplied Supabase API configuration, applied the foundation migration, and ran the full foundation SQL tests: nine live service checks and 47 database assertions pass. Phase 2 is now authorized and in progress. Its new transactional reporting/upload migration and separate test suite must be applied and verified before marking that phase complete. Credentials stay in ignored `.env` or the host secret manager.
