-- Phase 2: private upload receipts, idempotent report creation, owned corrections.
-- Apply after 20261114000100_foundation.sql. No accounts or reports are seeded.

create type public.evidence_upload_status as enum ('pending', 'processing', 'finalized', 'attached');

create table public.evidence_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  incoming_path text not null unique,
  sealed_path text not null unique,
  declared_mime_type text not null check (declared_mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  declared_size integer not null check (declared_size between 1 and 5000000),
  status public.evidence_upload_status not null default 'pending',
  processing_token uuid,
  processing_expires_at timestamptz,
  expires_at timestamptz not null default (now() + interval '2 hours'),
  sealed_mime_type text check (sealed_mime_type = 'image/jpeg'),
  sealed_size integer check (sealed_size between 1 and 5000000),
  sealed_sha256 text check (sealed_sha256 ~ '^[0-9a-f]{64}$'),
  report_id uuid references public.reports(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint upload_incoming_owner_path check (
    incoming_path ~ ('^' || user_id::text || '/incoming/' || id::text || '\.(jpg|jpeg|png|webp)$')
  ),
  constraint upload_incoming_extension_matches_mime check (
    (declared_mime_type = 'image/jpeg' and incoming_path ~ '\.jpe?g$')
    or (declared_mime_type = 'image/png' and incoming_path ~ '\.png$')
    or (declared_mime_type = 'image/webp' and incoming_path ~ '\.webp$')
  ),
  constraint upload_sealed_owner_path check (
    sealed_path = user_id::text || '/sealed/' || id::text || '.jpg'
  ),
  constraint upload_expiry_bound check (
    expires_at > created_at and expires_at <= created_at + interval '2 hours'
  ),
  constraint upload_lease_matches_state check (
    (status = 'processing' and processing_token is not null and processing_expires_at is not null)
    or (status <> 'processing' and processing_token is null and processing_expires_at is null)
  ),
  constraint upload_seal_matches_state check (
    (status in ('pending', 'processing') and sealed_mime_type is null and sealed_size is null and sealed_sha256 is null)
    or (status in ('finalized', 'attached') and sealed_mime_type is not null and sealed_mime_type = 'image/jpeg'
      and sealed_size is not null and sealed_sha256 is not null)
  ),
  constraint upload_attachment_matches_state check (
    (status = 'attached' and report_id is not null)
    or (status <> 'attached' and report_id is null)
  )
);

create index evidence_uploads_owner_created_idx on public.evidence_uploads (user_id, created_at desc);
create index evidence_uploads_cleanup_idx on public.evidence_uploads (expires_at)
  where status <> 'attached';
create index evidence_uploads_report_idx on public.evidence_uploads (report_id)
  where report_id is not null;
create trigger evidence_uploads_touch_updated_at before update on public.evidence_uploads
for each row execute function private.touch_updated_at();

alter table public.evidence_uploads enable row level security;
revoke all on public.evidence_uploads from public, anon, authenticated, service_role;
grant select, insert on public.evidence_uploads to service_role;

create function private.guard_new_upload_receipt()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status <> 'pending' or new.report_id is not null
    or new.processing_token is not null or new.processing_expires_at is not null
    or new.sealed_mime_type is not null or new.sealed_size is not null or new.sealed_sha256 is not null then
    raise exception using errcode = '23514', message = 'invalid_initial_upload_state';
  end if;
  return new;
end;
$$;
create trigger evidence_uploads_guard_insert before insert on public.evidence_uploads
for each row execute function private.guard_new_upload_receipt();

-- Canonical snapshots avoid hash-extension dependencies and allow exact,
-- order-independent payload comparison for an owner's idempotency key.
create table private.report_submission_keys (
  user_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key uuid not null,
  request_snapshot jsonb not null check (jsonb_typeof(request_snapshot) = 'object'),
  is_simulation boolean not null default false,
  report_id uuid not null unique references public.reports(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key)
);
alter table private.report_submission_keys enable row level security;
revoke all on private.report_submission_keys from public, anon, authenticated, service_role;
create trigger report_submission_keys_immutable before update or delete on private.report_submission_keys
for each row execute function private.prevent_history_mutation();

create function public.claim_evidence_upload(
  p_upload_id uuid, p_actor_id uuid, p_processing_token uuid
)
returns public.evidence_uploads language plpgsql security definer set search_path = '' as $$
declare
  v_upload public.evidence_uploads%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_actor_id is null or p_processing_token is null then
    raise exception using errcode = '22023', message = 'invalid_upload_claim';
  end if;
  select * into v_upload from public.evidence_uploads where id = p_upload_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'upload_not_found'; end if;
  if v_upload.user_id is distinct from p_actor_id then
    raise exception using errcode = '42501', message = 'upload_owner_mismatch';
  end if;
  if v_upload.status in ('finalized', 'attached') then return v_upload; end if;
  if v_upload.expires_at <= v_now then
    raise exception using errcode = '23514', message = 'upload_expired';
  end if;
  if v_upload.status = 'processing' and v_upload.processing_expires_at > v_now then
    if v_upload.processing_token = p_processing_token then return v_upload; end if;
    raise exception using errcode = '40001', message = 'upload_processing_conflict';
  end if;
  update public.evidence_uploads set
    status = 'processing', processing_token = p_processing_token,
    processing_expires_at = v_now + interval '120 seconds'
  where id = p_upload_id returning * into v_upload;
  return v_upload;
end;
$$;

create function public.complete_evidence_upload(
  p_upload_id uuid, p_actor_id uuid, p_processing_token uuid,
  p_sealed_size integer, p_sealed_mime_type text, p_sealed_sha256 text
)
returns public.evidence_uploads language plpgsql security definer set search_path = '' as $$
declare
  v_upload public.evidence_uploads%rowtype;
begin
  if p_actor_id is null or p_processing_token is null
    or p_sealed_size is null or p_sealed_size not between 1 and 5000000
    or p_sealed_mime_type is distinct from 'image/jpeg'
    or p_sealed_sha256 is null or p_sealed_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_upload_completion';
  end if;
  select * into v_upload from public.evidence_uploads where id = p_upload_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'upload_not_found'; end if;
  if v_upload.user_id is distinct from p_actor_id then
    raise exception using errcode = '42501', message = 'upload_owner_mismatch';
  end if;
  if v_upload.status in ('finalized', 'attached') then
    if v_upload.sealed_size = p_sealed_size and v_upload.sealed_mime_type = p_sealed_mime_type
      and v_upload.sealed_sha256 = p_sealed_sha256 then return v_upload; end if;
    raise exception using errcode = '40001', message = 'upload_completion_conflict';
  end if;
  if v_upload.status <> 'processing' or v_upload.processing_token is distinct from p_processing_token
    or v_upload.processing_expires_at <= clock_timestamp() then
    raise exception using errcode = '40001', message = 'upload_lease_conflict';
  end if;
  if v_upload.expires_at <= clock_timestamp() then
    raise exception using errcode = '23514', message = 'upload_expired';
  end if;
  update public.evidence_uploads set
    status = 'finalized', sealed_size = p_sealed_size, sealed_mime_type = p_sealed_mime_type,
    sealed_sha256 = p_sealed_sha256, processing_token = null, processing_expires_at = null
  where id = p_upload_id returning * into v_upload;
  return v_upload;
end;
$$;

create function public.fail_evidence_upload(
  p_upload_id uuid, p_actor_id uuid, p_processing_token uuid
)
returns public.evidence_uploads language plpgsql security definer set search_path = '' as $$
declare v_upload public.evidence_uploads%rowtype;
begin
  select * into v_upload from public.evidence_uploads where id = p_upload_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'upload_not_found'; end if;
  if p_actor_id is null or v_upload.user_id is distinct from p_actor_id then
    raise exception using errcode = '42501', message = 'upload_owner_mismatch';
  end if;
  if v_upload.status in ('pending', 'finalized', 'attached') then return v_upload; end if;
  if p_processing_token is null or v_upload.processing_token is distinct from p_processing_token then
    raise exception using errcode = '40001', message = 'upload_lease_conflict';
  end if;
  update public.evidence_uploads set status = 'pending', processing_token = null, processing_expires_at = null
  where id = p_upload_id returning * into v_upload;
  return v_upload;
end;
$$;

create function public.delete_expired_evidence_upload(p_upload_id uuid, p_actor_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_upload public.evidence_uploads%rowtype;
begin
  select * into v_upload from public.evidence_uploads where id = p_upload_id for update;
  if not found then return false; end if;
  if p_actor_id is null or v_upload.user_id is distinct from p_actor_id then
    raise exception using errcode = '42501', message = 'upload_owner_mismatch';
  end if;
  if v_upload.status = 'attached' or v_upload.report_id is not null
    or v_upload.expires_at >= clock_timestamp() - interval '15 minutes'
    or (v_upload.status = 'processing' and v_upload.processing_expires_at > clock_timestamp())
    or exists (select 1 from public.reports where image_path = v_upload.sealed_path) then
    return false;
  end if;
  delete from public.evidence_uploads where id = p_upload_id;
  return true;
end;
$$;

create function private.validate_report_payload(p_payload jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_title text; v_description text; v_category public.threat_category;
  v_latitude numeric; v_longitude numeric; v_incident timestamptz;
  v_location text; v_image_path text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or not (p_payload ?& array['title','category','description','evidencePath','latitude','longitude','incidentTime']) then
    raise exception using errcode = '22023', message = 'invalid_report_payload';
  end if;
  if exists (select 1 from jsonb_object_keys(p_payload) as k(key)
    where k.key <> all(array['title','category','description','evidencePath','latitude','longitude','incidentTime','locationName'])) then
    raise exception using errcode = '22023', message = 'unsupported_report_fields';
  end if;
  if jsonb_typeof(p_payload->'title') <> 'string' or jsonb_typeof(p_payload->'category') <> 'string'
    or jsonb_typeof(p_payload->'description') <> 'string' or jsonb_typeof(p_payload->'evidencePath') <> 'string'
    or jsonb_typeof(p_payload->'latitude') <> 'number' or jsonb_typeof(p_payload->'longitude') <> 'number'
    or jsonb_typeof(p_payload->'incidentTime') <> 'string'
    or (p_payload ? 'locationName' and jsonb_typeof(p_payload->'locationName') not in ('string', 'null')) then
    raise exception using errcode = '22023', message = 'invalid_report_field_types';
  end if;
  v_title := btrim(p_payload->>'title'); v_description := btrim(p_payload->>'description');
  v_category := (p_payload->>'category')::public.threat_category;
  v_image_path := p_payload->>'evidencePath';
  v_latitude := (p_payload->>'latitude')::numeric; v_longitude := (p_payload->>'longitude')::numeric;
  v_location := nullif(btrim(p_payload->>'locationName'), '');
  if char_length(v_title) not between 5 and 160 or char_length(v_description) not between 20 and 4000
    or (v_location is not null and char_length(v_location) not between 3 and 160)
    or v_latitude not between -90 and 90 or v_longitude not between -180 and 180
    or v_image_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/sealed/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    or char_length(p_payload->>'incidentTime') > 40
    or (p_payload->>'incidentTime') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' then
    raise exception using errcode = '22023', message = 'invalid_report_field_values';
  end if;
  v_incident := (p_payload->>'incidentTime')::timestamptz;
  if v_incident > clock_timestamp() then
    raise exception using errcode = '23514', message = 'incident_time_in_future';
  end if;
  return jsonb_build_object(
    'title', v_title, 'category', v_category, 'description', v_description,
    'evidencePath', v_image_path, 'latitude', v_latitude, 'longitude', v_longitude,
    'incidentTime', to_char(v_incident at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'locationName', v_location
  );
end;
$$;

create function public.create_report(p_actor_id uuid, p_idempotency_key uuid, p_payload jsonb, p_is_simulation boolean default false)
returns public.reports language plpgsql security definer set search_path = '' as $$
declare
  v_payload jsonb;
  v_existing private.report_submission_keys%rowtype;
  v_upload public.evidence_uploads%rowtype;
  v_report public.reports%rowtype;
begin
  if p_actor_id is null or p_idempotency_key is null or p_is_simulation is null
    or not exists (select 1 from public.profiles where id = p_actor_id) then
    raise exception using errcode = '42501', message = 'report_actor_required';
  end if;
  v_payload := private.validate_report_payload(p_payload);
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text || ':' || p_idempotency_key::text, 0));
  select * into v_existing from private.report_submission_keys
  where user_id = p_actor_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_snapshot <> v_payload or v_existing.is_simulation is distinct from p_is_simulation then
      raise exception using errcode = '23505', message = 'idempotency_key_reused';
    end if;
    select * into v_report from public.reports where id = v_existing.report_id;
    return v_report;
  end if;
  select * into v_upload from public.evidence_uploads
  where sealed_path = v_payload->>'evidencePath' for update;
  if not found then raise exception using errcode = 'P0002', message = 'upload_not_found'; end if;
  if v_upload.user_id <> p_actor_id then
    raise exception using errcode = '42501', message = 'upload_owner_mismatch';
  end if;
  if v_upload.status <> 'finalized' then
    raise exception using errcode = '23514', message = 'upload_not_finalized';
  end if;
  if v_upload.expires_at <= clock_timestamp() then
    raise exception using errcode = '23514', message = 'upload_expired';
  end if;
  insert into public.reports (
    user_id, title, category, description, image_path, latitude, longitude,
    location_name, incident_time, idempotency_key, is_simulation
  ) values (
    p_actor_id, v_payload->>'title', (v_payload->>'category')::public.threat_category,
    v_payload->>'description', v_upload.sealed_path,
    (v_payload->>'latitude')::numeric, (v_payload->>'longitude')::numeric,
    v_payload->>'locationName', (v_payload->>'incidentTime')::timestamptz, p_idempotency_key, p_is_simulation
  ) returning * into v_report;
  update public.evidence_uploads set status = 'attached', report_id = v_report.id
  where id = v_upload.id;
  insert into private.report_submission_keys (user_id, idempotency_key, request_snapshot, is_simulation, report_id)
  values (p_actor_id, p_idempotency_key, v_payload, p_is_simulation, v_report.id);
  return v_report;
end;
$$;

create function public.update_owned_report(
  p_actor_id uuid, p_report_id uuid, p_expected_revision integer, p_payload jsonb
)
returns public.reports language plpgsql security definer set search_path = '' as $$
declare
  v_payload jsonb;
  v_report public.reports%rowtype;
  v_upload public.evidence_uploads%rowtype;
  v_previous_status public.report_status;
begin
  if p_actor_id is null or p_expected_revision is null or p_expected_revision < 1 then
    raise exception using errcode = '22023', message = 'invalid_report_correction';
  end if;
  v_payload := private.validate_report_payload(p_payload);
  select * into v_report from public.reports where id = p_report_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'report_not_found'; end if;
  if v_report.user_id <> p_actor_id then
    raise exception using errcode = '42501', message = 'report_owner_required';
  end if;
  if v_report.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'report_revision_conflict';
  end if;
  if v_report.status not in ('pending_analysis', 'analysis_failed', 'pending_verification', 'needs_more_information') then
    raise exception using errcode = '23514', message = 'report_not_editable';
  end if;
  if v_report.image_path <> v_payload->>'evidencePath' then
    select * into v_upload from public.evidence_uploads
    where sealed_path = v_payload->>'evidencePath' for update;
    if not found then raise exception using errcode = 'P0002', message = 'upload_not_found'; end if;
    if v_upload.user_id <> p_actor_id then
      raise exception using errcode = '42501', message = 'upload_owner_mismatch';
    end if;
    if v_upload.status <> 'finalized' then
      raise exception using errcode = '23514', message = 'upload_not_finalized';
    end if;
    if v_upload.expires_at <= clock_timestamp() then
      raise exception using errcode = '23514', message = 'upload_expired';
    end if;
  end if;
  v_previous_status := v_report.status;
  update public.reports set
    title = v_payload->>'title', category = (v_payload->>'category')::public.threat_category,
    description = v_payload->>'description', image_path = v_payload->>'evidencePath',
    latitude = (v_payload->>'latitude')::numeric, longitude = (v_payload->>'longitude')::numeric,
    location_name = v_payload->>'locationName', incident_time = (v_payload->>'incidentTime')::timestamptz,
    status = 'pending_analysis', revision = revision + 1, priority_dirty = true,
    is_public = false, public_summary = null, published_by = null, published_at = null
  where id = p_report_id returning * into v_report;
  if v_upload.id is not null then
    update public.evidence_uploads set status = 'attached', report_id = v_report.id where id = v_upload.id;
  end if;
  insert into public.report_updates (
    report_id, report_revision, actor_type, actor_id, action, previous_status, new_status
  ) values (
    v_report.id, v_report.revision, 'user', p_actor_id, 'report_corrected', v_previous_status, v_report.status
  );
  return v_report;
end;
$$;

create function public.platform_statistics()
returns table (total_reports bigint, verified_reports bigint, in_progress_reports bigint, named_locations bigint)
language sql stable security definer set search_path = '' as $$
  select count(*),
    count(*) filter (where status in ('verified', 'in_progress', 'resolved')),
    count(*) filter (where status = 'in_progress'),
    count(distinct lower(btrim(location_name))) filter (where location_name is not null)
  from public.reports where not is_simulation;
$$;

-- All receipt/status writes require authenticated Nuxt authorization first.
revoke insert on public.reports from service_role;
revoke all on function private.guard_new_upload_receipt(), private.validate_report_payload(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_evidence_upload(uuid, uuid, uuid),
  public.complete_evidence_upload(uuid, uuid, uuid, integer, text, text),
  public.fail_evidence_upload(uuid, uuid, uuid),
  public.delete_expired_evidence_upload(uuid, uuid),
  public.create_report(uuid, uuid, jsonb, boolean),
  public.update_owned_report(uuid, uuid, integer, jsonb),
  public.platform_statistics()
  from public, anon, authenticated;
grant execute on function public.claim_evidence_upload(uuid, uuid, uuid),
  public.complete_evidence_upload(uuid, uuid, uuid, integer, text, text),
  public.fail_evidence_upload(uuid, uuid, uuid),
  public.delete_expired_evidence_upload(uuid, uuid),
  public.create_report(uuid, uuid, jsonb, boolean),
  public.update_owned_report(uuid, uuid, integer, jsonb),
  public.platform_statistics()
  to service_role;

comment on table public.evidence_uploads is
  'Service-only evidence receipts. Incoming signed tokens cannot reference the separate sealed JPEG object.';
comment on table private.report_submission_keys is
  'Immutable canonical request snapshots for owner-scoped idempotency; no browser or service table access.';
