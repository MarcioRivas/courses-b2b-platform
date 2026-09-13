-- ---------------------------------------------------------------------------
-- attempt_result: the student-safe way to read the resolved score of ONE
-- attempt. `list_my_attempts` needs an enrollment id the attempt page does not
-- always have (a reload drops `?enrollment=`), and `attempt_header` must stay
-- score-free (B1). Every scoring column is NULL unless status = 'GRADED'
-- (D24/F7): a SUBMITTED attempt still reveals nothing.
-- ---------------------------------------------------------------------------
create function attempt_result(p_attempt uuid)
returns table (
  attempt_id uuid,
  status attempt_status,
  score_percent numeric,
  score_label text,
  passed boolean,
  overall_feedback text
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
    v_attempt.status,
    case when v_attempt.status = 'GRADED' then v_attempt.score_percent end,
    case when v_attempt.status = 'GRADED' then v_attempt.score_label end,
    case when v_attempt.status = 'GRADED' then v_attempt.passed end,
    case when v_attempt.status = 'GRADED'
      then (select f.feedback from assessment_feedback f where f.attempt_id = v_attempt.id)
    end;
end;
$$;

revoke execute on function attempt_result(uuid) from public, anon;
grant execute on function attempt_result(uuid) to authenticated;
