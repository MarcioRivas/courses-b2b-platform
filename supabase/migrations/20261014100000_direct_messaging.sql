-- Direct messaging between members of the SAME organization (1:1, text only).
--
-- Boundary: the org is never supplied by the client. It is the caller's single
-- ACTIVE membership (B7) in an ACTIVE org (D29), and both participants must hold
-- an ACTIVE membership in it. Platform admins are not org members, so they can
-- neither start nor read conversations (is_org_admin() is deliberately unused:
-- it returns true for platform admins).
--
-- Privacy: only the two participants can read a conversation. Org admins do NOT
-- read other members' chats. No client writes (D24): every write is an RPC.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  user_a uuid not null references profiles (id) on delete cascade,
  user_b uuid not null references profiles (id) on delete cascade,
  user_a_last_read_at timestamptz,
  user_b_last_read_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  -- One row per unordered pair: the pair is stored sorted.
  constraint conversations_ordered_pair check (user_a < user_b),
  constraint conversations_unique_pair unique (organization_id, user_a, user_b)
);

create index conversations_user_a_idx on conversations (organization_id, user_a, last_message_at desc);
create index conversations_user_b_idx on conversations (organization_id, user_b, last_message_at desc);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender_id uuid not null references profiles (id) on delete cascade,
  -- The other participant, denormalised so each user's Realtime inbox feed can
  -- filter server-side (recipient_id=eq.<uid>) instead of RLS-checking every
  -- insert of the platform against every online user.
  recipient_id uuid not null references profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index messages_conversation_created_idx on messages (conversation_id, created_at desc, id desc);
-- Rate limit lookup in send_message.
create index messages_sender_created_idx on messages (sender_id, created_at desc);

alter table conversations enable row level security;
alter table conversations force row level security;
alter table messages enable row level security;
alter table messages force row level security;

revoke all on conversations, messages from anon;
revoke insert, update, delete, truncate, references, trigger on conversations, messages from authenticated;
-- Read markers stay private: no read receipts, so a participant cannot select
-- the other side's *_last_read_at. Column-level grant on the safe columns only.
revoke select on conversations from authenticated;
grant select (id, organization_id, user_a, user_b, last_message_at, created_at) on conversations to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Internal helpers (no client EXECUTE)
-- ---------------------------------------------------------------------------

/** The caller's org: exactly one ACTIVE membership in an ACTIVE org, else null. */
create function my_active_org()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when count(*) = 1 then min(om.organization_id::text)::uuid end
  from organization_memberships om
  join organizations o on o.id = om.organization_id
  where om.user_id = (select auth.uid())
    and om.status = 'ACTIVE'
    and o.status = 'ACTIVE';
$$;

revoke execute on function my_active_org() from public, anon, authenticated;

/** True when p_user holds an ACTIVE membership in p_org and the org is ACTIVE. */
create function is_active_member_of(p_user uuid, p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select true
      from organization_memberships om
      join organizations o on o.id = om.organization_id
      where om.user_id = p_user
        and om.organization_id = p_org
        and om.status = 'ACTIVE'
        and o.status = 'ACTIVE'
    ),
    false
  );
$$;

revoke execute on function is_active_member_of(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS. Participant-only reads; used by PostgREST and Realtime alike.
-- ---------------------------------------------------------------------------

/** Caller is a participant AND still an ACTIVE member of the conversation's org. */
create function is_conversation_participant(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select (select auth.uid()) in (c.user_a, c.user_b)
        and (select is_active_member_of((select auth.uid()), c.organization_id))
      from conversations c
      where c.id = p_conversation
    ),
    false
  );
$$;

revoke execute on function is_conversation_participant(uuid) from public, anon;
grant execute on function is_conversation_participant(uuid) to authenticated;

create policy conversations_select on conversations
  for select to authenticated
  using ((select is_conversation_participant(id)));

create policy messages_select on messages
  for select to authenticated
  using ((select is_conversation_participant(conversation_id)));

-- ---------------------------------------------------------------------------
-- 4. RPCs
-- ---------------------------------------------------------------------------

/** Member picker: ACTIVE members of the caller's org, excluding the caller. */
create function search_messageable_members(p_q text)
returns table (user_id uuid, first_name text, last_name text, role membership_role)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid := (select my_active_org());
  v_q text := btrim(coalesce(p_q, ''));
  v_pattern text;
begin
  if v_org is null then
    raise exception 'FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;

  if char_length(v_q) < 2 then
    return;
  end if;

  v_pattern := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select p.id, p.first_name, p.last_name, om.role
  from organization_memberships om
  join profiles p on p.id = om.user_id
  where om.organization_id = v_org
    and om.status = 'ACTIVE'
    and om.user_id <> (select auth.uid())
    and (p.first_name || ' ' || p.last_name) ilike v_pattern
  order by p.last_name, p.first_name
  limit 10;
