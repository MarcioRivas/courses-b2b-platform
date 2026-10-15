-- In-app notifications (bell + unread badge) for students and professors.
--
-- One row per (user, type, entity). Time-based types are written by the cron
-- sweep with ON CONFLICT DO NOTHING (idempotent reruns); event types (graded,
-- late submissions, needs grading) are upserted by the attempt trigger, which
-- refreshes the payload and re-surfaces the row as unread.
--
-- No client writes (D24): rows are created only by SECURITY DEFINER code and
-- marked read through RPCs. Links/copy are built in TS from type + payload.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
create type notification_type as enum (
  'MODULE_OPENED',
  'MODULE_CLOSING_SOON',
  'ASSESSMENT_GRADED',
  'ASSESSMENT_DUE_SOON',
  'TASK_READY_TO_GRADE',
  'LATE_SUBMISSIONS',
  'ATTEMPT_NEEDS_GRADING',
  'EXAM_TODAY'
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  type notification_type not null,
  -- module_id (MODULE_*), attempt_id (ASSESSMENT_GRADED), assessment_id (rest).
  entity_id uuid not null,
  offering_id uuid references course_offerings (id) on delete cascade,
  -- Titles, ids and counts for the TS presentation layer. Never app routes.
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notifications_unique_entity unique (user_id, type, entity_id)
);

create index notifications_user_updated_idx on notifications (user_id, updated_at desc);
create index notifications_user_unread_idx on notifications (user_id) where read_at is null;

alter table notifications enable row level security;
alter table notifications force row level security;

revoke all on notifications from anon;
revoke insert, update, delete, truncate, references, trigger on notifications from authenticated;

-- Own rows only. Also what Realtime applies to each subscriber.
create policy notifications_select on notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Internal write helper (no client EXECUTE)
-- ---------------------------------------------------------------------------

/**
 * Creates or refreshes one notification. Never notifies the user who caused the
 * event (auth.uid() is null under cron, so nothing is skipped there).
 * p_bump = false: keep the first row (cron types).
 * p_bump = true: refresh payload, mark unread again and move it to the top.
 */
create function upsert_notification(
  p_user uuid,
  p_org uuid,
  p_type notification_type,
  p_entity uuid,
  p_offering uuid,
  p_payload jsonb,
  p_bump boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user is null or p_user = (select auth.uid()) then
    return;
  end if;

  if p_bump then
    insert into notifications (user_id, organization_id, type, entity_id, offering_id, payload)
    values (p_user, p_org, p_type, p_entity, p_offering, coalesce(p_payload, '{}'::jsonb))
    on conflict on constraint notifications_unique_entity do update
      set payload = excluded.payload,
          read_at = null,
          updated_at = now();
  else
    insert into notifications (user_id, organization_id, type, entity_id, offering_id, payload)
    values (p_user, p_org, p_type, p_entity, p_offering, coalesce(p_payload, '{}'::jsonb))
    on conflict on constraint notifications_unique_entity do nothing;
  end if;
end;
$$;

revoke execute on function upsert_notification(uuid, uuid, notification_type, uuid, uuid, jsonb, boolean)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Read / mark-read RPCs (caller's own rows in their active org)
-- ---------------------------------------------------------------------------

/**
 * Newest first; keyset pagination on (updated_at, id): pass the last row's
 * updated_at and id. The id breaks ties: sweep rows share one now().
 */
create function my_notifications(
  p_limit int default 20,
  p_before timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  type notification_type,
  entity_id uuid,
  offering_id uuid,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := (select auth.uid());
  v_org uuid := (select my_active_org());
begin
  if v_me is null or v_org is null then
    raise exception 'FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;

  return query
  select n.id, n.type, n.entity_id, n.offering_id, n.payload, n.read_at, n.created_at, n.updated_at
  from notifications n
  where n.user_id = v_me
    and n.organization_id = v_org
    and (
      p_before is null
      or (p_before_id is null and n.updated_at < p_before)
      or (n.updated_at, n.id) < (p_before, p_before_id)
    )
  order by n.updated_at desc, n.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

revoke execute on function my_notifications(int, timestamptz, uuid) from public, anon;
grant execute on function my_notifications(int, timestamptz, uuid) to authenticated;

/** Unread badge count; 0 when the caller has no active org. */
create function my_unread_notification_count()
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int
  from notifications n
  where n.user_id = (select auth.uid())
    and n.organization_id = (select my_active_org())
    and n.read_at is null;
$$;

revoke execute on function my_unread_notification_count() from public, anon;
grant execute on function my_unread_notification_count() to authenticated;

/** Marks one of the caller's notifications read. Someone else's id updates nothing. */
create function mark_notification_read(p_notification uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;

  update notifications n
  set read_at = now()
  where n.id = p_notification
    and n.user_id = (select auth.uid())
    and n.read_at is null;
end;
$$;

revoke execute on function mark_notification_read(uuid) from public, anon;
grant execute on function mark_notification_read(uuid) to authenticated;

create function mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;

  update notifications n
  set read_at = now()
  where n.user_id = (select auth.uid())
    and n.organization_id = (select my_active_org())
    and n.read_at is null;
end;
$$;

revoke execute on function mark_all_notifications_read() from public, anon;
grant execute on function mark_all_notifications_read() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Realtime: INSERT (new) and UPDATE (grouped bump / read) per subscriber.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table notifications;
