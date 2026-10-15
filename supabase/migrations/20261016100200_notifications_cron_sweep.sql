-- Time-based notifications (nothing fires when a date passes, so cron sweeps):
--   every 10 min  MODULE_OPENED, MODULE_CLOSING_SOON, ASSESSMENT_DUE_SOON, TASK_READY_TO_GRADE
--   hourly        EXAM_TODAY, processed once per org from 08:00 org-local time
--
-- Idempotent: every insert is ON CONFLICT (user_id, type, entity_id) DO NOTHING,
-- so reruns and overlapping windows never duplicate. "Just happened" types look
-- back 1 day only, so the first deploy does not backfill old modules/tasks.
-- If pg_cron is unavailable on the hosted project these silently stop (D36).

-- ---------------------------------------------------------------------------
-- 1. Helpers. Plain (not SECURITY DEFINER, no SET) so the planner can inline
-- them into the sweeps, which already run as definer, and push the offering /
-- module filters down instead of materialising every enrollment per run.
-- ---------------------------------------------------------------------------
/** Students who may receive course notifications right now. */
create function notifiable_enrollments()
returns table (
  enrollment_id uuid,
  user_id uuid,
  organization_id uuid,
  offering_id uuid,
  course_title text,
  time_zone text
)
language sql
stable
as $$
  select e.id, e.user_id, e.organization_id, e.offering_id, c.title,
         coalesce(s.timezone, 'America/Montevideo')
  from course_enrollments e
  join course_offerings o on o.id = e.offering_id and o.status = 'ACTIVE'
  join courses c on c.id = e.course_id and c.status <> 'ARCHIVED'
  join organizations org on org.id = e.organization_id and org.status = 'ACTIVE'
  join organization_memberships om
    on om.user_id = e.user_id
   and om.organization_id = e.organization_id
   and om.status = 'ACTIVE'
  left join organization_settings s on s.organization_id = e.organization_id
  where e.status = 'ACTIVE'
    and (o.ends_at is null or o.ends_at > now());
$$;

revoke execute on function notifiable_enrollments() from public, anon, authenticated;

/** True when every required block of the module has progress for the enrollment. */
create function enrollment_module_done(p_enrollment uuid, p_module uuid)
returns boolean
language sql
stable
as $$
  select not exists (
    select 1
    from lessons l
    join lesson_content_blocks b on b.lesson_id = l.id
    where l.module_id = p_module
      and b.is_required
      and not exists (
        select 1 from content_progress cp
        where cp.enrollment_id = p_enrollment and cp.content_block_id = b.id
      )
  );
$$;

revoke execute on function enrollment_module_done(uuid, uuid) from public, anon, authenticated;

/** False when the assessment's module has a schedule that has not opened yet. */
create function assessment_module_open(p_assessment uuid, p_offering uuid)
returns boolean
language sql
stable
as $$
  select not exists (
    select 1 from offering_module_schedules s
    where s.offering_id = p_offering
      and s.module_id = (select assessment_module_id(p_assessment))
      and s.available_from > now()
  );
$$;

