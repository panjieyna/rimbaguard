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
