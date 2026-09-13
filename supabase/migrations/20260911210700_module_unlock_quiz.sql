-- Phase 5E — the QUIZ_PASSED branch of `module_unlock_state`.
--
-- Phase 4 shipped this function with the QUIZ_PASSED condition stubbed to
-- "satisfied", because `assessments` did not exist yet. The stub was documented
-- in the migration, in the phase file, and in a passing integration test that
-- asserted the permissive behaviour — so it could not ship silently. This
-- migration replaces it with the real rule and that test flips to the strict
-- expectation.
--
-- The rule: the student's BEST score across attempts that have actually been
-- scored must reach `min_score`. An IN_PROGRESS attempt never counts, and a
-- SUBMITTED-but-ungraded one counts only on the score computed so far — the
-- auto-graded portion — which is the honest reading of "have they passed yet".
create or replace function module_unlock_state(p_enrollment uuid)
returns table (
  module_id uuid,
  state text,
  reason text,
  available_from timestamptz,
  available_until timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
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
    where m.course_id = v_enrollment.course_id
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
    where m.course_id = v_enrollment.course_id
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
$$;

revoke execute on function module_unlock_state(uuid) from public, anon;
grant execute on function module_unlock_state(uuid) to authenticated;
