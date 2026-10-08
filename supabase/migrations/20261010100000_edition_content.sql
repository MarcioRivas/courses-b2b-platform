-- B2: content (modules, lessons, blocks, dependencies) and evaluations belong
-- to an EDITION (course_offerings), not to the course.
--
-- * modules.offering_id / assessments.offering_id replace the course_id columns
--   (dropped, so a leftover course-level query fails loudly instead of leaking
--   content across editions).
-- * can_edit_course_content and the course_id_of_* helpers are DROPPED; the new
--   helpers are can_edit_offering, student_can_view_offering and
--   offering_id_of_*. A catalog test asserts the old names are gone.
-- * Existing data: the course's first edition (created_at, id) owns the
--   content; every other edition gets a plain copy through copy_edition_content
--   (also the entry point of B3). Student progress / attempts / checkpoint data
--   of non-first editions is deleted (no production data, the seed is rebuilt).
-- * Signature or return-type changes use DROP FUNCTION + CREATE + re-grant.

-- ---------------------------------------------------------------------------
-- 1. Columns (nullable until the backfill ran)
-- ---------------------------------------------------------------------------
alter table modules add column offering_id uuid references course_offerings (id) on delete cascade;
alter table assessments add column offering_id uuid references course_offerings (id) on delete cascade;

-- Copies are written without a course_id while the old column still exists.
alter table modules alter column course_id drop not null;
alter table assessments alter column course_id drop not null;
alter table modules drop constraint modules_course_position_key;

alter table modules
  add constraint modules_offering_position_key unique (offering_id, position) deferrable initially deferred;
create index modules_offering_id_idx on modules (offering_id);
create index assessments_offering_kind_idx on assessments (offering_id, kind);