end;
$$;

revoke execute on function search_messageable_members(text) from public, anon;
grant execute on function search_messageable_members(text) to authenticated;

/**
 * Get-or-create the 1:1 conversation with p_user inside the caller's org. A user
 * of another org (or an inactive one) gets the same NOT_FOUND as a missing id:
 * no existence oracle across tenants.
 */
create function start_conversation(p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := (select auth.uid());
  v_org uuid := (select my_active_org());
  v_a uuid;
  v_b uuid;
  v_id uuid;
begin
  if v_me is null or v_org is null then
    raise exception 'FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;

  if p_user is null or p_user = v_me then
    raise exception 'SELF_CONVERSATION' using errcode = 'invalid_parameter_value';
  end if;

  if coalesce((select is_active_member_of(p_user, v_org)), false) is not true then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  v_a := least(v_me, p_user);
  v_b := greatest(v_me, p_user);

  insert into conversations (organization_id, user_a, user_b)
  values (v_org, v_a, v_b)
  on conflict (organization_id, user_a, user_b) do nothing;

  select c.id into v_id
  from conversations c
  where c.organization_id = v_org and c.user_a = v_a and c.user_b = v_b;

  return v_id;
end;
$$;

revoke execute on function start_conversation(uuid) from public, anon;
grant execute on function start_conversation(uuid) to authenticated;

/**
 * Sends a text message. Both participants must still be ACTIVE members of the
 * conversation's org; at most 30 messages per sender per 60 seconds.
 * p_client_id makes it idempotent: the client generates the id, so retrying a
 * send whose response was lost returns the stored message instead of a copy.
 */
create function send_message(p_conversation uuid, p_body text, p_client_id uuid default null)
returns table (id uuid, conversation_id uuid, sender_id uuid, body text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := (select auth.uid());
  v_conv conversations%rowtype;
  v_other uuid;
  -- Trim every kind of whitespace (btrim's default is spaces only), like JS trim().
  v_body text := regexp_replace(coalesce(p_body, ''), '^\s+|\s+$', '', 'g');
  v_msg messages%rowtype;
begin
  if v_me is null then
    raise exception 'FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;

  -- Participant check BEFORE any lock, so outsiders cannot lock someone else's row.
  select * into v_conv from conversations c where c.id = p_conversation;

  if not found or v_me not in (v_conv.user_a, v_conv.user_b)
    or coalesce((select is_active_member_of(v_me, v_conv.organization_id)), false) is not true then
    raise exception 'FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;

  -- Retry of a send that already committed: return it unchanged.
  if p_client_id is not null then
    select * into v_msg from messages m where m.id = p_client_id;
    if found then
      if v_msg.sender_id <> v_me or v_msg.conversation_id <> v_conv.id then
        raise exception 'FORBIDDEN' using errcode = 'insufficient_privilege';
      end if;
      return query select v_msg.id, v_msg.conversation_id, v_msg.sender_id, v_msg.body, v_msg.created_at;
      return;
    end if;
  end if;

  v_other := case when v_conv.user_a = v_me then v_conv.user_b else v_conv.user_a end;

  if coalesce((select is_active_member_of(v_other, v_conv.organization_id)), false) is not true then
    raise exception 'MEMBER_INACTIVE' using errcode = 'insufficient_privilege';
  end if;

  if char_length(v_body) < 1 or char_length(v_body) > 4000 then
    raise exception 'INVALID_BODY' using errcode = 'invalid_parameter_value';
  end if;

  -- Serialise this sender's sends (across all their conversations) so the
  -- rate-limit count cannot be raced past by parallel requests.
  perform pg_advisory_xact_lock(hashtext('send_message:' || v_me::text));

  if (
    select count(*) from messages m
    where m.sender_id = v_me and m.created_at > now() - interval '60 seconds'
  ) >= 30 then
    raise exception 'RATE_LIMITED' using errcode = 'insufficient_privilege';
  end if;

  insert into messages (id, conversation_id, sender_id, recipient_id, body)
  values (coalesce(p_client_id, gen_random_uuid()), v_conv.id, v_me, v_other, v_body)
  on conflict on constraint messages_pkey do nothing
  returning * into v_msg;

  -- Two concurrent retries with the same client id: the loser returns the winner's row.
  if v_msg.id is null then
    select * into v_msg from messages m where m.id = p_client_id and m.sender_id = v_me;
    return query select v_msg.id, v_msg.conversation_id, v_msg.sender_id, v_msg.body, v_msg.created_at;
    return;
  end if;

  update conversations c
  set last_message_at = v_msg.created_at,
      user_a_last_read_at = case when c.user_a = v_me then v_msg.created_at else c.user_a_last_read_at end,
      user_b_last_read_at = case when c.user_b = v_me then v_msg.created_at else c.user_b_last_read_at end
  where c.id = v_conv.id;

  return query select v_msg.id, v_msg.conversation_id, v_msg.sender_id, v_msg.body, v_msg.created_at;
end;
$$;

revoke execute on function send_message(uuid, text, uuid) from public, anon;
grant execute on function send_message(uuid, text, uuid) to authenticated;

/**
 * Marks the conversation read up to p_up_to (the newest message the client has
 * actually shown), never beyond now() and never backwards. Without p_up_to a
 * message committed while the thread was loading would count as read unseen.
 */
create function mark_conversation_read(p_conversation uuid, p_up_to timestamptz default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := (select auth.uid());
  v_at timestamptz := least(coalesce(p_up_to, now()), now());
begin
  if coalesce((select is_conversation_participant(p_conversation)), false) is not true then
    raise exception 'FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;

  update conversations c
  set user_a_last_read_at = case
        when c.user_a = v_me then greatest(coalesce(c.user_a_last_read_at, '-infinity'), v_at)
        else c.user_a_last_read_at end,
      user_b_last_read_at = case
        when c.user_b = v_me then greatest(coalesce(c.user_b_last_read_at, '-infinity'), v_at)
        else c.user_b_last_read_at end
  where c.id = p_conversation;
end;
$$;

revoke execute on function mark_conversation_read(uuid, timestamptz) from public, anon;
grant execute on function mark_conversation_read(uuid, timestamptz) to authenticated;

/**
 * The caller's conversations in their org, with the other participant, the
 * latest message and the unread count. p_conversation narrows to one row (the
 * thread header) and then also returns it before its first message.
 * Names come from here, not from `profiles`, because RLS hides the profile of a
 * deactivated peer while the history stays readable.
 */
create function my_conversations(p_conversation uuid default null)
returns table (
  conversation_id uuid,
  other_user_id uuid,
  other_first_name text,
  other_last_name text,
  other_role membership_role,
  other_is_active boolean,
  last_message_body text,
  last_message_sender_id uuid,
  last_message_at timestamptz,
  unread_count int
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
  with mine as (
    select
      c.id,
      c.last_message_at,
      case when c.user_a = v_me then c.user_b else c.user_a end as other_id,
      case when c.user_a = v_me then c.user_a_last_read_at else c.user_b_last_read_at end as my_read_at
    from conversations c
    where c.organization_id = v_org
      and v_me in (c.user_a, c.user_b)
      and (
        (p_conversation is null and c.last_message_at is not null)
        or c.id = p_conversation
      )
  )
  select
    m.id,
    m.other_id,
    p.first_name,
    p.last_name,
    om.role,
    coalesce(om.status = 'ACTIVE', false),
    left(lm.body, 140),
    lm.sender_id,
    m.last_message_at,
    (
      select count(*)::int
      from messages x
      where x.conversation_id = m.id
        and x.sender_id <> v_me
        and (m.my_read_at is null or x.created_at > m.my_read_at)
    )
  from mine m
  join profiles p on p.id = m.other_id
  left join organization_memberships om on om.user_id = m.other_id and om.organization_id = v_org
  left join lateral (
    select x.body, x.sender_id
    from messages x
    where x.conversation_id = m.id
    order by x.created_at desc, x.id desc
    limit 1
  ) lm on true
  order by m.last_message_at desc nulls last;
end;
$$;

revoke execute on function my_conversations(uuid) from public, anon;
grant execute on function my_conversations(uuid) to authenticated;

/** Total unread messages across the caller's conversations (nav badge). */
create function my_unread_message_count()
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(count(*)::int, 0)
  from conversations c
  join messages x on x.conversation_id = c.id
  where c.organization_id = (select my_active_org())
    and (select auth.uid()) in (c.user_a, c.user_b)
    and x.sender_id <> (select auth.uid())
    and x.created_at > coalesce(
      case when c.user_a = (select auth.uid()) then c.user_a_last_read_at else c.user_b_last_read_at end,
      '-infinity'::timestamptz
    );
$$;

revoke execute on function my_unread_message_count() from public, anon;
grant execute on function my_unread_message_count() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Realtime: new messages are pushed to subscribers that pass messages_select.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table messages;
