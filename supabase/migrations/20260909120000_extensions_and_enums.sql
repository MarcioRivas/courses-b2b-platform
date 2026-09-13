-- Extensions
create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists btree_gist;

-- Enums (all 15 created now; later phases only add tables)
create type org_status as enum ('ACTIVE', 'INACTIVE');
create type membership_role as enum ('ADMIN', 'PROFESSOR', 'STUDENT');
create type membership_status as enum ('ACTIVE', 'INACTIVE');
create type course_status as enum ('DRAFT', 'PUBLISHED', 'ARCHIVED');
create type course_access as enum ('FREE', 'PRIVATE');
create type offering_kind as enum ('GROUP', 'OPEN');
create type offering_status as enum ('ACTIVE', 'CANCELLED');
create type enrollment_status as enum ('ACTIVE', 'COMPLETED', 'CANCELLED');
create type enrollment_source as enum ('GROUP_ASSIGNMENT', 'FREE_COURSE');
create type content_block_type as enum ('YOUTUBE_VIDEO', 'RICH_TEXT', 'PDF', 'IMAGE', 'EXTERNAL_LINK', 'QUIZ', 'TASK');
create type question_type as enum ('MULTIPLE_CHOICE', 'OPEN_ENDED');
create type assessment_kind as enum ('QUIZ', 'TASK', 'EXAM');
create type assessment_status as enum ('DRAFT', 'PUBLISHED');
create type attempt_status as enum ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED', 'GRADED');
create type dependency_condition as enum ('MODULE_COMPLETED', 'QUIZ_PASSED');

-- Shared trigger function: maintain updated_at on every mutable table
create function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Trigger function: never callable directly via RPC (C2).
revoke execute on function set_updated_at() from public, anon, authenticated;
