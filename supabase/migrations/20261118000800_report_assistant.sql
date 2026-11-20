-- Private pre-submission assistance. Existing report creation stays authoritative.
create table if not exists public.report_assistant_drafts (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  upload_id uuid not null references public.evidence_uploads(id) on delete cascade,
  story text not null check (char_length(btrim(story)) between 20 and 1500),
  status text not null default 'processing' check (status in ('processing','ready','failed','submitted')),
  version integer not null default 1 check (version > 0),
  lease_token uuid,
  lease_expires_at timestamptz,
  result jsonb,
  answers jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array' and jsonb_array_length(answers) <= 3),
  model_name text not null check (char_length(model_name) between 1 and 100),
  prompt_version text not null check (char_length(prompt_version) between 1 and 80),
  error_code text check (error_code in ('AI_NOT_CONFIGURED','AI_TIMEOUT','AI_QUOTA_EXCEEDED','AI_AUTH_FAILED','AI_MODEL_UNAVAILABLE','AI_PROVIDER_UNAVAILABLE','AI_INVALID_OUTPUT','AI_BLOCKED','AI_EVIDENCE_UNAVAILABLE','AI_INTERRUPTED')),
  expires_at timestamptz not null,
  report_id uuid references public.reports(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='processing' and lease_token is not null and lease_expires_at is not null)
    or (status<>'processing' and lease_token is null and lease_expires_at is null)),
  check ((status in ('ready','submitted') and result is not null and error_code is null)
    or (status='processing' and result is null and error_code is null)
    or (status='failed' and result is null and error_code is not null)),
  check ((status='submitted') = (report_id is not null)),
  check (result is null or (jsonb_typeof(result)='object' and octet_length(result::text)<=16000))
);
create index if not exists report_assistant_owner_idx on public.report_assistant_drafts(user_id,created_at desc);
alter table public.report_assistant_drafts enable row level security;
drop policy if exists assistant_owner_read on public.report_assistant_drafts;
create policy assistant_owner_read on public.report_assistant_drafts for select to authenticated using (user_id=auth.uid());
revoke all on public.report_assistant_drafts from public,anon,authenticated,service_role;
grant select on public.report_assistant_drafts to authenticated,service_role;

create or replace function public.claim_report_assistant(
  p_id uuid,p_actor_id uuid,p_upload_id uuid,p_story text,p_model_name text,p_prompt_version text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_draft public.report_assistant_drafts%rowtype; v_upload public.evidence_uploads%rowtype;
begin
  if p_id is null or p_actor_id is null or p_upload_id is null or p_story is null
    or char_length(btrim(p_story)) not between 20 and 1500
    or p_model_name is null or char_length(p_model_name) not between 1 and 100
    or p_prompt_version is null or char_length(p_prompt_version) not between 1 and 80 then
    raise exception using errcode='22023',message='invalid_assistant_request';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('assistant:'||p_id::text,0));
  select * into v_draft from public.report_assistant_drafts where id=p_id for update;
  if found then
    if v_draft.user_id<>p_actor_id then raise exception using errcode='P0002',message='assistant_not_found'; end if;
    if v_draft.upload_id<>p_upload_id or v_draft.story<>btrim(p_story) then
      raise exception using errcode='PT409',message='assistant_input_conflict';
    end if;
    if v_draft.status='submitted' then return jsonb_build_object('draft',to_jsonb(v_draft),'claimed',false); end if;
    if v_draft.expires_at<=clock_timestamp() then raise exception using errcode='23514',message='assistant_expired'; end if;
    if v_draft.status='ready' or (v_draft.status='processing' and v_draft.lease_expires_at>clock_timestamp()) then
      return jsonb_build_object('draft',to_jsonb(v_draft),'claimed',false);
    end if;
  end if;
  select * into v_upload from public.evidence_uploads where id=p_upload_id and user_id=p_actor_id for update;
  if not found then raise exception using errcode='P0002',message='assistant_evidence_not_found'; end if;
  if v_upload.status<>'finalized' or v_upload.report_id is not null then
    raise exception using errcode='23514',message='assistant_evidence_not_finalized';
  end if;
  if v_upload.expires_at<=clock_timestamp() then raise exception using errcode='23514',message='assistant_expired'; end if;
  if v_draft.id is null then
    insert into public.report_assistant_drafts(id,user_id,upload_id,story,lease_token,lease_expires_at,model_name,prompt_version,expires_at)
      values(p_id,p_actor_id,p_upload_id,btrim(p_story),gen_random_uuid(),clock_timestamp()+interval '90 seconds',p_model_name,p_prompt_version,v_upload.expires_at)
      returning * into v_draft;
  else
    update public.report_assistant_drafts set status='processing',version=version+1,lease_token=gen_random_uuid(),
      lease_expires_at=clock_timestamp()+interval '90 seconds',result=null,error_code=null,answers='[]',
      model_name=p_model_name,prompt_version=p_prompt_version,updated_at=clock_timestamp()
      where id=p_id returning * into v_draft;
  end if;
  return jsonb_build_object('draft',to_jsonb(v_draft),'claimed',true);
