-- Phase 3: atomic, server-only analysis attempts and workflow/audit updates.
-- Apply after 001, 002 and 003. No accounts, incidents or AI results are seeded.

create or replace function private.validate_analysis_output(p_output jsonb)
returns jsonb language plpgsql set search_path = '' as $$
begin
  if p_output is null or jsonb_typeof(p_output) <> 'object'
    or not (p_output ?& array['category','detected_indicators','visual_observation','risk_level',
      'confidence','reasoning_summary','recommendation','needs_human_verification']) then
    raise exception using errcode = '22023', message = 'invalid_analysis_output';
  end if;
  if exists (select 1 from jsonb_object_keys(p_output) as k(key) where k.key <> all(array[
    'category','detected_indicators','visual_observation','risk_level','confidence',
    'reasoning_summary','recommendation','needs_human_verification']))
    or jsonb_typeof(p_output->'category') <> 'string'
    or jsonb_typeof(p_output->'risk_level') <> 'string'
    or jsonb_typeof(p_output->'confidence') <> 'number'
    or jsonb_typeof(p_output->'detected_indicators') <> 'array'
    or jsonb_typeof(p_output->'visual_observation') <> 'string'
    or jsonb_typeof(p_output->'reasoning_summary') <> 'string'
    or jsonb_typeof(p_output->'recommendation') <> 'string'
    or p_output->'needs_human_verification' is distinct from 'true'::jsonb then
    raise exception using errcode = '22023', message = 'invalid_analysis_output';
  end if;
  if p_output->>'category' <> all(array['illegal_logging_suspected','forest_fire','land_clearing',
      'suspicious_human_activity','other_environmental_threat','uncertain'])
    or p_output->>'risk_level' <> all(array['high','medium','low','uncertain'])
    or (p_output->>'confidence')::numeric not between 0 and 1
    or jsonb_array_length(p_output->'detected_indicators') > 20
    or char_length(btrim(p_output->>'visual_observation')) not between 1 and 2000
    or char_length(btrim(p_output->>'reasoning_summary')) not between 1 and 2000
    or char_length(btrim(p_output->>'recommendation')) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'invalid_analysis_output';
  end if;
  if exists (select 1 from jsonb_array_elements(p_output->'detected_indicators') as i(value)
    where jsonb_typeof(i.value) <> 'string' or char_length(btrim(i.value #>> '{}')) not between 1 and 100) then
    raise exception using errcode = '22023', message = 'invalid_analysis_output';
  end if;
  return jsonb_build_object(
    'category',p_output->>'category',
    'detected_indicators',coalesce((select jsonb_agg(btrim(i.value #>> '{}') order by i.ordinality)
      from jsonb_array_elements(p_output->'detected_indicators') with ordinality as i(value,ordinality)), '[]'::jsonb),
    'visual_observation',btrim(p_output->>'visual_observation'),
    'risk_level',p_output->>'risk_level','confidence',(p_output->>'confidence')::numeric,
    'reasoning_summary',btrim(p_output->>'reasoning_summary'),
    'recommendation',btrim(p_output->>'recommendation'),'needs_human_verification',true
  );
end;
$$;

-- Called only after the public RPC has locked the report and attempt, checked
-- the actor, and selected an allowlisted safe failure code. No provider text.
create or replace function private.close_analysis_failure(
  p_analysis_id uuid, p_error_code text, p_change_status boolean
)
returns public.ai_analyses language plpgsql set search_path = '' as $$
declare
  v_analysis public.ai_analyses%rowtype;
  v_report public.reports%rowtype;
  v_previous_status public.report_status;
begin
  select * into v_analysis from public.ai_analyses where id=p_analysis_id;
  if not found then raise exception using errcode='P0002',message='analysis_not_found'; end if;
  if v_analysis.analysis_status in ('succeeded','failed') then return v_analysis; end if;
  select * into v_report from public.reports where id=v_analysis.report_id;
  v_previous_status := v_report.status;
  if p_change_status and v_report.revision=v_analysis.report_revision and v_report.status='pending_analysis' then
    update public.reports set status='analysis_failed' where id=v_report.id returning * into v_report;
  end if;
  update public.ai_analyses set analysis_status='failed',error_code=p_error_code,
    processing_expires_at=null,completed_at=clock_timestamp(),
    detected_category=null,detected_indicators=null,visual_observation=null,reasoning_summary=null,
    confidence=null,risk_level=null,recommendation=null,raw_response=null
  where id=v_analysis.id returning * into v_analysis;
  insert into public.report_updates(report_id,report_revision,actor_type,action,previous_status,new_status,note)
  values(v_report.id,v_analysis.report_revision,'system','ai_analysis_failed',v_previous_status,v_report.status,p_error_code);
  return v_analysis;
end;
$$;

create or replace function public.claim_report_analysis(
  p_report_id uuid, p_actor_id uuid, p_expected_revision integer,
  p_model_name text, p_prompt_version text, p_force boolean default false
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_report public.reports%rowtype;
  v_analysis public.ai_analyses%rowtype;
  v_expired public.ai_analyses%rowtype;
  v_admin boolean;
  v_previous_status public.report_status;
  v_now timestamptz;
begin
  if p_actor_id is null or not exists(select 1 from public.profiles where id=p_actor_id) then
    raise exception using errcode='42501',message='analysis_actor_required';
  end if;
  if p_expected_revision is null or p_expected_revision<1 or p_force is null
    or p_model_name is null or char_length(btrim(p_model_name)) not between 1 and 100
    or p_prompt_version is null or char_length(btrim(p_prompt_version)) not between 1 and 80 then
    raise exception using errcode='22023',message='invalid_analysis_request';
  end if;
  select * into v_report from public.reports where id=p_report_id for update;
  if not found then raise exception using errcode='P0002',message='report_not_found'; end if;
  v_admin := exists(select 1 from public.profiles where id=p_actor_id and role='admin');
  if v_report.user_id<>p_actor_id and not v_admin then
    raise exception using errcode='42501',message='analysis_owner_required';
  end if;
  if p_force and not v_admin then raise exception using errcode='42501',message='analysis_force_admin_required'; end if;
  if v_report.revision<>p_expected_revision then
    raise exception using errcode='PT409',message='report_revision_conflict';
  end if;
  if not p_force then
    select * into v_analysis from public.ai_analyses where report_id=v_report.id
      and report_revision=v_report.revision and analysis_status='succeeded'
      order by created_at desc,id desc limit 1;
    if found then return jsonb_build_object('analysis',to_jsonb(v_analysis),'claimed',false); end if;
  end if;
  if v_report.status not in ('pending_analysis','analysis_failed') and not (v_admin and p_force) then
    raise exception using errcode='PT409',message='analysis_not_eligible';
  end if;
  -- Take the lease clock after waiting for the report lock, so a new attempt
  -- receives its full bounded processing interval rather than an old timestamp.
  v_now := clock_timestamp();
  -- A material edit or officer decision increments revision. Obsolete active
  -- attempts can be closed immediately; expired leases never reuse their UUID.
  for v_expired in select * from public.ai_analyses where report_id=v_report.id
    and analysis_status in ('pending','processing')
    and (report_revision<>v_report.revision or coalesce(processing_expires_at,created_at+interval '120 seconds')<=v_now)
    order by created_at,id for update
  loop
    perform private.close_analysis_failure(v_expired.id,
      case when v_expired.report_revision<>v_report.revision then 'AI_STALE_REPORT' else 'AI_INTERRUPTED' end,false);
  end loop;
  select * into v_analysis from public.ai_analyses where report_id=v_report.id
    and report_revision=v_report.revision and analysis_status in ('pending','processing')
    order by created_at desc,id desc limit 1 for update;
  if found then return jsonb_build_object('analysis',to_jsonb(v_analysis),'claimed',false); end if;
  v_previous_status := v_report.status;
  if v_report.status='analysis_failed' then
    update public.reports set status='pending_analysis' where id=v_report.id returning * into v_report;
  end if;
  insert into public.ai_analyses(report_id,report_revision,analysis_status,model_name,prompt_version,processing_expires_at)
  values(v_report.id,v_report.revision,'processing',btrim(p_model_name),btrim(p_prompt_version),v_now+interval '120 seconds')
  returning * into v_analysis;
  insert into public.report_updates(report_id,report_revision,actor_type,actor_id,admin_id,action,previous_status,new_status)
  values(v_report.id,v_report.revision,case when v_admin then 'admin'::public.audit_actor_type else 'user'::public.audit_actor_type end,
    p_actor_id,case when v_admin then p_actor_id else null end,'ai_analysis_requested',v_previous_status,v_report.status);
  return jsonb_build_object('analysis',to_jsonb(v_analysis),'claimed',true);
end;
$$;

create or replace function public.complete_report_analysis(p_analysis_id uuid,p_actor_id uuid,p_output jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_report_id uuid;
  v_report public.reports%rowtype;
  v_analysis public.ai_analyses%rowtype;
  v_output jsonb;
  v_reason text;
  v_previous_status public.report_status;
begin
  select report_id into v_report_id from public.ai_analyses where id=p_analysis_id;
  if not found then raise exception using errcode='P0002',message='analysis_not_found'; end if;
  select * into v_report from public.reports where id=v_report_id for update;
  if p_actor_id is null or (v_report.user_id<>p_actor_id and not exists(
    select 1 from public.profiles where id=p_actor_id and role='admin')) then
    raise exception using errcode='42501',message='analysis_owner_required';
  end if;
  select * into v_analysis from public.ai_analyses where id=p_analysis_id for update;
  if v_analysis.analysis_status='failed' then
    return jsonb_build_object('analysis',to_jsonb(v_analysis),'accepted',false,'reason',v_analysis.error_code);
  end if;
  v_output := private.validate_analysis_output(p_output);
  if v_analysis.analysis_status='succeeded' then
    if v_analysis.raw_response is distinct from v_output then
      raise exception using errcode='PT409',message='analysis_completion_conflict';
    end if;
    return jsonb_build_object('analysis',to_jsonb(v_analysis),'accepted',v_report.revision=v_analysis.report_revision,
      'reason',case when v_report.revision<>v_analysis.report_revision then 'AI_STALE_REPORT' else null end);
  end if;
  if v_analysis.analysis_status<>'processing' then
    raise exception using errcode='PT409',message='analysis_not_processing';
  end if;
  if v_report.revision<>v_analysis.report_revision then v_reason:='AI_STALE_REPORT';
  elsif v_analysis.processing_expires_at<=clock_timestamp() then v_reason:='AI_INTERRUPTED'; end if;
  if v_reason is not null then
    v_analysis:=private.close_analysis_failure(v_analysis.id,v_reason,true);
    return jsonb_build_object('analysis',to_jsonb(v_analysis),'accepted',false,'reason',v_reason);
  end if;
  v_previous_status:=v_report.status;
  update public.ai_analyses set analysis_status='succeeded',detected_category=v_output->>'category',
    detected_indicators=v_output->'detected_indicators',visual_observation=v_output->>'visual_observation',
    reasoning_summary=v_output->>'reasoning_summary',confidence=(v_output->>'confidence')::numeric,
    risk_level=(v_output->>'risk_level')::public.risk_level,recommendation=v_output->>'recommendation',
    needs_human_verification=true,raw_response=v_output,error_code=null,processing_expires_at=null,completed_at=clock_timestamp()
  where id=v_analysis.id returning * into v_analysis;
  update public.reports set status=case when status='pending_analysis' then 'pending_verification'::public.report_status else status end,
    priority_dirty=true,priority_recalculate_at=clock_timestamp()
  where id=v_report.id returning * into v_report;
  insert into public.report_updates(report_id,report_revision,actor_type,action,previous_status,new_status)
  values(v_report.id,v_analysis.report_revision,'system','ai_analysis_succeeded',v_previous_status,v_report.status);
  return jsonb_build_object('analysis',to_jsonb(v_analysis),'accepted',true,'reason',null);
end;
$$;

create or replace function public.fail_report_analysis(p_analysis_id uuid,p_actor_id uuid,p_error_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_report_id uuid;
  v_report public.reports%rowtype;
  v_analysis public.ai_analyses%rowtype;
  v_reason text;
begin
  if p_error_code is null or p_error_code<>all(array[
    'AI_NOT_CONFIGURED','AI_TIMEOUT','AI_QUOTA_EXCEEDED','AI_AUTH_FAILED','AI_MODEL_UNAVAILABLE',
    'AI_PROVIDER_UNAVAILABLE','AI_INVALID_OUTPUT','AI_BLOCKED','AI_EVIDENCE_UNAVAILABLE','AI_INTERRUPTED','AI_STALE_REPORT']) then
    raise exception using errcode='22023',message='invalid_analysis_failure';
  end if;
  select report_id into v_report_id from public.ai_analyses where id=p_analysis_id;
  if not found then raise exception using errcode='P0002',message='analysis_not_found'; end if;
  select * into v_report from public.reports where id=v_report_id for update;
  if p_actor_id is null or (v_report.user_id<>p_actor_id and not exists(
    select 1 from public.profiles where id=p_actor_id and role='admin')) then
    raise exception using errcode='42501',message='analysis_owner_required';
  end if;
  select * into v_analysis from public.ai_analyses where id=p_analysis_id for update;
  if v_analysis.analysis_status='succeeded' then
    return jsonb_build_object('analysis',to_jsonb(v_analysis),'accepted',false,'reason',null);
  end if;
  if v_analysis.analysis_status='failed' then
    if v_analysis.error_code is distinct from p_error_code and v_analysis.error_code not in ('AI_STALE_REPORT','AI_INTERRUPTED') then
      raise exception using errcode='PT409',message='analysis_failure_conflict';
    end if;
    return jsonb_build_object('analysis',to_jsonb(v_analysis),
      'accepted',v_report.revision=v_analysis.report_revision and v_analysis.error_code not in ('AI_STALE_REPORT','AI_INTERRUPTED'),
      'reason',case when v_report.revision<>v_analysis.report_revision then 'AI_STALE_REPORT' else v_analysis.error_code end);
  end if;
  v_reason:=case when v_report.revision<>v_analysis.report_revision then 'AI_STALE_REPORT'
    when coalesce(v_analysis.processing_expires_at,v_analysis.created_at+interval '120 seconds')<=clock_timestamp() then 'AI_INTERRUPTED'
    else p_error_code end;
  v_analysis:=private.close_analysis_failure(v_analysis.id,v_reason,true);
  return jsonb_build_object('analysis',to_jsonb(v_analysis),'accepted',v_reason not in ('AI_STALE_REPORT','AI_INTERRUPTED'),
    'reason',case when v_reason in ('AI_STALE_REPORT','AI_INTERRUPTED') then v_reason else null end);
end;
$$;

-- A server credential cannot bypass the state machine with direct table writes.
revoke insert,update on public.ai_analyses from service_role;
revoke all on function private.validate_analysis_output(jsonb),private.close_analysis_failure(uuid,text,boolean)
  from public,anon,authenticated,service_role;
revoke all on function public.claim_report_analysis(uuid,uuid,integer,text,text,boolean),
  public.complete_report_analysis(uuid,uuid,jsonb),public.fail_report_analysis(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.claim_report_analysis(uuid,uuid,integer,text,text,boolean),
  public.complete_report_analysis(uuid,uuid,jsonb),public.fail_report_analysis(uuid,uuid,text)
  to service_role;

comment on function public.claim_report_analysis(uuid,uuid,integer,text,text,boolean) is
  'Claims one version-bound AI attempt or returns the existing result/lease. Browser callers are denied.';
comment on function public.complete_report_analysis(uuid,uuid,jsonb) is
  'Atomically stores validated AI output and audit. Stale/expired attempts commit a safe failure without altering newer decisions.';