revoke execute on function assessment_module_open(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The 10-minute sweep.
-- ---------------------------------------------------------------------------
create function sweep_time_based_notifications()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- MODULE_OPENED: the module's start date was reached in the last day.
  insert into notifications (user_id, organization_id, type, entity_id, offering_id, payload)
  select ne.user_id, ne.organization_id, 'MODULE_OPENED', m.id, ne.offering_id,
         jsonb_build_object(
           'moduleTitle', m.title, 'courseTitle', ne.course_title,
           'enrollmentId', ne.enrollment_id, 'availableUntil', s.available_until
         )
  from offering_module_schedules s
  join modules m on m.id = s.module_id
  join notifiable_enrollments() ne on ne.offering_id = s.offering_id
  where s.available_from <= now()
    and s.available_from > now() - interval '1 day'
  on conflict on constraint notifications_unique_entity do nothing;

  -- MODULE_CLOSING_SOON: closes within 48h and the student has not finished it.
  insert into notifications (user_id, organization_id, type, entity_id, offering_id, payload)
  select ne.user_id, ne.organization_id, 'MODULE_CLOSING_SOON', m.id, ne.offering_id,
         jsonb_build_object(
           'moduleTitle', m.title, 'courseTitle', ne.course_title,
           'enrollmentId', ne.enrollment_id, 'availableUntil', s.available_until
         )
  from offering_module_schedules s
  join modules m on m.id = s.module_id
  join notifiable_enrollments() ne on ne.offering_id = s.offering_id
  where s.available_until between now() and now() + interval '48 hours'
    and (s.available_from is null or s.available_from <= now())
    and not exists (
      select 1 from notifications n
      where n.user_id = ne.user_id and n.type = 'MODULE_CLOSING_SOON' and n.entity_id = m.id
    )
    and not enrollment_module_done(ne.enrollment_id, m.id)
  on conflict on constraint notifications_unique_entity do nothing;

  -- ASSESSMENT_DUE_SOON: open, due within 48h, nothing handed in yet. Exams
  -- have their own morning EXAM_TODAY reminder instead.
  insert into notifications (user_id, organization_id, type, entity_id, offering_id, payload)
  select ne.user_id, ne.organization_id, 'ASSESSMENT_DUE_SOON', a.id, ne.offering_id,
         jsonb_build_object(
           'assessmentId', a.id, 'assessmentTitle', a.title, 'kind', a.kind,
           'courseTitle', ne.course_title, 'enrollmentId', ne.enrollment_id,
           'dueAt', a.available_until
         )
  from assessments a
  join notifiable_enrollments() ne on ne.offering_id = a.offering_id
  where a.status = 'PUBLISHED'
    and a.kind <> 'EXAM'
    and a.available_until between now() and now() + interval '48 hours'
    and (a.available_from is null or a.available_from <= now())
    and not exists (
      select 1 from notifications n
      where n.user_id = ne.user_id and n.type = 'ASSESSMENT_DUE_SOON' and n.entity_id = a.id
    )
    and assessment_module_open(a.id, a.offering_id)
    and not exists (
      select 1 from assessment_attempts t
      where t.assessment_id = a.id
        and t.enrollment_id = ne.enrollment_id
        and t.status <> 'IN_PROGRESS'
    )
  on conflict on constraint notifications_unique_entity do nothing;

  -- TASK_READY_TO_GRADE: deadline passed in the last day with >= 1 submission.
  insert into notifications (user_id, organization_id, type, entity_id, offering_id, payload)
  select op.user_id, a.organization_id, 'TASK_READY_TO_GRADE', a.id, a.offering_id,
         jsonb_build_object(
           'assessmentId', a.id, 'assessmentTitle', a.title, 'kind', a.kind,
           'offeringId', a.offering_id, 'courseTitle', c.title, 'count', sub.n
         )
  from assessments a
  join course_offerings o on o.id = a.offering_id and o.status = 'ACTIVE'
  join courses c on c.id = o.course_id
  cross join lateral (
    select count(*)::int as n
    from assessment_attempts t
    where t.assessment_id = a.id and t.status = 'SUBMITTED'
  ) sub
  join offering_professors op on op.offering_id = a.offering_id
  join organization_memberships om
    on om.user_id = op.user_id
   and om.organization_id = a.organization_id
   and om.status = 'ACTIVE'
  where a.kind = 'TASK'
    and a.status = 'PUBLISHED'
    and a.available_until <= now()
    and a.available_until > now() - interval '1 day'
    and sub.n > 0
  on conflict on constraint notifications_unique_entity do nothing;
end;
$$;

revoke execute on function sweep_time_based_notifications() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. EXAM_TODAY: morning reminder, org-local. Hourly job; an org is handled
-- from 08:00 local on (>= so a missed run is caught next hour), dedup keeps it
-- to one per student and exam. p_now exists for tests.
-- ---------------------------------------------------------------------------
create function sweep_exam_today_notifications(p_now timestamptz default now())
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into notifications (user_id, organization_id, type, entity_id, offering_id, payload)
  select ne.user_id, ne.organization_id, 'EXAM_TODAY', a.id, ne.offering_id,
         jsonb_build_object(
           'assessmentId', a.id, 'assessmentTitle', a.title, 'kind', a.kind,
           'courseTitle', ne.course_title, 'enrollmentId', ne.enrollment_id,
           'startsAt', a.available_from
         )
  from assessments a
  join notifiable_enrollments() ne on ne.offering_id = a.offering_id
  where a.kind = 'EXAM'
    and a.status = 'PUBLISHED'
    and a.available_from is not null
    and (a.available_until is null or a.available_until > p_now)
    -- An invalid org timezone would make `at time zone` abort the whole insert.
    and ne.time_zone in (select name from pg_timezone_names)
    and (p_now at time zone ne.time_zone)::time >= time '08:00'
    and (a.available_from at time zone ne.time_zone)::date = (p_now at time zone ne.time_zone)::date
    and assessment_module_open(a.id, a.offering_id)
    and not exists (
      select 1 from assessment_attempts t
      where t.assessment_id = a.id and t.enrollment_id = ne.enrollment_id
    )
  on conflict on constraint notifications_unique_entity do nothing;
end;
$$;

revoke execute on function sweep_exam_today_notifications(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Indexes for the date windows, and the schedules.
-- ---------------------------------------------------------------------------
create index offering_module_schedules_available_from_idx on offering_module_schedules (available_from);
create index offering_module_schedules_available_until_idx on offering_module_schedules (available_until);
create index assessments_published_until_idx on assessments (available_until) where status = 'PUBLISHED';
create index assessments_published_exam_from_idx on assessments (available_from)
  where status = 'PUBLISHED' and kind = 'EXAM';

select cron.schedule(
  'notification-sweep',
  '*/10 * * * *',
  $$select sweep_time_based_notifications()$$
);

select cron.schedule(
  'notification-exam-today',
  '0 * * * *',
  $$select sweep_exam_today_notifications()$$
);