-- ---------------------------------------------------------------------------
-- 2. New helpers
-- ---------------------------------------------------------------------------
create function offering_id_of_module(p_module uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.offering_id from modules m where m.id = p_module;
$$;

create function offering_id_of_lesson(p_lesson uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.offering_id
  from lessons l
  join modules m on m.id = l.module_id
  where l.id = p_lesson;
$$;

create function offering_id_of_block(p_block uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.offering_id
  from lesson_content_blocks b
  join lessons l on l.id = b.lesson_id
  join modules m on m.id = l.module_id
  where b.id = p_block;
$$;

create function offering_id_of_assessment(p_assessment uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.offering_id from assessments a where a.id = p_assessment;
$$;

create function course_id_of_offering(p_offering uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.course_id from course_offerings o where o.id = p_offering;
$$;

-- Content authority: org admin or a professor assigned to THAT edition.
create function can_edit_offering(p_offering uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select (select is_org_admin(o.organization_id))
        or (select is_offering_professor(o.id))
      from course_offerings o
      where o.id = p_offering
    ),
    false
  );
$$;

-- Student read access to an edition's content. Mirrors every guard of the
-- course-level rule: PUBLISHED course, ACTIVE edition, enrollment not
-- CANCELLED and an active org membership; a FREE course is readable only
-- through ITS OPEN edition by a member of the course's organization.
create function student_can_view_offering(p_offering uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select c.status = 'PUBLISHED'
        and o.status = 'ACTIVE'
        and (
          (c.access_type = 'FREE' and o.kind = 'OPEN' and (select is_org_member(c.organization_id)))
          or exists (
            select 1
            from course_enrollments e
            where e.offering_id = o.id
              and e.user_id = auth.uid()
              and e.status <> 'CANCELLED'
              and (select is_org_member(e.organization_id))
          )
        )
      from course_offerings o
      join courses c on c.id = o.course_id
      where o.id = p_offering
    ),
    false
  );
$$;

create function required_block_count_for_offering(p_offering uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int
  from lesson_content_blocks b
  join lessons l on l.id = b.lesson_id
  join modules m on m.id = l.module_id
  where m.offering_id = p_offering
    and b.is_required;
$$;

create function refresh_offering_enrollment_totals(p_offering uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total int;
begin
  v_total := (select required_block_count_for_offering(p_offering));

  update course_enrollments
  set total_blocks = v_total
  where offering_id = p_offering
    and total_blocks is distinct from v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. copy_edition_content(source, target) - internal, also used by B3
-- ---------------------------------------------------------------------------
create function copy_edition_content(p_source uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_src course_offerings%rowtype;
  v_tgt course_offerings%rowtype;
begin
  if p_source is null or p_target is null or p_source = p_target then
    raise exception 'COPY_INVALID' using errcode = 'invalid_parameter_value';
  end if;

  -- Both rows locked in id order: two concurrent copies cannot deadlock.
  perform 1 from course_offerings where id in (p_source, p_target) order by id for update;

  select * into v_src from course_offerings where id = p_source;
  select * into v_tgt from course_offerings where id = p_target;

  if v_src.id is null or v_tgt.id is null then
    raise exception 'Offering not found' using errcode = 'no_data_found';
  end if;

  if v_src.course_id <> v_tgt.course_id then
    raise exception 'COPY_DIFFERENT_COURSE' using errcode = 'invalid_parameter_value';
  end if;

  if exists (select 1 from modules where offering_id = p_target)
     or exists (select 1 from assessments where offering_id = p_target) then
    raise exception 'TARGET_NOT_EMPTY' using errcode = 'restrict_violation';
  end if;

  drop table if exists pg_temp._copy_map;
  create temp table _copy_map (
    kind text not null,
    old_id uuid not null,
    new_id uuid not null,
    primary key (kind, old_id)
  );

  insert into _copy_map
  select 'module', m.id, gen_random_uuid() from modules m where m.offering_id = p_source;

  insert into _copy_map
  select 'lesson', l.id, gen_random_uuid()
  from lessons l join _copy_map c on c.kind = 'module' and c.old_id = l.module_id;

  insert into _copy_map
  select 'block', b.id, gen_random_uuid()
  from lesson_content_blocks b join _copy_map c on c.kind = 'lesson' and c.old_id = b.lesson_id;

  insert into _copy_map
  select 'assessment', a.id, gen_random_uuid() from assessments a where a.offering_id = p_source;

  insert into _copy_map
  select 'checkpoint', vc.id, gen_random_uuid()
  from video_checkpoints vc join _copy_map c on c.kind = 'block' and c.old_id = vc.block_id;

  insert into _copy_map
  select 'cp_question', q.id, gen_random_uuid()
  from video_checkpoint_questions q join _copy_map c on c.kind = 'checkpoint' and c.old_id = q.checkpoint_id;

  insert into _copy_map
  select 'cp_option', o.id, gen_random_uuid()
  from video_checkpoint_options o join _copy_map c on c.kind = 'cp_question' and c.old_id = o.question_id;

  insert into modules (id, offering_id, title, description, position)
  select c.new_id, p_target, m.title, m.description, m.position
  from modules m join _copy_map c on c.kind = 'module' and c.old_id = m.id;

  insert into lessons (id, module_id, title, description, position)
  select c.new_id, cm.new_id, l.title, l.description, l.position
  from lessons l
  join _copy_map c on c.kind = 'lesson' and c.old_id = l.id
  join _copy_map cm on cm.kind = 'module' and cm.old_id = l.module_id;

  -- Evaluations keep their dates (the EXAM / TASK checks need them) but are
  -- forced to DRAFT: nothing goes live by accident.
  insert into assessments (
    id, organization_id, offering_id, module_id, kind, status, title, description,
    question_bank_id, random_question_count, duration_seconds, available_from,
    available_until, passing_score, max_attempts, created_by, instructions,
    max_files, allow_late_submissions
  )
  select
    c.new_id, a.organization_id, p_target, cm.new_id, a.kind, 'DRAFT', a.title, a.description,
    a.question_bank_id, a.random_question_count, a.duration_seconds, a.available_from,
    a.available_until, a.passing_score, a.max_attempts, a.created_by, a.instructions,
    a.max_files, a.allow_late_submissions
  from assessments a
  join _copy_map c on c.kind = 'assessment' and c.old_id = a.id
  left join _copy_map cm on cm.kind = 'module' and cm.old_id = a.module_id;

  insert into assessment_questions (assessment_id, question_id, position, points)
  select c.new_id, aq.question_id, aq.position, aq.points
  from assessment_questions aq
  join _copy_map c on c.kind = 'assessment' and c.old_id = aq.assessment_id;

  insert into lesson_content_blocks (id, lesson_id, type, position, data, assessment_id, is_required)
  select c.new_id, cl.new_id, b.type, b.position, b.data, ca.new_id, b.is_required
  from lesson_content_blocks b
  join _copy_map c on c.kind = 'block' and c.old_id = b.id
  join _copy_map cl on cl.kind = 'lesson' and cl.old_id = b.lesson_id
  left join _copy_map ca on ca.kind = 'assessment' and ca.old_id = b.assessment_id;

  insert into module_dependencies (module_id, condition, depends_on_module_id, assessment_id, min_score)
  select cm.new_id, d.condition, cd.new_id, ca.new_id, d.min_score
  from module_dependencies d
  join _copy_map cm on cm.kind = 'module' and cm.old_id = d.module_id
  left join _copy_map cd on cd.kind = 'module' and cd.old_id = d.depends_on_module_id
  left join _copy_map ca on ca.kind = 'assessment' and ca.old_id = d.assessment_id;

  insert into video_checkpoints (id, organization_id, block_id, at_seconds, min_correct)
  select c.new_id, vc.organization_id, cb.new_id, vc.at_seconds, vc.min_correct
  from video_checkpoints vc
  join _copy_map c on c.kind = 'checkpoint' and c.old_id = vc.id
  join _copy_map cb on cb.kind = 'block' and cb.old_id = vc.block_id;

  insert into video_checkpoint_questions (id, checkpoint_id, prompt, position)
  select c.new_id, cp.new_id, q.prompt, q.position
  from video_checkpoint_questions q
  join _copy_map c on c.kind = 'cp_question' and c.old_id = q.id
  join _copy_map cp on cp.kind = 'checkpoint' and cp.old_id = q.checkpoint_id;

  insert into video_checkpoint_options (id, question_id, label, is_correct, position)
  select c.new_id, cq.new_id, o.label, o.is_correct, o.position
  from video_checkpoint_options o
  join _copy_map c on c.kind = 'cp_option' and c.old_id = o.id
  join _copy_map cq on cq.kind = 'cp_question' and cq.old_id = o.question_id;

  drop table pg_temp._copy_map;

  -- Same-edition invariants.
  if exists (
    select 1
    from lesson_content_blocks b
    where b.assessment_id is not null
      and offering_id_of_block(b.id) = p_target
      and offering_id_of_assessment(b.assessment_id) is distinct from p_target
  ) or exists (
    select 1
    from module_dependencies d
    where offering_id_of_module(d.module_id) = p_target
      and (
        offering_id_of_module(d.depends_on_module_id) is distinct from p_target and d.depends_on_module_id is not null
        or offering_id_of_assessment(d.assessment_id) is distinct from p_target and d.assessment_id is not null
      )
  ) then
    raise exception 'COPY_INVARIANT' using errcode = 'invalid_parameter_value';
  end if;

  perform refresh_offering_enrollment_totals(p_target);
end;
$$;

revoke execute on function copy_edition_content(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Backfill
-- ---------------------------------------------------------------------------
-- 4.1 FREE courses with no edition get their OPEN edition.
insert into course_offerings (course_id, organization_id, kind, name)
select c.id, c.organization_id, 'OPEN', c.title
from courses c
where c.access_type = 'FREE'
  and not exists (select 1 from course_offerings o where o.course_id = c.id);

do $$
declare
  v_course uuid;
  v_first uuid;
  v_other uuid;
begin
  for v_course in
    select distinct course_id from (
      select course_id from modules
      union
      select course_id from assessments
    ) t
  loop
    select o.id into v_first
    from course_offerings o
    where o.course_id = v_course
    order by o.created_at, o.id
    limit 1;

    -- 4.2 PRIVATE course with content but no edition: dev data, deleted.
    if v_first is null then
      delete from modules where course_id = v_course;
      delete from assessments where course_id = v_course;
      continue;
    end if;

    -- 4.3 The first edition owns the existing content.
    update modules set offering_id = v_first where course_id = v_course;
    update assessments set offering_id = v_first where course_id = v_course;

    -- 4.4 Every other edition: student data out, plain copy in.
    for v_other in
      select o.id from course_offerings o
      where o.course_id = v_course and o.id <> v_first
      order by o.created_at, o.id
    loop
      delete from content_progress
      where enrollment_id in (select e.id from course_enrollments e where e.offering_id = v_other);
      delete from assessment_attempts
      where enrollment_id in (select e.id from course_enrollments e where e.offering_id = v_other);
      delete from video_checkpoint_attempts
      where enrollment_id in (select e.id from course_enrollments e where e.offering_id = v_other);
      delete from video_checkpoint_progress
      where enrollment_id in (select e.id from course_enrollments e where e.offering_id = v_other);

      update course_enrollments
      set completed_blocks = 0,
          progress_percent = 0,
          started_at = null,
          completed_at = null,
          status = case when status = 'COMPLETED' then 'ACTIVE'::enrollment_status else status end
      where offering_id = v_other;

      perform copy_edition_content(v_first, v_other);
    end loop;
  end loop;
end;
$$;

-- Deferred FKs / unique keys must settle before the table rewrites below.
set constraints all immediate;

-- Editions of courses without content are not touched by the loop above.
update course_enrollments e
set total_blocks = required_block_count_for_offering(e.offering_id)
where total_blocks is distinct from required_block_count_for_offering(e.offering_id);

-- ---------------------------------------------------------------------------
-- 5. Constraints; old policies out, old columns out
-- ---------------------------------------------------------------------------
alter table modules alter column offering_id set not null;
alter table assessments alter column offering_id set not null;

drop policy assessment_questions_all on assessment_questions;
drop policy assessments_select on assessments;
drop policy assessments_write on assessments;
drop policy lesson_content_blocks_insert on lesson_content_blocks;
drop policy lesson_content_blocks_select on lesson_content_blocks;
drop policy lesson_content_blocks_update on lesson_content_blocks;
drop policy lessons_insert on lessons;
drop policy lessons_select on lessons;
drop policy lessons_update on lessons;
drop policy module_dependencies_select on module_dependencies;
drop policy module_dependencies_write on module_dependencies;
drop policy modules_insert on modules;
drop policy modules_select on modules;
drop policy modules_update on modules;
drop policy video_checkpoint_options_select on video_checkpoint_options;
drop policy video_checkpoint_questions_select on video_checkpoint_questions;
drop policy video_checkpoints_select on video_checkpoints;
drop policy course_files_insert on storage.objects;
drop policy course_files_update on storage.objects;
drop policy course_files_delete on storage.objects;

alter table modules drop column course_id;
alter table assessments drop column course_id;

-- ---------------------------------------------------------------------------
-- 6. Same-edition invariants (triggers)
-- ---------------------------------------------------------------------------
create function assert_block_assessment_same_edition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- A missing lesson / evaluation is the foreign keys' business, not ours.
  if new.assessment_id is not null
     and offering_id_of_lesson(new.lesson_id) <> offering_id_of_assessment(new.assessment_id) then
    raise exception 'CROSS_EDITION_LINK' using errcode = 'invalid_parameter_value';
  end if;
  return new;
end;
$$;

create trigger assert_block_assessment_same_edition
  before insert or update on lesson_content_blocks
  for each row execute function assert_block_assessment_same_edition();

create function assert_dependency_same_edition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_offering uuid := offering_id_of_module(new.module_id);
begin
  if offering_id_of_module(new.depends_on_module_id) <> v_offering
     or offering_id_of_assessment(new.assessment_id) <> v_offering then
    raise exception 'CROSS_EDITION_LINK' using errcode = 'invalid_parameter_value';
  end if;
  return new;
end;
$$;

create trigger assert_dependency_same_edition
  before insert or update on module_dependencies
  for each row execute function assert_dependency_same_edition();

-- A module or evaluation never moves between editions (its children would
-- cross), and an evaluation's module is in its own edition.
create function assert_module_edition_stable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.offering_id is distinct from old.offering_id then
    raise exception 'CROSS_EDITION_LINK' using errcode = 'invalid_parameter_value';
  end if;
  return new;
end;
$$;

create trigger assert_module_edition_stable
  before insert or update on modules
  for each row execute function assert_module_edition_stable();

create function assert_assessment_edition_stable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.offering_id is distinct from old.offering_id then
    raise exception 'CROSS_EDITION_LINK' using errcode = 'invalid_parameter_value';
  end if;

  if offering_id_of_module(new.module_id) <> new.offering_id then
    raise exception 'CROSS_EDITION_LINK' using errcode = 'invalid_parameter_value';
  end if;

  return new;
end;
$$;

create trigger assert_assessment_edition_stable
  before insert or update on assessments
  for each row execute function assert_assessment_edition_stable();

-- ---------------------------------------------------------------------------
-- 7. Policies
-- ---------------------------------------------------------------------------
create policy modules_select on modules for select to authenticated
  using (
    (select can_edit_offering(modules.offering_id))
    or (select student_can_view_offering(modules.offering_id))
  );
create policy modules_insert on modules for insert to authenticated
  with check ((select can_edit_offering(modules.offering_id)));
create policy modules_update on modules for update to authenticated
  using ((select can_edit_offering(modules.offering_id)))
  with check ((select can_edit_offering(modules.offering_id)));

create policy lessons_select on lessons for select to authenticated
  using (
    (select can_edit_offering((select offering_id_of_module(lessons.module_id))))
    or (select student_can_view_offering((select offering_id_of_module(lessons.module_id))))
  );
create policy lessons_insert on lessons for insert to authenticated
  with check ((select can_edit_offering((select offering_id_of_module(lessons.module_id)))));
create policy lessons_update on lessons for update to authenticated
  using ((select can_edit_offering((select offering_id_of_module(lessons.module_id)))))
  with check ((select can_edit_offering((select offering_id_of_module(lessons.module_id)))));

create policy lesson_content_blocks_select on lesson_content_blocks for select to authenticated
  using (
    (select can_edit_offering((select offering_id_of_lesson(lesson_content_blocks.lesson_id))))
    or (select student_can_view_offering((select offering_id_of_lesson(lesson_content_blocks.lesson_id))))
  );
create policy lesson_content_blocks_insert on lesson_content_blocks for insert to authenticated
  with check ((select can_edit_offering((select offering_id_of_lesson(lesson_content_blocks.lesson_id)))));
create policy lesson_content_blocks_update on lesson_content_blocks for update to authenticated
  using ((select can_edit_offering((select offering_id_of_lesson(lesson_content_blocks.lesson_id)))))
  with check ((select can_edit_offering((select offering_id_of_lesson(lesson_content_blocks.lesson_id)))));

create policy module_dependencies_select on module_dependencies for select to authenticated
  using (
    (select can_edit_offering((select offering_id_of_module(module_dependencies.module_id))))
    or (select student_can_view_offering((select offering_id_of_module(module_dependencies.module_id))))
  );
create policy module_dependencies_write on module_dependencies for all to authenticated
  using ((select can_edit_offering((select offering_id_of_module(module_dependencies.module_id)))))
  with check ((select can_edit_offering((select offering_id_of_module(module_dependencies.module_id)))));

create policy assessments_select on assessments for select to authenticated
  using (
    (select can_edit_offering(assessments.offering_id))
    or (status = 'PUBLISHED' and (select student_can_view_offering(assessments.offering_id)))
  );
create policy assessments_write on assessments for all to authenticated
  using ((select can_edit_offering(assessments.offering_id)))
  with check ((select can_edit_offering(assessments.offering_id)));

create policy assessment_questions_all on assessment_questions for all to authenticated
  using ((select can_edit_offering((select offering_id_of_assessment(assessment_questions.assessment_id)))))
  with check ((select can_edit_offering((select offering_id_of_assessment(assessment_questions.assessment_id)))));

-- Video checkpoints: the answer key is editor-only.
create function video_checkpoint_offering(p_checkpoint uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select offering_id_of_block(vc.block_id) from video_checkpoints vc where vc.id = p_checkpoint;
$$;

create policy video_checkpoints_select on video_checkpoints for select to authenticated
  using (coalesce((select can_edit_offering(offering_id_of_block(video_checkpoints.block_id))), false));
create policy video_checkpoint_questions_select on video_checkpoint_questions for select to authenticated
  using (coalesce((select can_edit_offering(video_checkpoint_offering(video_checkpoint_questions.checkpoint_id))), false));
create policy video_checkpoint_options_select on video_checkpoint_options for select to authenticated
  using (coalesce((
    select can_edit_offering(video_checkpoint_offering(q.checkpoint_id))
    from video_checkpoint_questions q
    where q.id = video_checkpoint_options.question_id
  ), false));

revoke execute on function offering_id_of_module(uuid) from public, anon;
revoke execute on function offering_id_of_lesson(uuid) from public, anon;
revoke execute on function offering_id_of_block(uuid) from public, anon;
revoke execute on function offering_id_of_assessment(uuid) from public, anon;
revoke execute on function course_id_of_offering(uuid) from public, anon;
revoke execute on function can_edit_offering(uuid) from public, anon;
revoke execute on function student_can_view_offering(uuid) from public, anon;
revoke execute on function required_block_count_for_offering(uuid) from public, anon;
revoke execute on function video_checkpoint_offering(uuid) from public, anon;
revoke execute on function refresh_offering_enrollment_totals(uuid) from public, anon, authenticated;
grant execute on function offering_id_of_module(uuid) to authenticated;
grant execute on function offering_id_of_lesson(uuid) to authenticated;
grant execute on function offering_id_of_block(uuid) to authenticated;
grant execute on function offering_id_of_assessment(uuid) to authenticated;
grant execute on function course_id_of_offering(uuid) to authenticated;
grant execute on function can_edit_offering(uuid) to authenticated;
grant execute on function student_can_view_offering(uuid) to authenticated;
grant execute on function required_block_count_for_offering(uuid) to authenticated;
grant execute on function video_checkpoint_offering(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Rewritten functions (same signature: CREATE OR REPLACE keeps the grants)
-- ---------------------------------------------------------------------------
create or replace function assessment_module_id(p_assessment uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    (select a.module_id from assessments a where a.id = p_assessment),
    (
      select l.module_id
      from lesson_content_blocks b
      join lessons l on l.id = b.lesson_id
      join modules m on m.id = l.module_id
      join assessments a on a.id = b.assessment_id
      where b.assessment_id = p_assessment
        and m.offering_id = a.offering_id
      order by m.position, l.position, b.position
      limit 1
    )
  );
$function$;

create or replace function assessment_score_distribution(p_assessment uuid)
 RETURNS TABLE(label text, bucket_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid;
  v_offering uuid;
begin
  select organization_id, offering_id into v_org, v_offering
  from assessments
  where id = p_assessment;

  if v_org is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  if coalesce((select is_org_admin(v_org)), false) is not true
    and coalesce((select is_offering_professor(v_offering)), false) is not true then
    raise exception 'FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;

  return query
  with graded_attempts as (
    select aa.score_percent
    from assessment_attempts aa
    join course_enrollments e on e.id = aa.enrollment_id
    where aa.assessment_id = p_assessment
      and aa.organization_id = v_org
      and aa.status = 'GRADED'
      -- A professor only counts the editions they teach.
      and ((select is_org_admin(v_org)) or (select is_offering_professor(e.offering_id)))
  ),
  ranges as (
    select r.id, r.label, r.min_score, r.max_score
    from score_scale_ranges r
    where r.organization_id = v_org
  ),
  bucketed as (
    select r.id as range_id, count(*) as n
    from graded_attempts ga
    join ranges r on floor(ga.score_percent) between r.min_score and r.max_score
    group by r.id
  ),
  unmatched as (
    select count(*) as n
    from graded_attempts ga
    where not exists (
      select 1 from ranges r where floor(ga.score_percent) between r.min_score and r.max_score
    )
  )
  select t.label, t.bucket_count
  from (
    select r.min_score as ord, r.label, coalesce(b.n, 0)::bigint as bucket_count
    from ranges r
    left join bucketed b on b.range_id = r.id
    union all
    select 101, 'Sin rango', u.n
    from unmatched u
    where u.n > 0
  ) t
  order by t.ord;
end;
$function$;

create or replace function checkpoint_enrollment_check(p_enrollment uuid, p_lesson uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_enrollment course_enrollments%rowtype;
  v_module uuid;
  v_offering uuid;
  v_state text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_enrollment from course_enrollments where id = p_enrollment;

  if v_enrollment.id is null
     or v_enrollment.user_id <> auth.uid()
     or coalesce((select is_org_member(v_enrollment.organization_id)), false) is not true then
    raise exception 'Not allowed to use this enrollment' using errcode = 'insufficient_privilege';
  end if;

  if v_enrollment.status = 'CANCELLED' then
    raise exception 'ENROLLMENT_CANCELLED' using errcode = 'insufficient_privilege';
  end if;

  select l.module_id, m.offering_id into v_module, v_offering
  from lessons l join modules m on m.id = l.module_id
  where l.id = p_lesson;

  if v_offering is distinct from v_enrollment.offering_id then
    raise exception 'Lesson not found' using errcode = 'no_data_found';
  end if;

  select u.state into v_state from module_unlock_state(p_enrollment) u where u.module_id = v_module;

  if v_state is distinct from 'AVAILABLE' and v_state is distinct from 'COMPLETED' then
    raise exception 'MODULE_LOCKED' using errcode = 'insufficient_privilege';
  end if;

  return v_enrollment.organization_id;
end;
$function$;

create or replace function complete_content_block(p_enrollment uuid, p_block uuid, p_completed boolean)
 RETURNS TABLE(progress_percent numeric, completed_blocks integer, total_blocks integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_enrollment course_enrollments%rowtype;
  v_block lesson_content_blocks%rowtype;
  v_module uuid;
  v_block_offering uuid;
  v_state text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  -- FOR UPDATE here, not later: this is the lock-ordering fix described above.
  select * into v_enrollment
  from course_enrollments
  where id = p_enrollment
  for update;

  if v_enrollment.id is null then
    raise exception 'Enrollment not found' using errcode = 'no_data_found';
  end if;

  -- Ownership, not `can_view_enrollment`: staff may *read* a student's
  -- progress, they may never write it.
  if v_enrollment.user_id <> auth.uid()
     or coalesce((select is_org_member(v_enrollment.organization_id)), false) is not true then
    raise exception 'Not allowed to change this enrollment' using errcode = 'insufficient_privilege';
  end if;

  if v_enrollment.status = 'CANCELLED' then
    raise exception 'ENROLLMENT_CANCELLED' using errcode = 'insufficient_privilege';
  end if;

  select * into v_block from lesson_content_blocks where id = p_block;

  if v_block.id is null then
    raise exception 'Content block not found' using errcode = 'no_data_found';
  end if;

  select l.module_id, m.offering_id
  into v_module, v_block_offering
  from lessons l
  join modules m on m.id = l.module_id
  where l.id = v_block.lesson_id;

  if v_block_offering is distinct from v_enrollment.offering_id then
    raise exception 'Content block does not belong to this edition' using errcode = 'no_data_found';
  end if;

  if v_block.type in ('QUIZ', 'TASK') then
    raise exception 'INVALID_BLOCK_TYPE' using errcode = 'invalid_parameter_value';
  end if;

  select u.state into v_state
  from module_unlock_state(p_enrollment) u
  where u.module_id = v_module;

  -- COMPLETED is open too: un-ticking a block inside a finished module has to
  -- stay possible, otherwise the last completion would be irreversible. A NULL
  -- state (module not reported at all) fails closed through both comparisons.
  if v_state is distinct from 'AVAILABLE' and v_state is distinct from 'COMPLETED' then
    raise exception 'MODULE_LOCKED' using errcode = 'insufficient_privilege';
  end if;

  if p_completed then
    insert into content_progress (enrollment_id, content_block_id)
    values (p_enrollment, p_block)
    on conflict (enrollment_id, content_block_id) do nothing;
  else
    delete from content_progress
    where enrollment_id = p_enrollment
      and content_block_id = p_block;
  end if;

  perform recalc_enrollment_progress(p_enrollment);

  perform log_audit(
    v_enrollment.organization_id,
    case when p_completed then 'content.completed' else 'content.uncompleted' end,
    'lesson_content_block',
    p_block,
    jsonb_build_object('enrollment_id', p_enrollment, 'course_id', v_enrollment.course_id)
  );

  return query
  select e.progress_percent, e.completed_blocks, e.total_blocks
  from course_enrollments e
  where e.id = p_enrollment;
end;
$function$;

create or replace function delete_assessment(p_assessment uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_assessment assessments%rowtype;
begin
  select * into v_assessment from assessments where id = p_assessment;

  if v_assessment.id is null then
    raise exception 'Assessment not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select can_edit_offering(v_assessment.offering_id)), false) is not true then
    raise exception 'Not allowed to delete this assessment' using errcode = 'insufficient_privilege';
  end if;

  if exists (select 1 from assessment_attempts where assessment_id = p_assessment) then
    raise exception 'CONFLICT_HAS_ATTEMPTS' using errcode = 'restrict_violation';
  end if;

  if exists (select 1 from lesson_content_blocks where assessment_id = p_assessment) then
    raise exception 'CONFLICT_HAS_BLOCKS' using errcode = 'restrict_violation';
  end if;

  delete from assessments where id = p_assessment;

  perform log_audit(
    v_assessment.organization_id,
    'assessment.deleted',
    'assessment',
    p_assessment,
    jsonb_build_object('title', v_assessment.title)
  );
end;
$function$;

create or replace function delete_lesson(p_lesson uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_offering uuid;
begin
  v_offering := (select offering_id_of_lesson(p_lesson));

  if v_offering is null then
    raise exception 'Lesson not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select can_edit_offering(v_offering)), false) is not true then
    raise exception 'Not allowed to edit this edition' using errcode = 'insufficient_privilege';
  end if;

  perform assert_subtree_deletable(v_offering, null, p_lesson);

  delete from lessons where id = p_lesson;
end;
$function$;

create or replace function delete_module(p_module uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_offering uuid;
begin
  v_offering := (select offering_id_of_module(p_module));

  if v_offering is null then
    raise exception 'Module not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select can_edit_offering(v_offering)), false) is not true then
    raise exception 'Not allowed to edit this edition' using errcode = 'insufficient_privilege';
  end if;

  perform assert_subtree_deletable(v_offering, p_module, null);

  delete from modules where id = p_module;
end;
$function$;

create or replace function enrollment_module_summary(p_enrollment uuid)
 RETURNS TABLE(module_id uuid, total_required integer, completed_required integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_enrollment course_enrollments%rowtype;
begin
  select * into v_enrollment from course_enrollments where id = p_enrollment;

  if v_enrollment.id is null then
    raise exception 'Enrollment not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select can_view_enrollment(p_enrollment)), false) is not true then
    raise exception 'Not allowed to read this enrollment' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    m.id,
    count(b.id) filter (where b.is_required)::int,
    count(cp.id) filter (where b.is_required)::int
  from modules m
  left join lessons l on l.module_id = m.id
  left join lesson_content_blocks b on b.lesson_id = l.id
  left join content_progress cp
    on cp.content_block_id = b.id
   and cp.enrollment_id = p_enrollment
  where m.offering_id = v_enrollment.offering_id
  group by m.id, m.position
  order by m.position;
end;
$function$;

create or replace function extend_assessment_window(p_assessment uuid, p_new_until timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_assessment assessments%rowtype;
  v_count int;
begin
  select * into v_assessment from assessments where id = p_assessment;

  if v_assessment.id is null then
    raise exception 'Assessment not found' using errcode = 'no_data_found';
  end if;

  if coalesce(
       (select is_org_admin(v_assessment.organization_id))
       or (select is_offering_professor(v_assessment.offering_id)),
       false
     ) is not true then
    raise exception 'Not allowed to extend this assessment' using errcode = 'insufficient_privilege';
  end if;

  if p_new_until is null
     or (v_assessment.available_until is not null and p_new_until <= v_assessment.available_until) then
    raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
  end if;

  update assessments set available_until = p_new_until where id = p_assessment;

  with bumped as (
    update assessment_attempts
    set availability_until = p_new_until,
        effective_end_at = least(
          case when duration_seconds is not null
            then started_at + make_interval(secs => duration_seconds)
          end,
          p_new_until
        )
    where assessment_id = p_assessment
      and status = 'IN_PROGRESS'
    returning 1
  )
  select count(*)::int into v_count from bumped;

  perform log_audit(
    v_assessment.organization_id,
    'assessment.window_extended',
    'assessment',
    p_assessment,
    jsonb_build_object('new_until', p_new_until, 'attempts_updated', v_count)
  );

  return v_count;
end;
$function$;

create or replace function finalize_attempt(p_attempt uuid, p_reason text)
 RETURNS TABLE(status attempt_status, total_score numeric, score_percent numeric, score_label text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_attempt assessment_attempts%rowtype;
  v_offering uuid;
  v_auto numeric(8, 2);
  v_manual numeric(8, 2);
  v_max numeric(8, 2);
  v_total numeric(8, 2);
  v_percent numeric(5, 2);
  v_label text;
  v_passing boolean;
  v_has_open boolean;
  v_status attempt_status;
  v_block record;
begin
  if p_reason is null or p_reason not in ('SUBMITTED', 'AUTO') then
    raise exception 'p_reason must be SUBMITTED or AUTO' using errcode = 'invalid_parameter_value';
  end if;

  -- Enrollment BEFORE attempt (H1). This is the lock order every writer uses.
  perform 1
  from course_enrollments
  where id = (select enrollment_id from assessment_attempts where id = p_attempt)
  for update;

  select * into v_attempt from assessment_attempts where id = p_attempt for update;

  if v_attempt.id is null then
    raise exception 'Attempt not found' using errcode = 'no_data_found';
  end if;

  if auth.uid() is not null and v_attempt.user_id <> auth.uid() then
    raise exception 'Not allowed to finalize this attempt' using errcode = 'insufficient_privilege';
  end if;

  if v_attempt.status <> 'IN_PROGRESS' then
    return query
    select a.status, a.total_score, a.score_percent, a.score_label
    from assessment_attempts a where a.id = p_attempt;
    return;
  end if;

  if p_reason = 'AUTO'
     and (v_attempt.effective_end_at is null
          or now() <= v_attempt.effective_end_at + interval '5 seconds') then
    return query
    select a.status, a.total_score, a.score_percent, a.score_label
    from assessment_attempts a where a.id = p_attempt;
    return;
  end if;

  select e.offering_id into v_offering
  from course_enrollments e
  where e.id = v_attempt.enrollment_id;

  insert into assessment_grades (attempt_id, attempt_question_id, points_awarded, is_correct, graded_by)
  select
    q.attempt_id,
    q.id,
    case when q.selected_option_id = any (k.correct_option_ids) then q.points else 0 end,
    q.selected_option_id is not null and q.selected_option_id = any (k.correct_option_ids),
    null
  from assessment_attempt_questions q
  join assessment_attempt_answer_keys k on k.attempt_question_id = q.id
  where q.attempt_id = p_attempt
    and q.type = 'MULTIPLE_CHOICE'
  on conflict (attempt_id, attempt_question_id) do nothing;

  select
    coalesce(sum(g.points_awarded) filter (where q.type = 'MULTIPLE_CHOICE'), 0),
    coalesce(sum(g.points_awarded) filter (where q.type = 'OPEN_ENDED'), 0),
    coalesce(sum(q.points), 0),
    bool_or(q.type = 'OPEN_ENDED')
  into v_auto, v_manual, v_max, v_has_open
  from assessment_attempt_questions q
  left join assessment_grades g on g.attempt_question_id = q.id
  where q.attempt_id = p_attempt;

  v_total := v_auto + v_manual;
  v_percent := case when coalesce(v_max, 0) = 0 then null else round((v_total * 100) / v_max, 2) end;

  select r.label, r.is_passing into v_label, v_passing
  from resolve_score_label(v_attempt.organization_id, v_percent) r;

  v_status := case
    when coalesce(v_has_open, false) then
      case when p_reason = 'SUBMITTED' then 'SUBMITTED'::attempt_status else 'AUTO_SUBMITTED'::attempt_status end
    else 'GRADED'::attempt_status
  end;

  update assessment_attempts
  set
    status = v_status,
    auto_score = v_auto,
    manual_score = v_manual,
    total_score = v_total,
    max_score = v_max,
    score_percent = v_percent,
    score_label = v_label,
    passed = v_passing,
    submitted_at = coalesce(submitted_at, now()),
    graded_at = case when v_status = 'GRADED' then now() else graded_at end,
    active_session_id = null
  where id = p_attempt;

  -- Scoped to the enrolled edition (M2): a QUIZ block living in another tenant's
  -- course must never earn progress on this enrollment.
  for v_block in
    select b.id as block_id, a.kind, a.passing_score
    from lesson_content_blocks b
    join lessons l on l.id = b.lesson_id
    join modules m on m.id = l.module_id
    join assessments a on a.id = b.assessment_id
    where b.assessment_id = v_attempt.assessment_id
      and m.offering_id = v_offering
  loop
    if v_block.kind = 'TASK'
       or v_block.passing_score is null
       or coalesce(v_passing, false)
       or (v_percent is not null and v_percent >= v_block.passing_score) then
      insert into content_progress (enrollment_id, content_block_id)
      values (v_attempt.enrollment_id, v_block.block_id)
      on conflict (enrollment_id, content_block_id) do nothing;
    end if;
  end loop;

  perform recalc_enrollment_progress(v_attempt.enrollment_id);

  perform log_audit_system(
    v_attempt.organization_id,
    case when p_reason = 'SUBMITTED' then 'assessment.submitted' else 'assessment.auto_submitted' end,
    'assessment_attempt',
    p_attempt,
    jsonb_build_object(
      'assessment_id', v_attempt.assessment_id,
      'score_percent', v_percent,
      'status', v_status
    )
  );

  return query
  select a.status, a.total_score, a.score_percent, a.score_label
  from assessment_attempts a where a.id = p_attempt;
end;
$function$;

create or replace function list_my_attempts(p_enrollment uuid)
 RETURNS TABLE(assessment_id uuid, title text, kind assessment_kind, available_from timestamp with time zone, available_until timestamp with time zone, duration_seconds integer, max_attempts integer, passing_score integer, attempts_used integer, last_attempt_id uuid, last_status attempt_status, score_percent numeric, score_label text, passed boolean, overall_feedback text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_enrollment course_enrollments%rowtype;
begin
  select * into v_enrollment from course_enrollments where id = p_enrollment;

  if v_enrollment.id is null then
    raise exception 'Enrollment not found' using errcode = 'no_data_found';
  end if;

  if v_enrollment.user_id <> auth.uid()
     or coalesce((select is_org_member(v_enrollment.organization_id)), false) is not true then
    raise exception 'Not allowed to read this enrollment' using errcode = 'insufficient_privilege';
  end if;

  return query
  with latest as (
    select distinct on (t.assessment_id)
      t.assessment_id, t.id, t.status, t.score_percent, t.score_label, t.passed
    from assessment_attempts t
    where t.enrollment_id = p_enrollment
    order by t.assessment_id, t.attempt_number desc
  ),
  counts as (
    select t.assessment_id, count(*)::int as used
    from assessment_attempts t
    where t.enrollment_id = p_enrollment
    group by t.assessment_id
  )
  select
    a.id,
    a.title,
    a.kind,
    a.available_from,
    a.available_until,
    a.duration_seconds,
    a.max_attempts,
    a.passing_score,
    coalesce(c.used, 0),
    l.id,
    l.status,
    case when l.status = 'GRADED' then l.score_percent end,
    case when l.status = 'GRADED' then l.score_label end,
    case when l.status = 'GRADED' then l.passed end,
    case when l.status = 'GRADED' then f.feedback end
  from assessments a
  left join latest l on l.assessment_id = a.id
  left join counts c on c.assessment_id = a.id
  left join assessment_feedback f on f.attempt_id = l.id
  where a.offering_id = v_enrollment.offering_id
    and a.status = 'PUBLISHED'
  order by a.kind, a.title;
end;
$function$;

create or replace function module_unlock_state(p_enrollment uuid)
 RETURNS TABLE(module_id uuid, state text, reason text, available_from timestamp with time zone, available_until timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_enrollment course_enrollments%rowtype;
  v_course courses%rowtype;
  v_offering course_offerings%rowtype;
  v_closed text;
begin
  select * into v_enrollment from course_enrollments where id = p_enrollment;

  if v_enrollment.id is null then
    raise exception 'Enrollment not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select can_view_enrollment(p_enrollment)), false) is not true then
    raise exception 'Not allowed to read this enrollment' using errcode = 'insufficient_privilege';
  end if;

  select * into v_course from courses where id = v_enrollment.course_id;
  select * into v_offering from course_offerings where id = v_enrollment.offering_id;

  if v_enrollment.status = 'CANCELLED' then
    v_closed := 'Tu inscripción a este curso fue cancelada.';
  elsif v_course.status = 'ARCHIVED' then
    v_closed := 'El curso ya no está disponible.';
  elsif v_offering.status = 'CANCELLED' then
    v_closed := 'Esta edición del curso fue cancelada.';
  elsif v_offering.ends_at is not null and v_offering.ends_at < now() then
    v_closed := 'El curso ya cerró.';
  end if;

  return query
  with scheduled as (
    select
      m.id as module_id,
      m.position,
      s.available_from,
      s.available_until
    from modules m
    left join offering_module_schedules s
      on s.offering_id = v_enrollment.offering_id
     and s.module_id = m.id
    where m.offering_id = v_enrollment.offering_id
  ),
  done as (
    select
      m.id as module_id,
      not exists (
        select 1
        from lessons l
        join lesson_content_blocks b on b.lesson_id = l.id
        where l.module_id = m.id
          and b.is_required
          and not exists (
            select 1
            from content_progress cp
            where cp.enrollment_id = p_enrollment
              and cp.content_block_id = b.id
          )
      ) as is_done
    from modules m
    where m.offering_id = v_enrollment.offering_id
  ),
  -- Best scored percent per assessment for THIS enrollment.
  best_scores as (
    select
      t.assessment_id,
      max(t.score_percent) as best_percent
    from assessment_attempts t
    where t.enrollment_id = p_enrollment
      and t.status in ('GRADED', 'SUBMITTED', 'AUTO_SUBMITTED')
    group by t.assessment_id
  ),
  blockers as (
    select
      d.module_id,
      (array_agg(blocking.title order by blocking.position))[1] as blocking_title
    from module_dependencies d
    join modules blocking on blocking.id = d.depends_on_module_id
    join done bd on bd.module_id = d.depends_on_module_id
    where d.condition = 'MODULE_COMPLETED'
      and bd.is_done is false
    group by d.module_id

    union all

    -- QUIZ_PASSED: unmet when there is no scored attempt at all, or the best
    -- score falls short of `min_score` (default 0 => any scored attempt passes).
    select
      d.module_id,
      (array_agg(a.title order by a.title))[1] as blocking_title
    from module_dependencies d
    join assessments a on a.id = d.assessment_id
    left join best_scores bs on bs.assessment_id = d.assessment_id
    where d.condition = 'QUIZ_PASSED'
      and (
        bs.best_percent is null
        or bs.best_percent < coalesce(d.min_score, 0)
      )
    group by d.module_id
  ),
  blocked as (
    select b.module_id, (array_agg(b.blocking_title))[1] as blocking_title
    from blockers b
    group by b.module_id
  )
  select
    s.module_id,
    case
      when v_closed is not null then 'EXPIRED'
      when s.available_from is not null and s.available_from > now() then 'UPCOMING'
      when s.available_until is not null and s.available_until < now() then 'EXPIRED'
      when b.module_id is not null then 'LOCKED_DEPENDENCY'
      when d.is_done then 'COMPLETED'
      else 'AVAILABLE'
    end,
    case
      when v_closed is not null then v_closed
      when s.available_from is not null and s.available_from > now()
        then 'Este módulo todavía no se habilitó.'
      when s.available_until is not null and s.available_until < now()
        then 'El plazo de este módulo venció.'
      when b.module_id is not null
        then 'Primero tenés que completar «' || b.blocking_title || '».'
      when d.is_done then 'Completaste todo el contenido de este módulo.'
      else 'Podés avanzar con este módulo.'
    end,
    s.available_from,
    s.available_until
  from scheduled s
  join done d on d.module_id = s.module_id
  left join blocked b on b.module_id = s.module_id
  order by s.position;
end;
$function$;

create or replace function org_assessment_stats(p_org uuid)
 RETURNS TABLE(assessment_id uuid, title text, course_id uuid, course_title text, kind assessment_kind, attempts_count bigint, submitted_count bigint, graded_count bigint, avg_score_percent numeric, passed_count bigint, failed_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if coalesce((select is_org_admin(p_org)), false) is not true
    and coalesce((select is_platform_admin()), false) is not true then
    raise exception 'FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;

  -- Qualified throughout — see org_course_stats for why (`assessment_id` is
  -- both an OUT parameter and a column of `assessment_attempts`).
  return query
  with attempt_stats as (
    select
      aa.assessment_id,
      count(*) as attempts,
      count(*) filter (where aa.submitted_at is not null) as submitted,
      count(*) filter (where aa.status = 'GRADED') as graded,
      avg(aa.score_percent) filter (where aa.status = 'GRADED') as avg_score,
      count(*) filter (where aa.status = 'GRADED' and aa.passed is true) as passed,
      count(*) filter (where aa.status = 'GRADED' and aa.passed is false) as failed
    from assessment_attempts aa
    where aa.organization_id = p_org
    group by aa.assessment_id
  )
  select
    a.id,
    a.title,
    o.course_id,
    c.title,
    a.kind,
    coalesce(ast.attempts, 0),
    coalesce(ast.submitted, 0),
    coalesce(ast.graded, 0),
    round(coalesce(ast.avg_score, 0), 1),
    coalesce(ast.passed, 0),
    coalesce(ast.failed, 0)
  from assessments a
  join course_offerings o on o.id = a.offering_id
  join courses c on c.id = o.course_id
  left join attempt_stats ast on ast.assessment_id = a.id
  where a.organization_id = p_org
  order by c.title, a.title;
end;
$function$;

create or replace function professor_overview_stats()
 RETURNS TABLE(course_id uuid, course_title text, enrolled_count bigint, avg_progress_percent numeric, attempts_in_progress bigint, attempts_submitted bigint, attempts_auto_submitted bigint, attempts_graded bigint, pending_grading_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  return query
  with my_offerings as (
    select op.offering_id, o.course_id
    from offering_professors op
    join course_offerings o on o.id = op.offering_id
    join courses c on c.id = o.course_id
    where op.user_id = auth.uid()
      and exists (
        select 1
        from organization_memberships om
        where om.organization_id = c.organization_id
          and om.user_id = auth.uid()
          and om.status = 'ACTIVE'
          and om.role = 'PROFESSOR'
      )
  ),
  my_courses as (
    select distinct mo.course_id from my_offerings mo
  ),
  enrollment_stats as (
    select ce.course_id, count(*) as n, avg(ce.progress_percent) as avg_progress
    from course_enrollments ce
    where ce.offering_id in (select mo.offering_id from my_offerings mo)
      and ce.status <> 'CANCELLED'
    group by ce.course_id
  ),
  attempt_stats as (
    select
      ao.course_id,
      count(*) filter (where aa.status = 'IN_PROGRESS') as in_progress,
      count(*) filter (where aa.status = 'SUBMITTED') as submitted,
      count(*) filter (where aa.status = 'AUTO_SUBMITTED') as auto_submitted,
      count(*) filter (where aa.status = 'GRADED') as graded,
      count(*) filter (
        where aa.status in ('SUBMITTED', 'AUTO_SUBMITTED')
          -- A TASK is only gradable after its deadline; match the grading queue.
          and (a.kind <> 'TASK' or now() >= a.available_until)
      ) as pending
    from assessments a
    join course_offerings ao on ao.id = a.offering_id
    join assessment_attempts aa on aa.assessment_id = a.id
    join course_enrollments ae on ae.id = aa.enrollment_id
    where ae.offering_id in (select mo.offering_id from my_offerings mo)
    group by ao.course_id
  )
  select
    c.id,
    c.title,
    coalesce(es.n, 0),
    round(coalesce(es.avg_progress, 0), 1),
    coalesce(ast.in_progress, 0),
    coalesce(ast.submitted, 0),
    coalesce(ast.auto_submitted, 0),
    coalesce(ast.graded, 0),
    coalesce(ast.pending, 0)
  from my_courses mc
  join courses c on c.id = mc.course_id
  left join enrollment_stats es on es.course_id = c.id
  left join attempt_stats ast on ast.course_id = c.id
  order by c.title;
end;
$function$;

create or replace function recalc_enrollment_progress(p_enrollment uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_offering uuid;
  v_previous_total int;
  v_total int;
  v_completed int;
  v_percent numeric(5, 2);
begin
  -- FOR UPDATE, not a plain select: this is the serialisation point between
  -- two concurrent writers of the same enrollment's cache (M1).
  select offering_id, total_blocks
  into v_offering, v_previous_total
  from course_enrollments
  where id = p_enrollment
  for update;

  if v_offering is null then
    raise exception 'Enrollment not found' using errcode = 'no_data_found';
  end if;

  v_total := (select required_block_count_for_offering(v_offering));

  -- Counted through the block, not from `content_progress` alone: a block that
  -- was later made optional (or moved to another course) must drop out of the
  -- numerator too, or an enrollment could report more completions than the
  -- denominator allows.
  select count(*)
  into v_completed
  from content_progress cp
  join lesson_content_blocks b on b.id = cp.content_block_id
  join lessons l on l.id = b.lesson_id
  join modules m on m.id = l.module_id
  where cp.enrollment_id = p_enrollment
    and m.offering_id = v_offering
    and b.is_required;

  v_percent := case
    when v_total = 0 then 0
    else round((v_completed::numeric * 100) / v_total, 2)
  end;

  update course_enrollments
  set
    total_blocks = v_total,
    completed_blocks = v_completed,
    progress_percent = v_percent,
    started_at = case
      when started_at is null and v_completed > 0 then now()
      else started_at
    end,
    -- A CANCELLED enrollment keeps its status: reviving it is the roster
    -- sync's job, never a side effect of recomputing a number.
    status = case
      when status = 'CANCELLED' then status
      when v_total > 0 and v_completed >= v_total then 'COMPLETED'::enrollment_status
      else 'ACTIVE'::enrollment_status
    end,
    completed_at = case
      when v_total > 0 and v_completed >= v_total then coalesce(completed_at, now())
      -- The course grew under them: they are no longer at 100%, but they did
      -- finish what the course was, and that fact is history, not cache (M2).
      when v_total > v_previous_total then completed_at
      else null
    end
  where id = p_enrollment;
end;
$function$;

create or replace function reorder_content_blocks(p_lesson uuid, p_ordered_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_offering uuid;
  v_org uuid;
begin
  v_offering := (select offering_id_of_lesson(p_lesson));

  if coalesce((select can_edit_offering(v_offering)), false) is not true then
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

  select organization_id into v_org from course_offerings where id = v_offering;
  perform log_audit(v_org, 'content_block.reordered', 'lesson', p_lesson, jsonb_build_object('orderedIds', p_ordered_ids));
end;
$function$;

create or replace function reorder_lessons(p_module uuid, p_ordered_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_offering uuid;
  v_org uuid;
begin
  v_offering := (select offering_id_of_module(p_module));

  if coalesce((select can_edit_offering(v_offering)), false) is not true then
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

  select organization_id into v_org from course_offerings where id = v_offering;
  perform log_audit(v_org, 'lesson.reordered', 'module', p_module, jsonb_build_object('orderedIds', p_ordered_ids));
end;
$function$;

create or replace function save_video_checkpoints(p_block uuid, p_checkpoints jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_block lesson_content_blocks%rowtype;
  v_offering uuid;
  v_org uuid;
  v_cp jsonb;
  v_q jsonb;
  v_o jsonb;
  v_cp_id uuid;
  v_q_id uuid;
  v_o_id uuid;
  v_q_count int;
  v_o_count int;
  v_correct int;
  v_min int;
  v_q_pos int;
  v_o_pos int;
begin
  select * into v_block from lesson_content_blocks where id = p_block;
  v_offering := (select offering_id_of_block(p_block));

  if v_block.id is null or coalesce((select can_edit_offering(v_offering)), false) is not true then
    raise exception 'Not allowed to edit this block' using errcode = 'insufficient_privilege';
  end if;

  if v_block.type <> 'YOUTUBE_VIDEO' then
    raise exception 'INVALID_CHECKPOINTS' using errcode = 'invalid_parameter_value';
  end if;

  select c.organization_id into v_org from course_offerings c where c.id = v_offering;

  -- Validate the whole payload before writing anything.
  if jsonb_typeof(coalesce(p_checkpoints, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_checkpoints) > 20
     or (select count(distinct (x ->> 'atSeconds')) from jsonb_array_elements(p_checkpoints) x)
        <> jsonb_array_length(p_checkpoints) then
    raise exception 'INVALID_CHECKPOINTS' using errcode = 'invalid_parameter_value';
  end if;

  -- Each id may appear once per level: a duplicated id would silently merge
  -- two items (e.g. leave a question without its correct option).
  if (select count(*) - count(distinct x ->> 'id') from jsonb_array_elements(p_checkpoints) x where x ? 'id') > 0
     or exists (
       select 1 from jsonb_array_elements(p_checkpoints) c, jsonb_array_elements(c -> 'questions') q
       where q ? 'id' group by q ->> 'id' having count(*) > 1
     )
     or exists (
       select 1 from jsonb_array_elements(p_checkpoints) c, jsonb_array_elements(c -> 'questions') q,
                     jsonb_array_elements(q -> 'options') o
       where o ? 'id' group by o ->> 'id' having count(*) > 1
     ) then
    raise exception 'INVALID_CHECKPOINTS' using errcode = 'invalid_parameter_value';
  end if;

  for v_cp in select * from jsonb_array_elements(p_checkpoints) loop
    v_q_count := coalesce(jsonb_array_length(v_cp -> 'questions'), 0);
    v_min := (v_cp ->> 'minCorrect')::int;

    if (v_cp ->> 'atSeconds')::int not between 1 and 43200
       or v_q_count not between 1 and 5
       or v_min is null or v_min not between 1 and v_q_count
       or (v_cp ? 'id' and not exists (
             select 1 from video_checkpoints vc where vc.id = (v_cp ->> 'id')::uuid and vc.block_id = p_block)) then
      raise exception 'INVALID_CHECKPOINTS' using errcode = 'invalid_parameter_value';
    end if;

    for v_q in select * from jsonb_array_elements(v_cp -> 'questions') loop
      v_o_count := coalesce(jsonb_array_length(v_q -> 'options'), 0);
      select count(*) filter (where (o ->> 'isCorrect')::boolean) into v_correct
      from jsonb_array_elements(v_q -> 'options') o;

      if char_length(trim(coalesce(v_q ->> 'prompt', ''))) not between 1 and 1000
         or v_o_count not between 2 and 6
         or v_correct <> 1
         or exists (
           select 1 from jsonb_array_elements(v_q -> 'options') o
           where char_length(trim(coalesce(o ->> 'label', ''))) not between 1 and 300
         )
         or (v_q ? 'id' and (not (v_cp ? 'id') or not exists (
               select 1 from video_checkpoint_questions q
               where q.id = (v_q ->> 'id')::uuid and q.checkpoint_id = (v_cp ->> 'id')::uuid)))
         or exists (
           select 1 from jsonb_array_elements(v_q -> 'options') o
           where o ? 'id' and (not (v_q ? 'id') or not exists (
             select 1 from video_checkpoint_options vo
             where vo.id = (o ->> 'id')::uuid and vo.question_id = (v_q ->> 'id')::uuid))
         ) then
        raise exception 'INVALID_CHECKPOINTS' using errcode = 'invalid_parameter_value';
      end if;
    end loop;
  end loop;

  -- Checkpoints no longer present go away (with their progress and stats).
  delete from video_checkpoints vc
  where vc.block_id = p_block
    and vc.id not in (
      select (x ->> 'id')::uuid from jsonb_array_elements(p_checkpoints) x where x ? 'id'
    );

  for v_cp in select * from jsonb_array_elements(p_checkpoints) loop
    if v_cp ? 'id' then
      v_cp_id := (v_cp ->> 'id')::uuid;
      update video_checkpoints
      set at_seconds = (v_cp ->> 'atSeconds')::int,
          min_correct = (v_cp ->> 'minCorrect')::int,
          updated_at = now()
      where id = v_cp_id;
    else
      insert into video_checkpoints (organization_id, block_id, at_seconds, min_correct)
      values (v_org, p_block, (v_cp ->> 'atSeconds')::int, (v_cp ->> 'minCorrect')::int)
      returning id into v_cp_id;
    end if;

    delete from video_checkpoint_questions q
    where q.checkpoint_id = v_cp_id
      and q.id not in (
        select (x ->> 'id')::uuid from jsonb_array_elements(v_cp -> 'questions') x where x ? 'id'
      );

    v_q_pos := 0;
    for v_q in select * from jsonb_array_elements(v_cp -> 'questions') loop
      v_q_pos := v_q_pos + 1;
      if v_q ? 'id' then
        v_q_id := (v_q ->> 'id')::uuid;
        update video_checkpoint_questions
        set prompt = trim(v_q ->> 'prompt'), position = v_q_pos
        where id = v_q_id;
      else
        insert into video_checkpoint_questions (checkpoint_id, prompt, position)
        values (v_cp_id, trim(v_q ->> 'prompt'), v_q_pos)
        returning id into v_q_id;
      end if;

      delete from video_checkpoint_options vo
      where vo.question_id = v_q_id
        and vo.id not in (
          select (x ->> 'id')::uuid from jsonb_array_elements(v_q -> 'options') x where x ? 'id'
        );

      v_o_pos := 0;
      for v_o in select * from jsonb_array_elements(v_q -> 'options') loop
        v_o_pos := v_o_pos + 1;
        if v_o ? 'id' then
          update video_checkpoint_options
          set label = trim(v_o ->> 'label'),
              is_correct = coalesce((v_o ->> 'isCorrect')::boolean, false),
              position = v_o_pos
          where id = (v_o ->> 'id')::uuid;
        else
          insert into video_checkpoint_options (question_id, label, is_correct, position)
          values (v_q_id, trim(v_o ->> 'label'), coalesce((v_o ->> 'isCorrect')::boolean, false), v_o_pos);
        end if;
      end loop;
    end loop;
  end loop;

  perform log_audit(
    v_org,
    'video_checkpoints.saved',
    'content_block',
    p_block,
    jsonb_build_object('count', jsonb_array_length(p_checkpoints))
  );
end;
$function$;

create or replace function self_enroll_free_course(p_course uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_course courses%rowtype;
  v_offering course_offerings%rowtype;
  v_enrollment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_course from courses where id = p_course;

  if v_course.id is null then
    raise exception 'Course not found' using errcode = 'no_data_found';
  end if;

  if v_course.status <> 'PUBLISHED' or v_course.access_type <> 'FREE' then
    raise exception 'Course is not open for self-enrollment' using errcode = 'invalid_parameter_value';
  end if;

  -- is_org_member also requires the organization to be ACTIVE (D29).
  if coalesce((select is_org_member(v_course.organization_id)), false) is not true then
    raise exception 'You are not an active member of this organization' using errcode = 'insufficient_privilege';
  end if;

  select * into v_offering
  from course_offerings
  where course_id = p_course and kind = 'OPEN' and status = 'ACTIVE';

  if v_offering.id is null then
    raise exception 'Course has no open offering' using errcode = 'no_data_found';
  end if;

  insert into course_enrollments (
    organization_id, course_id, offering_id, user_id, source, total_blocks
  )
  values (
    v_course.organization_id,
    p_course,
    v_offering.id,
    auth.uid(),
    'FREE_COURSE',
    (select required_block_count_for_offering(v_offering.id))
  )
  on conflict (offering_id, user_id) do update
    set status = 'ACTIVE'
    where course_enrollments.status = 'CANCELLED'
  returning id into v_enrollment_id;

  -- `do update ... where` matched nothing: the caller is already enrolled.
  if v_enrollment_id is null then
    select id into v_enrollment_id
    from course_enrollments
    where offering_id = v_offering.id and user_id = auth.uid();
  end if;

  return v_enrollment_id;
end;
$function$;

create or replace function set_assessment_questions(p_assessment uuid, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_assessment assessments%rowtype;
  v_count int;
  v_valid_count int;
begin
  select * into v_assessment from assessments where id = p_assessment;

  if v_assessment.id is null then
    raise exception 'Assessment not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select can_edit_offering(v_assessment.offering_id)), false) is not true then
    raise exception 'Not allowed to edit this assessment' using errcode = 'insufficient_privilege';
  end if;

  if jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array' then
    raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
  end if;

  v_count := jsonb_array_length(p_items);
  if v_count > 200 then
    raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
  end if;

  if v_count > 0 then
    if exists (
      select 1
      from jsonb_to_recordset(p_items) as x(question_id uuid, position int, points numeric)
      where x.question_id is null or x.position is null or x.points is null or x.points <= 0
    ) then
      raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
    end if;

    if (
      select count(distinct x.position) from jsonb_to_recordset(p_items) as x(question_id uuid, position int, points numeric)
    ) <> v_count
    or (
      select count(distinct x.question_id) from jsonb_to_recordset(p_items) as x(question_id uuid, position int, points numeric)
    ) <> v_count then
      raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
    end if;

    select count(*) into v_valid_count
    from jsonb_to_recordset(p_items) as x(question_id uuid, position int, points numeric)
    join questions q on q.id = x.question_id
    where q.is_active is true
      and coalesce((select can_edit_question_bank(q.question_bank_id)), false) is true;

    if v_valid_count <> v_count then
      raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
    end if;
  end if;

  delete from assessment_questions where assessment_id = p_assessment;

  if v_count > 0 then
    insert into assessment_questions (assessment_id, question_id, position, points)
    select p_assessment, x.question_id, x.position, x.points
    from jsonb_to_recordset(p_items) as x(question_id uuid, position int, points numeric);
  end if;

  perform log_audit(
    v_assessment.organization_id,
    'assessment.questions_set',
    'assessment',
    p_assessment,
    jsonb_build_object('count', v_count)
  );
end;
$function$;

create or replace function start_attempt(p_enrollment uuid, p_assessment uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_enrollment course_enrollments%rowtype;
  v_assessment assessments%rowtype;
  v_module uuid;
  v_state text;
  v_used int;
  v_existing uuid;
  v_attempt_id uuid;
  v_effective_end timestamptz;
  v_question record;
  v_position int := 0;
  v_attempt_question_id uuid;
  v_options jsonb;
  v_correct uuid[];
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_enrollment
  from course_enrollments
  where id = p_enrollment
  for update;

  if v_enrollment.id is null then
    raise exception 'Enrollment not found' using errcode = 'no_data_found';
  end if;

  if v_enrollment.user_id <> auth.uid()
     or coalesce((select is_org_member(v_enrollment.organization_id)), false) is not true then
    raise exception 'Not allowed to use this enrollment' using errcode = 'insufficient_privilege';
  end if;

  if v_enrollment.status = 'CANCELLED' then
    raise exception 'ENROLLMENT_CANCELLED' using errcode = 'insufficient_privilege';
  end if;

  select * into v_assessment from assessments where id = p_assessment;

  if v_assessment.id is null or v_assessment.offering_id <> v_enrollment.offering_id then
    raise exception 'Assessment not found' using errcode = 'no_data_found';
  end if;

  if v_assessment.status <> 'PUBLISHED' then
    raise exception 'ASSESSMENT_NOT_AVAILABLE' using errcode = 'invalid_parameter_value';
  end if;

  -- The availability window has NO grace period: 5s of tolerance exists to
  -- save answers already typed, not to let someone in late (D1).
  if (v_assessment.available_from is not null and now() < v_assessment.available_from)
     or (v_assessment.available_until is not null and now() > v_assessment.available_until) then
    raise exception 'ASSESSMENT_EXPIRED' using errcode = 'invalid_parameter_value';
  end if;

  -- The module gate is the same one the course page renders, so a student can
  -- never reach an assessment inside a module they have not unlocked.
  v_module := (select assessment_module_id(p_assessment));

  if v_module is not null then
    select u.state into v_state
    from module_unlock_state(p_enrollment) u
    where u.module_id = v_module;

    if v_state is distinct from 'AVAILABLE' and v_state is distinct from 'COMPLETED' then
      raise exception 'MODULE_LOCKED' using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Resuming beats starting: an interrupted attempt must be handed back
  -- unchanged, never replaced by a fresh snapshot.
  select id into v_existing
  from assessment_attempts
  where enrollment_id = p_enrollment
    and assessment_id = p_assessment
    and status = 'IN_PROGRESS';

  if v_existing is not null then
    return v_existing;
  end if;

  select count(*)::int into v_used
  from assessment_attempts
  where enrollment_id = p_enrollment
    and assessment_id = p_assessment;

  -- NULL max_attempts means unlimited (B3).
  if v_assessment.max_attempts is not null and v_used >= v_assessment.max_attempts then
    raise exception 'ATTEMPT_LIMIT_REACHED' using errcode = 'invalid_parameter_value';
  end if;

  -- LEAST ignores NULLs, so an untimed quiz with no window yields NULL: no
  -- deadline at all (D12). Written as a plain column (D31).
  v_effective_end := least(
    case when v_assessment.duration_seconds is not null
      then now() + make_interval(secs => v_assessment.duration_seconds)
    end,
    v_assessment.available_until
  );

  insert into assessment_attempts (
    assessment_id, enrollment_id, user_id, organization_id,
    attempt_number, duration_seconds, availability_until, effective_end_at
  )
  values (
    p_assessment, p_enrollment, auth.uid(), v_enrollment.organization_id,
    v_used + 1, v_assessment.duration_seconds, v_assessment.available_until, v_effective_end
  )
  returning id into v_attempt_id;

  -- Snapshot. Fixed list first (author order), then the random draw from the
  -- bank excluding anything already fixed, so a question cannot appear twice.
  -- An EXAM shuffles; a QUIZ keeps the author's order (D34).
  for v_question in
    with fixed as (
      select q.id, q.type, q.prompt, aq.points, aq.position as author_position
      from assessment_questions aq
      join questions q on q.id = aq.question_id
      where aq.assessment_id = p_assessment
        and q.is_active
    ),
    drawn as (
      select q.id, q.type, q.prompt, q.default_points as points, 1000000 as author_position
      from questions q
      where v_assessment.random_question_count is not null
        and q.question_bank_id = v_assessment.question_bank_id
        and q.is_active
        and q.id not in (select f.id from fixed f)
      order by random()
      limit coalesce(v_assessment.random_question_count, 0)
    )
    select * from (select * from fixed union all select * from drawn) s
    order by
      case when v_assessment.kind = 'EXAM' then random() else s.author_position end
  loop
    v_position := v_position + 1;

    -- Options are shuffled and stripped of `is_correct` before they are stored
    -- anywhere a student can read. The key goes to its own table.
    select
      coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label) order by o.shuffled), '[]'::jsonb),
      coalesce(array_agg(o.id) filter (where o.is_correct), '{}'::uuid[])
    into v_options, v_correct
    from (
      select qo.id, qo.label, qo.is_correct, random() as shuffled
      from question_options qo
      where qo.question_id = v_question.id
    ) o;

    insert into assessment_attempt_questions (
      attempt_id, question_id, position, type, prompt, options, points
    )
    values (
      v_attempt_id, v_question.id, v_position, v_question.type,
      v_question.prompt, v_options, v_question.points
    )
    returning id into v_attempt_question_id;

    insert into assessment_attempt_answer_keys (attempt_id, attempt_question_id, correct_option_ids)
    values (v_attempt_id, v_attempt_question_id, v_correct);
  end loop;

  perform log_audit_system(
    v_enrollment.organization_id,
    'assessment.started',
    'assessment_attempt',
    v_attempt_id,
    jsonb_build_object('assessment_id', p_assessment, 'attempt_number', v_used + 1)
  );

  return v_attempt_id;
exception
  -- Lost the race into the partial unique index: the winner's attempt is the
  -- right answer, not an error.
  when unique_violation then
    select id into v_existing
    from assessment_attempts
    where enrollment_id = p_enrollment
      and assessment_id = p_assessment
      and status = 'IN_PROGRESS';
    if v_existing is null then
      raise;
    end if;
    return v_existing;
end;
$function$;

create or replace function submit_task(p_assessment uuid, p_enrollment uuid, p_files jsonb)
 RETURNS TABLE(attempt_id uuid, removed_paths text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_check record;
  v_prefix text;
  v_count int;
  v_found int;
  v_attempt_id uuid;
  v_removed text[];
  v_block record;
  v_offering uuid;
begin
  -- Ownership before any lock, so a caller cannot hold someone else's row (N1).
  if not exists (select 1 from course_enrollments where id = p_enrollment and user_id = auth.uid()) then
    raise exception 'NOT_ENROLLED' using errcode = 'insufficient_privilege';
  end if;

  -- Lock order matches every attempt writer: enrollment first.
  perform 1 from course_enrollments where id = p_enrollment for update;

  select * into v_check from task_submission_check(p_assessment, p_enrollment);

  if jsonb_typeof(coalesce(p_files, 'null'::jsonb)) <> 'array' then
    raise exception 'INVALID_FILES' using errcode = 'invalid_parameter_value';
  end if;

  v_count := jsonb_array_length(p_files);
  if v_count < 1 then
    raise exception 'NO_FILES' using errcode = 'invalid_parameter_value';
  end if;
  if v_count > v_check.max_files then
    raise exception 'TOO_MANY_FILES' using errcode = 'invalid_parameter_value';
  end if;

  v_prefix := v_check.organization_id || '/' || v_check.course_id || '/' || p_assessment || '/' || p_enrollment || '/';

  -- Every path must be distinct, inside this enrollment's prefix and exist in
  -- the bucket with a real size. The display filename is client-supplied, so
  -- its extension must match the stored object's MIME (no "notas.pdf.exe"
  -- served as a PDF, no `x.html` for a PDF object), and invisible/bidi
  -- control characters are stripped before it is stored (see insert below).
  select count(distinct o.name) into v_found
  from jsonb_to_recordset(p_files) as x(path text, filename text)
  join storage.objects o on o.bucket_id = 'task-submissions' and o.name = x.path
  where left(x.path, length(v_prefix)) = v_prefix
    and position('..' in x.path) = 0
    and coalesce((o.metadata ->> 'size')::bigint, 0) > 0
    and char_length(coalesce(trim(x.filename), '')) between 1 and 255
    and o.metadata ->> 'mimetype' = task_file_mime_for_name(x.path)
    and o.metadata ->> 'mimetype' = task_file_mime_for_name(x.filename);

  if v_found <> v_count then
    raise exception 'INVALID_FILES' using errcode = 'invalid_parameter_value';
  end if;

  if v_check.attempt_id is null then
    insert into assessment_attempts (
      assessment_id, enrollment_id, user_id, organization_id, attempt_number,
      status, started_at, submitted_at, availability_until, max_score, submitted_late
    )
    select p_assessment, p_enrollment, auth.uid(), v_check.organization_id, 1,
           'SUBMITTED', now(), now(), a.available_until, 100, v_check.is_late
    from assessments a where a.id = p_assessment
    returning id into v_attempt_id;
  else
    v_attempt_id := v_check.attempt_id;
    update assessment_attempts
    set status = 'SUBMITTED',
        submitted_at = now(),
        submitted_late = v_check.is_late,
        updated_at = now()
    where id = v_attempt_id;
  end if;

  select coalesce(array_agg(f.storage_path), '{}') into v_removed
  from assessment_submission_files f
  where f.attempt_id = v_attempt_id
    and f.storage_path not in (select x.path from jsonb_to_recordset(p_files) as x(path text));

  delete from assessment_submission_files where assessment_submission_files.attempt_id = v_attempt_id;

  insert into assessment_submission_files (
    organization_id, attempt_id, storage_path, filename, mime_type, size_bytes, position
  )
  select v_check.organization_id, v_attempt_id, x.path,
         trim(regexp_replace(x.filename, '[[:cntrl:]\u200e\u200f\u202a-\u202e\u2066-\u2069]', '', 'g')),
         o.metadata ->> 'mimetype',
         (o.metadata ->> 'size')::bigint,
         x.ord::int
  from rows from (jsonb_to_recordset(p_files) as (path text, filename text)) with ordinality as x(path, filename, ord)
  join storage.objects o on o.bucket_id = 'task-submissions' and o.name = x.path;

  -- Submitting completes the TASK block(s) pointing at this assessment, scoped
  -- to the enrolled course (same rule `finalize_attempt` used for TASK).
  select e.offering_id into v_offering from course_enrollments e where e.id = p_enrollment;

  for v_block in
    select b.id as block_id
    from lesson_content_blocks b
    join lessons l on l.id = b.lesson_id
    join modules m on m.id = l.module_id
    where b.assessment_id = p_assessment
      and m.offering_id = v_offering
  loop
    insert into content_progress (enrollment_id, content_block_id)
    values (p_enrollment, v_block.block_id)
    on conflict (enrollment_id, content_block_id) do nothing;
  end loop;

  perform recalc_enrollment_progress(p_enrollment);

  perform log_audit_system(
    v_check.organization_id,
    case when v_check.attempt_id is null then 'assessment.task_submitted' else 'assessment.task_resubmitted' end,
    'assessment_attempt',
    v_attempt_id,
    jsonb_build_object('assessment_id', p_assessment, 'files', v_count, 'late', v_check.is_late)
  );

  return query select v_attempt_id, v_removed;
end;
$function$;

create or replace function sync_offering_roster(p_offering uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_offering course_offerings%rowtype;
  v_course courses%rowtype;
  v_total_blocks int;
  v_affected int := 0;
  v_cancelled int;
begin
  select * into v_offering from course_offerings where id = p_offering;
  if v_offering.id is null then
    return 0;
  end if;

  select * into v_course from courses where id = v_offering.course_id;

  perform refresh_offering_enrollment_totals(p_offering);

  if v_offering.kind <> 'GROUP' or v_offering.status <> 'ACTIVE' or v_course.status = 'ARCHIVED' then
    return 0;
  end if;

  v_total_blocks := (select required_block_count_for_offering(p_offering));

  with roster as (
    select gm.user_id
    from group_members gm
    join organization_memberships om
      on om.user_id = gm.user_id
     and om.organization_id = v_offering.organization_id
    where gm.group_id = v_offering.group_id
      and om.status = 'ACTIVE'
      and om.role = 'STUDENT'
  ),
  upserted as (
    insert into course_enrollments (
      organization_id, course_id, offering_id, user_id, source, total_blocks
    )
    select v_offering.organization_id, v_offering.course_id, p_offering,
           roster.user_id, 'GROUP_ASSIGNMENT', v_total_blocks
    from roster
    on conflict (offering_id, user_id) do update
      set status = 'ACTIVE', total_blocks = excluded.total_blocks
      where course_enrollments.status = 'CANCELLED'
    returning 1
  )
  select count(*) into v_affected from upserted;

  with departed as (
    update course_enrollments e
    set status = 'CANCELLED'
    where e.offering_id = p_offering
      and e.status = 'ACTIVE'
      and not exists (
        select 1 from group_members gm
        join organization_memberships om
          on om.user_id = gm.user_id and om.organization_id = v_offering.organization_id
        where gm.group_id = v_offering.group_id and gm.user_id = e.user_id
          and om.status = 'ACTIVE' and om.role = 'STUDENT'
      )
      and not exists (select 1 from content_progress cp where cp.enrollment_id = e.id)
    returning 1
  )
  select count(*) into v_cancelled from departed;

  return v_affected + v_cancelled;
end;
$function$;

create or replace function task_submission_check(p_assessment uuid, p_enrollment uuid)
 RETURNS TABLE(organization_id uuid, course_id uuid, max_files integer, is_late boolean, attempt_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_enrollment course_enrollments%rowtype;
  v_assessment assessments%rowtype;
  v_attempt assessment_attempts%rowtype;
  v_module uuid;
  v_state text;
  v_late boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_enrollment from course_enrollments where id = p_enrollment;

  if v_enrollment.id is null
     or v_enrollment.user_id <> auth.uid()
     or coalesce((select is_org_member(v_enrollment.organization_id)), false) is not true then
    raise exception 'NOT_ENROLLED' using errcode = 'insufficient_privilege';
  end if;

  if v_enrollment.status = 'CANCELLED' then
    raise exception 'ENROLLMENT_CANCELLED' using errcode = 'insufficient_privilege';
  end if;

  select * into v_assessment from assessments where id = p_assessment;

  if v_assessment.id is null
     or v_assessment.offering_id <> v_enrollment.offering_id
     or v_assessment.kind <> 'TASK' then
    raise exception 'Assessment not found' using errcode = 'no_data_found';
  end if;

  if v_assessment.status <> 'PUBLISHED' then
    raise exception 'ASSESSMENT_NOT_AVAILABLE' using errcode = 'invalid_parameter_value';
  end if;

  if v_assessment.available_from is not null and now() < v_assessment.available_from then
    raise exception 'WINDOW_NOT_OPEN' using errcode = 'invalid_parameter_value';
  end if;

  v_module := (select assessment_module_id(p_assessment));
  if v_module is not null then
    select u.state into v_state
    from module_unlock_state(p_enrollment) u
    where u.module_id = v_module;

    if v_state is distinct from 'AVAILABLE' and v_state is distinct from 'COMPLETED' then
      raise exception 'MODULE_LOCKED' using errcode = 'insufficient_privilege';
    end if;
  end if;

  select * into v_attempt
  from assessment_attempts a
  where a.enrollment_id = p_enrollment and a.assessment_id = p_assessment
  order by a.attempt_number desc
  limit 1;

  -- A graded submission is final, whatever the dates say: a deadline moved
  -- later after grading must not reopen it (the grade would go stale).
  if v_attempt.status = 'GRADED' then
    raise exception 'ALREADY_GRADED' using errcode = 'invalid_parameter_value';
  end if;

  -- Fails closed: a missing deadline counts as passed.
  v_late := coalesce(now() >= v_assessment.available_until, true);

  if v_late and not (
    v_assessment.allow_late_submissions
    and (
      v_attempt.id is null
      or (v_attempt.submitted_late and v_attempt.status <> 'GRADED')
    )
  ) then
    raise exception 'WINDOW_CLOSED' using errcode = 'invalid_parameter_value';
  end if;

  return query
  select v_assessment.organization_id, (select course_id_of_offering(v_assessment.offering_id)), v_assessment.max_files, v_late, v_attempt.id;
end;
$function$;

create or replace function video_checkpoint_stats(p_block uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_offering uuid;
begin
  v_offering := (select offering_id_of_block(p_block));

  if v_offering is null or coalesce((select can_edit_offering(v_offering)), false) is not true then
    raise exception 'Not allowed to read these statistics' using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'enrolledCount', (
      select count(*) from course_enrollments e where e.offering_id = v_offering and e.status <> 'CANCELLED' and ((select is_org_admin(e.organization_id)) or (select is_offering_professor(e.offering_id)))
    ),
    'checkpoints', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', vc.id,
          'atSeconds', vc.at_seconds,
          'minCorrect', vc.min_correct,
          'reached', (
            select count(distinct a.enrollment_id) from video_checkpoint_attempts a
            join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED' and ((select is_org_admin(e.organization_id)) or (select is_offering_professor(e.offering_id)))
            where a.checkpoint_id = vc.id
          ),
          'passed', (
            select count(*) from video_checkpoint_progress p
            join course_enrollments e on e.id = p.enrollment_id and e.status <> 'CANCELLED' and ((select is_org_admin(e.organization_id)) or (select is_offering_professor(e.offering_id)))
            where p.checkpoint_id = vc.id and p.passed_at is not null
          ),
          'totalAttempts', (
            select count(*) from video_checkpoint_attempts a
            join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED' and ((select is_org_admin(e.organization_id)) or (select is_offering_professor(e.offering_id)))
            where a.checkpoint_id = vc.id
          ),
          'failedAttempts', (
            select count(*) from video_checkpoint_attempts a
            join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED' and ((select is_org_admin(e.organization_id)) or (select is_offering_professor(e.offering_id)))
            where a.checkpoint_id = vc.id and not a.passed
          ),
          'firstTryAttempts', (
            select count(*) from video_checkpoint_attempts a
            join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED' and ((select is_org_admin(e.organization_id)) or (select is_offering_professor(e.offering_id)))
            where a.checkpoint_id = vc.id and a.attempt_number = 1
          ),
          'firstTryPassed', (
            select count(*) from video_checkpoint_attempts a
            join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED' and ((select is_org_admin(e.organization_id)) or (select is_offering_professor(e.offering_id)))
            where a.checkpoint_id = vc.id and a.attempt_number = 1 and a.passed
          ),
          'avgAttemptsToPass', (
            select round(avg(p.attempts), 1) from video_checkpoint_progress p
            join course_enrollments e on e.id = p.enrollment_id and e.status <> 'CANCELLED' and ((select is_org_admin(e.organization_id)) or (select is_offering_professor(e.offering_id)))
            where p.checkpoint_id = vc.id and p.passed_at is not null
          ),
          'questions', (
            select coalesce(jsonb_agg(
              jsonb_build_object(
                'id', q.id,
                'prompt', q.prompt,
                'answers', (
                  select count(*) from video_checkpoint_attempt_answers aa
                  join video_checkpoint_attempts a on a.id = aa.attempt_id
                  join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED' and ((select is_org_admin(e.organization_id)) or (select is_offering_professor(e.offering_id)))
                  where aa.question_id = q.id
                ),
                'wrong', (
                  select count(*) from video_checkpoint_attempt_answers aa
                  join video_checkpoint_attempts a on a.id = aa.attempt_id
                  join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED' and ((select is_org_admin(e.organization_id)) or (select is_offering_professor(e.offering_id)))
                  where aa.question_id = q.id and not aa.is_correct
                ),
                'unanswered', (
                  select count(*) from video_checkpoint_attempt_answers aa
                  join video_checkpoint_attempts a on a.id = aa.attempt_id
                  join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED' and ((select is_org_admin(e.organization_id)) or (select is_offering_professor(e.offering_id)))
                  where aa.question_id = q.id and aa.option_id is null
                ),
                'options', (
                  select coalesce(jsonb_agg(
                    jsonb_build_object(
                      'id', o.id,
                      'label', o.label,
                      'isCorrect', o.is_correct,
                      'chosen', (
                        select count(*) from video_checkpoint_attempt_answers aa
                        join video_checkpoint_attempts a on a.id = aa.attempt_id
                        join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED' and ((select is_org_admin(e.organization_id)) or (select is_offering_professor(e.offering_id)))
                        where aa.option_id = o.id
                      )
                    )
                    order by o.position
                  ), '[]'::jsonb)
                  from video_checkpoint_options o
                  where o.question_id = q.id
                )
              )
              order by q.position
            ), '[]'::jsonb)
            from video_checkpoint_questions q
            where q.checkpoint_id = vc.id
          )
        )
        order by vc.at_seconds
      )
      from video_checkpoints vc
      where vc.block_id = p_block
    ), '[]'::jsonb)
  );
end;
$function$;


-- ---------------------------------------------------------------------------
-- 9. Signature / return-type changes: DROP + CREATE + re-grant (no overloads)
-- ---------------------------------------------------------------------------
-- 9.1 reorder_modules(p_course) -> reorder_modules(p_offering)
drop function reorder_modules(uuid, uuid[]);

create function reorder_modules(p_offering uuid, p_ordered_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid;
begin
  if coalesce((select can_edit_offering(p_offering)), false) is not true then
    raise exception 'Not allowed to edit this edition' using errcode = 'insufficient_privilege';
  end if;

  if (select count(*) from modules where offering_id = p_offering)
     <> coalesce(array_length(p_ordered_ids, 1), 0) then
    raise exception 'Ordered id list must contain every module of the edition'
      using errcode = 'invalid_parameter_value';
  end if;

  update modules m
  set position = ordered.ord
  from unnest(p_ordered_ids) with ordinality as ordered(id, ord)
  where m.id = ordered.id
    and m.offering_id = p_offering;

  select organization_id into v_org from course_offerings where id = p_offering;
  perform log_audit(v_org, 'module.reordered', 'course_offering', p_offering, jsonb_build_object('orderedIds', p_ordered_ids));
end;
$function$;

revoke execute on function reorder_modules(uuid, uuid[]) from public, anon;
grant execute on function reorder_modules(uuid, uuid[]) to authenticated;

-- 9.2 assert_subtree_deletable: scoped to an edition.
drop function assert_subtree_deletable(uuid, uuid, uuid);

create function assert_subtree_deletable(p_offering uuid, p_module uuid, p_lesson uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status course_status;
  v_has_active_enrollments boolean;
begin
  select c.status into v_status
  from course_offerings o
  join courses c on c.id = o.course_id
  where o.id = p_offering;

  select exists (
    select 1 from course_enrollments
    where offering_id = p_offering and status = 'ACTIVE'
  ) into v_has_active_enrollments;

  if v_status = 'PUBLISHED' and v_has_active_enrollments then
    raise exception 'CONTENT_IN_USE' using errcode = 'restrict_violation';
  end if;

  if exists (
    select 1
    from content_progress cp
    join lesson_content_blocks b on b.id = cp.content_block_id
    join lessons l on l.id = b.lesson_id
    where (p_module is not null and l.module_id = p_module)
       or (p_lesson is not null and b.lesson_id = p_lesson)
  ) then
    raise exception 'CONTENT_IN_USE' using errcode = 'restrict_violation';
  end if;

  if exists (
    select 1
    from assessment_attempts t
    join assessments a on a.id = t.assessment_id
    join modules m on m.id = a.module_id
    where m.offering_id = p_offering
      and (p_module is null or m.id = p_module)
  ) then
    raise exception 'CONTENT_IN_USE' using errcode = 'restrict_violation';
  end if;
end;
$$;

revoke execute on function assert_subtree_deletable(uuid, uuid, uuid) from public, anon, authenticated;

-- 9.3 delete_content_block no longer returns the storage path: editions share
-- files (copies), so deleting a block never deletes the object.
drop function delete_content_block(uuid);

create function delete_content_block(p_block uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offering uuid;
begin
  v_offering := (select offering_id_of_block(p_block));

  if v_offering is null then
    raise exception 'Block not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select can_edit_offering(v_offering)), false) is not true then
    raise exception 'Not allowed to edit this edition' using errcode = 'insufficient_privilege';
  end if;

  if exists (select 1 from content_progress where content_block_id = p_block) then
    raise exception 'CONTENT_IN_USE' using errcode = 'restrict_violation';
  end if;

  delete from lesson_content_blocks where id = p_block;

  perform refresh_offering_enrollment_totals(v_offering);
end;
$$;

revoke execute on function delete_content_block(uuid) from public, anon;
grant execute on function delete_content_block(uuid) to authenticated;

-- 9.4 my_enrollment_summaries exposes the edition.
drop function my_enrollment_summaries(uuid);

create function my_enrollment_summaries(p_enrollment uuid default null)
returns table (
  enrollment_id uuid,
  status enrollment_status,
  source enrollment_source,
  progress_percent numeric,
  completed_blocks integer,
  total_blocks integer,
  completed_at timestamptz,
  course_id uuid,
  course_title text,
  course_description text,
  course_status course_status,
  offering_name text,
  offering_status offering_status,
  ends_at timestamptz,
  offering_id uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    e.id,
    e.status,
    e.source,
    e.progress_percent,
    e.completed_blocks,
    e.total_blocks,
    e.completed_at,
    c.id,
    c.title,
    c.description,
    c.status,
    o.name,
    o.status,
    o.ends_at,
    o.id
  from course_enrollments e
  join courses c on c.id = e.course_id
  join course_offerings o on o.id = e.offering_id
  where e.user_id = auth.uid()
    -- A revoked membership or a deactivated organization loses access to its
    -- enrollments immediately (D29); `is_org_member` covers both.
    and coalesce((select is_org_member(e.organization_id)), false)
    and (p_enrollment is null or e.id = p_enrollment)
  order by e.enrolled_at desc;
$$;

revoke execute on function my_enrollment_summaries(uuid) from public, anon;
grant execute on function my_enrollment_summaries(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. can_view_block: the student branch needs an enrollment in the block's
--     edition (plus the module schedule), the editor branch is per edition.
-- ---------------------------------------------------------------------------
create or replace function can_view_block(p_block uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with block_ctx as (
    select m.id as module_id, m.offering_id
    from lesson_content_blocks b
    join lessons l on l.id = b.lesson_id
    join modules m on m.id = l.module_id
    where b.id = p_block
  )
  select coalesce(
    (select (select can_edit_offering(bc.offering_id)) from block_ctx bc)
    or (
      select
        (select student_can_view_offering(bc.offering_id))
        and exists (
          select 1
          from course_enrollments e
          join course_offerings o on o.id = e.offering_id
          left join offering_module_schedules s
            on s.offering_id = o.id and s.module_id = bc.module_id
          where e.offering_id = bc.offering_id
            and e.user_id = auth.uid()
            and e.status <> 'CANCELLED'
            and o.status = 'ACTIVE'
            and (s.available_from is null or s.available_from <= now())
            and (s.available_until is null or s.available_until > now())
        )
      from block_ctx bc
    ),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- 11. Course creation, access-type lock and publishing
-- ---------------------------------------------------------------------------
create function create_course(
  p_organization uuid,
  p_title text,
  p_description text,
  p_access_type course_access
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_title text := trim(coalesce(p_title, ''));
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  if coalesce((select is_org_admin(p_organization)), false) is not true then
    raise exception 'Only an organization admin can create a course' using errcode = 'insufficient_privilege';
  end if;

  if char_length(v_title) < 2 or p_access_type is null then
    raise exception 'INVALID_COURSE' using errcode = 'invalid_parameter_value';
  end if;

  insert into courses (organization_id, title, description, access_type, created_by)
  values (p_organization, v_title, nullif(p_description, ''), p_access_type, auth.uid())
  returning id into v_id;

  -- A FREE course is consumed through its single OPEN edition (D13).
  if p_access_type = 'FREE' then
    insert into course_offerings (course_id, organization_id, kind, name)
    values (v_id, p_organization, 'OPEN', v_title);
  end if;

  return v_id;
end;
$$;

revoke execute on function create_course(uuid, text, text, course_access) from public, anon;
grant execute on function create_course(uuid, text, text, course_access) to authenticated;

create function assert_course_access_type_unlocked()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.access_type is distinct from old.access_type
     and exists (select 1 from course_offerings o where o.course_id = old.id) then
    raise exception 'ACCESS_TYPE_LOCKED' using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger assert_course_access_type_unlocked
  before update on courses
  for each row execute function assert_course_access_type_unlocked();

create or replace function publish_course(p_course uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_course courses%rowtype;
  v_complete boolean;
begin
  select * into v_course from courses where id = p_course;

  if v_course.id is null then
    raise exception 'Course not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select is_org_admin(v_course.organization_id)), false) is not true then
    raise exception 'Only an organization admin can publish a course' using errcode = 'insufficient_privilege';
  end if;

  -- Safety net: a FREE course always has its OPEN edition (create_course makes
  -- it; this covers a course inserted by other means).
  if v_course.access_type = 'FREE' then
    insert into course_offerings (course_id, organization_id, kind, name)
    values (p_course, v_course.organization_id, 'OPEN', v_course.title)
    on conflict do nothing;
  end if;

  -- FREE: the OPEN edition has at least one block. PRIVATE: some edition does.
  select exists (
    select 1
    from lesson_content_blocks b
    join lessons l on l.id = b.lesson_id
    join modules m on m.id = l.module_id
    join course_offerings o on o.id = m.offering_id
    where o.course_id = p_course
      and (v_course.access_type <> 'FREE' or o.kind = 'OPEN')
  ) into v_complete;

  if not v_complete then
    raise exception 'COURSE_INCOMPLETE' using errcode = 'invalid_parameter_value';
  end if;

  update courses
  set status = 'PUBLISHED',
      published_at = coalesce(published_at, now()),
      archived_at = null
  where id = p_course;

  perform log_audit(
    v_course.organization_id,
    'course.published',
    'course',
    p_course,
    jsonb_build_object('access_type', v_course.access_type)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Shared question banks: a question used by a PUBLISHED evaluation of an
--     edition the caller cannot edit is read-only for that caller. System
--     writes (no JWT: seeds, service role) are not subject to the lock.
-- ---------------------------------------------------------------------------
create function assert_question_not_in_use_elsewhere()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_question uuid;
  v_bank uuid;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'questions' then
    v_question := coalesce(new.id, old.id);
    v_bank := coalesce(new.question_bank_id, old.question_bank_id);
  else
    v_question := coalesce(new.question_id, old.question_id);
    select q.question_bank_id into v_bank from questions q where q.id = v_question;
  end if;

  -- Not an editor of this bank at all: RLS refuses the write with its own error.
  if coalesce((select can_edit_question_bank(v_bank)), false) is not true then
    return coalesce(new, old);
  end if;

  if exists (
    select 1
    from assessments a
    where a.status = 'PUBLISHED'
      and (
        exists (
          select 1 from assessment_questions aq
          where aq.assessment_id = a.id and aq.question_id = v_question
        )
        or (a.random_question_count is not null and a.question_bank_id = v_bank)
      )
      and coalesce((select can_edit_offering(a.offering_id)), false) is not true
  ) then
    raise exception 'QUESTION_IN_USE_ELSEWHERE' using errcode = 'restrict_violation';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger assert_question_not_in_use_elsewhere
  before update or delete on questions
  for each row execute function assert_question_not_in_use_elsewhere();

create trigger assert_question_not_in_use_elsewhere
  before insert or update or delete on question_options
  for each row execute function assert_question_not_in_use_elsewhere();

-- ---------------------------------------------------------------------------
-- 13. Storage: new uploads live under <org>/<course>/<offering>/...
--     Legacy <org>/<course>/<file> objects are writable by org admins only.
-- ---------------------------------------------------------------------------
create function can_write_offering_file(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_folders text[];
  v_org uuid;
  v_course uuid;
  v_offering uuid;
begin
  v_folders := storage.foldername(p_name);

  if array_length(v_folders, 1) is null or array_length(v_folders, 1) < 2 then
    return false;
  end if;

  -- A malformed path is a denial, not an error: these are attacker-controlled.
  begin
    v_org := v_folders[1]::uuid;
    v_course := v_folders[2]::uuid;
    if array_length(v_folders, 1) >= 3 then
      v_offering := v_folders[3]::uuid;
    end if;
  exception
    when invalid_text_representation then
      return false;
  end;

  -- Legacy course-level prefix: org admins only.
  if v_offering is null then
    return coalesce(
      (
        select c.organization_id = v_org and (select is_org_admin(c.organization_id))
        from courses c
        where c.id = v_course
      ),
      false
    );
  end if;

  return coalesce(
    (
      select o.organization_id = v_org
        and o.course_id = v_course
        and (select can_edit_offering(o.id))
      from course_offerings o
      where o.id = v_offering
    ),
    false
  );
end;
$$;

revoke execute on function can_write_offering_file(text) from public, anon;
grant execute on function can_write_offering_file(text) to authenticated;

create policy course_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'course-files' and (select can_write_offering_file(name)));

create policy course_files_update on storage.objects
  for update to authenticated
  using (bucket_id = 'course-files' and (select can_write_offering_file(name)))
  with check (bucket_id = 'course-files' and (select can_write_offering_file(name)));

create policy course_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'course-files' and (select can_write_offering_file(name)));

-- ---------------------------------------------------------------------------
-- 14. Old course-level helpers out
-- ---------------------------------------------------------------------------
drop function can_write_course_file(text);
drop function video_checkpoint_course(uuid);
drop function required_block_count(uuid);
drop function refresh_course_enrollment_totals(uuid);
drop function can_edit_course_content(uuid);
drop function course_id_of_block(uuid);
drop function course_id_of_lesson(uuid);
drop function course_id_of_module(uuid);

-- Trigger functions are never called through the API.
revoke execute on function assert_block_assessment_same_edition() from public, anon, authenticated;
revoke execute on function assert_dependency_same_edition() from public, anon, authenticated;
revoke execute on function assert_module_edition_stable() from public, anon, authenticated;
revoke execute on function assert_assessment_edition_stable() from public, anon, authenticated;
revoke execute on function assert_course_access_type_unlocked() from public, anon, authenticated;
revoke execute on function assert_question_not_in_use_elsewhere() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 15. Verification (raise on violation)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from lesson_content_blocks b
    where b.assessment_id is not null
      and offering_id_of_block(b.id) is distinct from offering_id_of_assessment(b.assessment_id)
  ) then
    raise exception 'B2 verification: a block points to an evaluation of another edition';
  end if;

  if exists (
    select 1 from module_dependencies d
    where (d.depends_on_module_id is not null
           and offering_id_of_module(d.depends_on_module_id) is distinct from offering_id_of_module(d.module_id))
       or (d.assessment_id is not null
           and offering_id_of_assessment(d.assessment_id) is distinct from offering_id_of_module(d.module_id))
  ) then
    raise exception 'B2 verification: a dependency crosses editions';
  end if;

  if exists (
    select 1 from course_enrollments e
    where e.total_blocks <> required_block_count_for_offering(e.offering_id)
  ) then
    raise exception 'B2 verification: enrollment total_blocks out of sync';
  end if;
end;
$$;
