-- attempt_header: expose enrollment_id so the result page can link back to the
-- course (/learn/courses/{enrollmentId}) and to the retry preflight without a
-- direct read of assessment_attempts (students have no SELECT on it).
drop function if exists attempt_header(uuid);

create function attempt_header(p_attempt uuid)
returns table (
  attempt_id uuid,
  assessment_id uuid,
  enrollment_id uuid,
  status attempt_status,
  attempt_number int,
  started_at timestamptz,
  effective_end_at timestamptz,
  active_session_id uuid,
  server_now timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt assessment_attempts%rowtype;
begin
  if coalesce((select can_view_attempt(p_attempt)), false) is not true then
    raise exception 'Not allowed to read this attempt' using errcode = 'insufficient_privilege';
  end if;

  select * into v_attempt from assessment_attempts where id = p_attempt;

  return query
  select
    v_attempt.id,
    v_attempt.assessment_id,
    v_attempt.enrollment_id,
    v_attempt.status,
    v_attempt.attempt_number,
    v_attempt.started_at,
    v_attempt.effective_end_at,
    v_attempt.active_session_id,
    now();
end;
$$;
revoke execute on function attempt_header(uuid) from public, anon;
grant execute on function attempt_header(uuid) to authenticated;
