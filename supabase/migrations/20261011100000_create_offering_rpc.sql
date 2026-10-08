-- B3: create an edition (empty or as a copy of another edition of the same course).
-- One transaction: insert the edition, then copy_edition_content when a source is given.

create function create_offering(
  p_course uuid,
  p_name text,
  p_group uuid,
  p_starts timestamptz default null,
  p_ends timestamptz default null,
  p_from_offering uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_course courses%rowtype;
  v_src course_offerings%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  select * into v_course from courses where id = p_course;
  -- Same error for "missing" and "not your org", so course ids can't be probed.
  if v_course.id is null
     or coalesce((select is_org_admin(v_course.organization_id)), false) is not true then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;

  -- FREE courses have a single OPEN edition managed by publish_course.
  if v_course.access_type is distinct from 'PRIVATE' then
    raise exception 'OFFERING_KIND_MISMATCH' using errcode = 'invalid_parameter_value';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'NAME_INVALID' using errcode = 'invalid_parameter_value';
  end if;

  if p_group is null
     or not exists (select 1 from groups where id = p_group and organization_id = v_course.organization_id) then
    raise exception 'GROUP_REQUIRED' using errcode = 'invalid_parameter_value';
  end if;

  if p_starts is not null and p_ends is not null and p_starts >= p_ends then
    raise exception 'DATE_RANGE_INVALID' using errcode = 'check_violation';
  end if;

  if p_from_offering is not null then
    select * into v_src from course_offerings where id = p_from_offering;
    if v_src.id is null or v_src.course_id <> v_course.id then
      raise exception 'COPY_DIFFERENT_COURSE' using errcode = 'invalid_parameter_value';
    end if;
  end if;

  insert into course_offerings (course_id, organization_id, kind, group_id, name, starts_at, ends_at)
  values (v_course.id, v_course.organization_id, 'GROUP', p_group, v_name, p_starts, p_ends)
  returning id into v_id;

  if p_from_offering is not null then
    perform copy_edition_content(p_from_offering, v_id);
  end if;

  -- Enrol the group's students in the same transaction as the edition itself.
  perform sync_offering_roster(v_id);

  perform log_audit(
    v_course.organization_id,
    'offering.created',
    'course_offering',
    v_id,
    jsonb_build_object('courseId', v_course.id, 'kind', 'GROUP', 'from_offering', p_from_offering)
  );

  return v_id;
end;
$$;

revoke execute on function create_offering(uuid, text, uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function create_offering(uuid, text, uuid, timestamptz, timestamptz, uuid) to authenticated;
