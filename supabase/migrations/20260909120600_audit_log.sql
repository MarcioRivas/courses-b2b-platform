-- Audit log table + writer RPC (docs/authorization.md, decisions C15, D28)

create table audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references organizations (id) on delete set null,
  actor_user_id uuid references profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index audit_logs_organization_id_created_at_idx on audit_logs (organization_id, created_at desc);
create index audit_logs_entity_type_entity_id_idx on audit_logs (entity_type, entity_id);

alter table audit_logs enable row level security;
alter table audit_logs force row level security;

-- SELECT only for org/platform admins; no INSERT policy for authenticated (C15/D28)
create policy audit_logs_select on audit_logs
  for select to authenticated
  using (
    (select is_platform_admin())
    or (organization_id is not null and (select is_org_admin(organization_id)))
  );

create function log_audit(
  p_org uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
begin
  v_actor := auth.uid();

  if p_action is null or length(trim(p_action)) = 0 then
    raise exception 'p_action must not be empty' using errcode = 'invalid_parameter_value';
  end if;

  if coalesce((select is_org_member(p_org)) or (select is_platform_admin()), false) is not true then
    raise exception 'Caller is not a member of this organization' using errcode = 'insufficient_privilege';
  end if;

  insert into audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_org, v_actor, p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

revoke execute on function log_audit(uuid, text, text, uuid, jsonb) from public, anon;
grant execute on function log_audit(uuid, text, text, uuid, jsonb) to authenticated;
