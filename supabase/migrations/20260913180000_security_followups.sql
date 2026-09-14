-- Phase 7 final-review follow-ups (L9, L10 — code-reviewer-260913-phase-07-final.md).

-- ---------------------------------------------------------------------------
-- L9: `shares_active_org` only checked membership status, not the
-- organization's own status (D29). A member of a DEACTIVATED org could still
-- resolve a co-member's name via `profiles_select`. Every other membership
-- check in the codebase (`is_org_member`) already requires the org itself to
-- be ACTIVE — this brings the helper in line.
-- ---------------------------------------------------------------------------
create or replace function shares_active_org(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from organization_memberships mine
    join organization_memberships theirs
      on theirs.organization_id = mine.organization_id
    join organizations o
      on o.id = mine.organization_id
    where mine.user_id = (select auth.uid())
      and mine.status = 'ACTIVE'
      and theirs.user_id = p_user
      and theirs.status = 'ACTIVE'
      and o.status = 'ACTIVE'
  );
$$;

revoke execute on function shares_active_org(uuid) from public, anon;
grant execute on function shares_active_org(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- L10: reorder_modules/lessons/content_blocks were only audited from the TS
-- Server Action wrapper — a direct RPC call (PostgREST) bypassed audit
-- entirely. Moving `log_audit` into the RPCs closes that gap and, as a side
-- effect, fixes M1 (the TS wrapper attributed the audit row to the caller's
-- own org via `ctx.organizationId`, not the entity's org — the RPC already
-- has the entity's course row in hand, so it derives the org correctly). The
-- TS wrappers no longer call `logAudit` (see reorder-modules.ts/
-- reorder-lessons.ts/reorder-blocks.ts) so a UI-driven reorder is audited
-- exactly once.
-- ---------------------------------------------------------------------------
create or replace function reorder_modules(p_course uuid, p_ordered_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
begin
  if coalesce((select can_edit_course(p_course)), false) is not true then
    raise exception 'Not allowed to edit this course' using errcode = 'insufficient_privilege';
  end if;

  if (select count(*) from modules where course_id = p_course)
     <> coalesce(array_length(p_ordered_ids, 1), 0) then
    raise exception 'Ordered id list must contain every module of the course'
      using errcode = 'invalid_parameter_value';
  end if;

  update modules m
  set position = ordered.ord
  from unnest(p_ordered_ids) with ordinality as ordered(id, ord)
  where m.id = ordered.id
    and m.course_id = p_course;

  select organization_id into v_org from courses where id = p_course;
  perform log_audit(v_org, 'module.reordered', 'course', p_course, jsonb_build_object('orderedIds', p_ordered_ids));
end;
$$;

revoke execute on function reorder_modules(uuid, uuid[]) from public, anon;
grant execute on function reorder_modules(uuid, uuid[]) to authenticated;

create or replace function reorder_lessons(p_module uuid, p_ordered_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_course uuid;
  v_org uuid;
begin
  v_course := (select course_id_of_module(p_module));

  if coalesce((select can_edit_course(v_course)), false) is not true then
    raise exception 'Not allowed to edit this course' using errcode = 'insufficient_privilege';
  end if;

  if (select count(*) from lessons where module_id = p_module)
     <> coalesce(array_length(p_ordered_ids, 1), 0) then
    raise exception 'Ordered id list must contain every lesson of the module'
      using errcode = 'invalid_parameter_value';
  end if;

  update lessons l
  set position = ordered.ord
  from unnest(p_ordered_ids) with ordinality as ordered(id, ord)
  where l.id = ordered.id
    and l.module_id = p_module;

  select organization_id into v_org from courses where id = v_course;
  perform log_audit(v_org, 'lesson.reordered', 'module', p_module, jsonb_build_object('orderedIds', p_ordered_ids));
end;
$$;

revoke execute on function reorder_lessons(uuid, uuid[]) from public, anon;
grant execute on function reorder_lessons(uuid, uuid[]) to authenticated;

create or replace function reorder_content_blocks(p_lesson uuid, p_ordered_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_course uuid;
  v_org uuid;
begin
  v_course := (select course_id_of_lesson(p_lesson));

  if coalesce((select can_edit_course(v_course)), false) is not true then
    raise exception 'Not allowed to edit this course' using errcode = 'insufficient_privilege';
  end if;

  if (select count(*) from lesson_content_blocks where lesson_id = p_lesson)
     <> coalesce(array_length(p_ordered_ids, 1), 0) then
    raise exception 'Ordered id list must contain every block of the lesson'
      using errcode = 'invalid_parameter_value';
  end if;

  update lesson_content_blocks b
  set position = ordered.ord
  from unnest(p_ordered_ids) with ordinality as ordered(id, ord)
  where b.id = ordered.id
    and b.lesson_id = p_lesson;

  select organization_id into v_org from courses where id = v_course;
  perform log_audit(v_org, 'content_block.reordered', 'lesson', p_lesson, jsonb_build_object('orderedIds', p_ordered_ids));
end;
$$;

revoke execute on function reorder_content_blocks(uuid, uuid[]) from public, anon;
grant execute on function reorder_content_blocks(uuid, uuid[]) to authenticated;