end;
$$;

create or replace function public.finish_report_assistant(
  p_id uuid,p_actor_id uuid,p_lease_token uuid,p_result jsonb default null,p_error_code text default null
) returns public.report_assistant_drafts language plpgsql security definer set search_path='' as $$
declare v_draft public.report_assistant_drafts%rowtype;
begin
  select * into v_draft from public.report_assistant_drafts where id=p_id and user_id=p_actor_id for update;
  if not found then raise exception using errcode='P0002',message='assistant_not_found'; end if;
  if v_draft.status<>'processing' or p_lease_token is null or v_draft.lease_token<>p_lease_token
    or v_draft.lease_expires_at<=clock_timestamp() then
    raise exception using errcode='PT409',message='assistant_lease_conflict';
  end if;
  if v_draft.expires_at<=clock_timestamp() then raise exception using errcode='23514',message='assistant_expired'; end if;
  if (p_result is null) = (p_error_code is null) then raise exception using errcode='22023',message='invalid_assistant_completion'; end if;
  if p_result is not null then
    if jsonb_typeof(p_result) is distinct from 'object' or octet_length(p_result::text)>16000
      or p_result->'needs_human_review' is distinct from 'true'::jsonb
      or jsonb_typeof(p_result->'questions') is distinct from 'array'
      or jsonb_typeof(p_result->'visual_observations') is distinct from 'array'
      or jsonb_typeof(p_result->'suggested_title') is distinct from 'string'
      or char_length(p_result->>'suggested_title') not between 5 and 160
      or jsonb_typeof(p_result->'reported_summary') is distinct from 'string'
      or char_length(p_result->>'reported_summary') not between 1 and 1200
      or jsonb_typeof(p_result->'limitations') is distinct from 'string'
      or char_length(p_result->>'limitations') not between 1 and 1000
      or coalesce(p_result->>'suggested_category','')<>all(array['illegal_logging_suspected','forest_fire','land_clearing','suspicious_human_activity','other_environmental_threat','uncertain']) then
      raise exception using errcode='22023',message='invalid_assistant_output';
    end if;
    if jsonb_array_length(p_result->'questions')>3 or jsonb_array_length(p_result->'visual_observations')>5
      or exists(select 1 from jsonb_array_elements(p_result->'visual_observations') i where jsonb_typeof(i)<>'string' or char_length(i#>>'{}') not between 1 and 300)
      or exists(select 1 from jsonb_array_elements(p_result->'questions') q where jsonb_typeof(q) is distinct from 'object'
        or coalesce(q->>'id','')<>all(array['q1','q2','q3']) or jsonb_typeof(q->'text') is distinct from 'string'
        or char_length(q->>'text') not between 5 and 200 or jsonb_typeof(q->'reason') is distinct from 'string' or char_length(q->>'reason') not between 1 and 240)
      or (select count(*)<>count(distinct q->>'id') from jsonb_array_elements(p_result->'questions') q) then
      raise exception using errcode='22023',message='invalid_assistant_output';
    end if;
  end if;
  update public.report_assistant_drafts set status=case when p_result is null then 'failed' else 'ready' end,
    result=p_result,error_code=p_error_code,lease_token=null,lease_expires_at=null,updated_at=clock_timestamp()
    where id=p_id returning * into v_draft;
  return v_draft;
end;
$$;

create or replace function public.answer_report_assistant(p_id uuid,p_actor_id uuid,p_expected_version integer,p_answers jsonb)
returns public.report_assistant_drafts language plpgsql security definer set search_path='' as $$
declare v_draft public.report_assistant_drafts%rowtype;
begin
  select * into v_draft from public.report_assistant_drafts where id=p_id and user_id=p_actor_id for update;
  if not found then raise exception using errcode='P0002',message='assistant_not_found'; end if;
  if p_expected_version is null or v_draft.version<>p_expected_version or v_draft.status<>'ready' then
    raise exception using errcode='PT409',message='assistant_version_conflict';
  end if;
  if v_draft.expires_at<=clock_timestamp() then raise exception using errcode='23514',message='assistant_expired'; end if;
  if jsonb_typeof(p_answers) is distinct from 'array' then raise exception using errcode='22023',message='invalid_assistant_answers'; end if;
  if jsonb_array_length(p_answers)<>jsonb_array_length(v_draft.result->'questions')
    or exists(select 1 from jsonb_array_elements(p_answers) a where jsonb_typeof(a) is distinct from 'object'
      or jsonb_typeof(a->'text') is distinct from 'string' or char_length(btrim(a->>'text')) not between 1 and 500
      or not exists(select 1 from jsonb_array_elements(v_draft.result->'questions') q where q->>'id'=a->>'id'))
    or (select count(*)<>count(distinct a->>'id') from jsonb_array_elements(p_answers) a) then
    raise exception using errcode='22023',message='invalid_assistant_answers';
  end if;
  update public.report_assistant_drafts set answers=p_answers,version=version+1,updated_at=clock_timestamp()
    where id=p_id returning * into v_draft;
  return v_draft;
end;
$$;

create or replace function public.create_assisted_report(
  p_draft_id uuid,p_actor_id uuid,p_expected_version integer,p_confirmed boolean,
  p_idempotency_key uuid,p_payload jsonb,p_is_simulation boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_draft public.report_assistant_drafts%rowtype; v_upload public.evidence_uploads%rowtype; v_report public.reports%rowtype; v_reused boolean;
begin
  select * into v_draft from public.report_assistant_drafts where id=p_draft_id and user_id=p_actor_id for update;
  if not found then raise exception using errcode='P0002',message='assistant_not_found'; end if;
  if p_confirmed is distinct from true then raise exception using errcode='22023',message='assistant_confirmation_required'; end if;
  if p_expected_version is null or v_draft.version<>p_expected_version or v_draft.status not in ('ready','submitted') then
    raise exception using errcode='PT409',message='assistant_version_conflict';
  end if;
  v_reused := v_draft.report_id is not null;
  if not v_reused and v_draft.expires_at<=clock_timestamp() then raise exception using errcode='23514',message='assistant_expired'; end if;
  if jsonb_array_length(v_draft.answers)<>jsonb_array_length(v_draft.result->'questions') then
    raise exception using errcode='22023',message='assistant_answers_required';
  end if;
  select * into v_upload from public.evidence_uploads where id=v_draft.upload_id for update;
  if not found or v_upload.user_id<>p_actor_id or p_payload->>'evidencePath' is distinct from v_upload.sealed_path then
    raise exception using errcode='42501',message='assistant_evidence_mismatch';
  end if;
  v_report := public.create_report(p_actor_id,p_idempotency_key,p_payload,p_is_simulation);
  if v_reused and v_draft.report_id<>v_report.id then raise exception using errcode='PT409',message='assistant_already_submitted'; end if;
  update public.report_assistant_drafts set status='submitted',report_id=v_report.id,updated_at=clock_timestamp() where id=p_draft_id;
  return jsonb_build_object('report',to_jsonb(v_report),'reused',v_reused);
end;
$$;

revoke all on function public.claim_report_assistant(uuid,uuid,uuid,text,text,text),
  public.finish_report_assistant(uuid,uuid,uuid,jsonb,text),public.answer_report_assistant(uuid,uuid,integer,jsonb),
  public.create_assisted_report(uuid,uuid,integer,boolean,uuid,jsonb,boolean) from public,anon,authenticated,service_role;
grant execute on function public.claim_report_assistant(uuid,uuid,uuid,text,text,text),
  public.finish_report_assistant(uuid,uuid,uuid,jsonb,text),public.answer_report_assistant(uuid,uuid,integer,jsonb),
  public.create_assisted_report(uuid,uuid,integer,boolean,uuid,jsonb,boolean) to service_role;
