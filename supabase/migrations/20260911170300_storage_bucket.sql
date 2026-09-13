-- Phase 3 — Private `course-files` bucket (D10, D26).
--
-- Object path layout: <organization_id>/<course_id>/<uuid>-<safe-name>
-- so a single policy expression can authorise both the tenant and the course.
--
-- There is deliberately NO SELECT policy for `authenticated`: nobody reads an
-- object with their own session, not even an enrolled student of the same org.
-- Every read is a 1-hour signed URL minted server-side with the service-role
-- client after can_view_block() passes. Row policies cannot express "only the
-- file belonging to a block I am allowed to see", which is why reads leave the
-- policy layer entirely.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-files',
  'course-files',
  false,
  52428800, -- 50 MB
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/**
 * True when the caller may write under this object path: the second segment
 * must be a course they can edit, and the first must be that course's own
 * organization. Checking both stops an editor of course X from writing under
 * another tenant's prefix by hand-crafting the path.
 */
create function can_write_course_file(p_name text)
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
begin
  v_folders := storage.foldername(p_name);

  if array_length(v_folders, 1) is null or array_length(v_folders, 1) < 2 then
    return false;
  end if;

  -- A malformed path is a denial, not an error: these are attacker-controlled.
  begin
    v_org := v_folders[1]::uuid;
    v_course := v_folders[2]::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  return coalesce(
    (
      select c.organization_id = v_org and (select can_edit_course(c.id))
      from courses c
      where c.id = v_course
    ),
    false
  );
end;
$$;

revoke execute on function can_write_course_file(text) from public, anon;
grant execute on function can_write_course_file(text) to authenticated;

create policy course_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'course-files' and (select can_write_course_file(name)));

create policy course_files_update on storage.objects
  for update to authenticated
  using (bucket_id = 'course-files' and (select can_write_course_file(name)))
  with check (bucket_id = 'course-files' and (select can_write_course_file(name)));

create policy course_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'course-files' and (select can_write_course_file(name)));
