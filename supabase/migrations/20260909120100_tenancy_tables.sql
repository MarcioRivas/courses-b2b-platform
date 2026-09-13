-- Tenancy & identity tables (docs/database-schema.md §1)

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext not null unique,
  status org_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on organizations
  for each row execute function set_updated_at();

alter table organizations enable row level security;
alter table organizations force row level security;

create table organization_settings (
  organization_id uuid primary key references organizations (id) on delete cascade,
  timezone text not null default 'America/Montevideo',
  default_passing_score int not null default 60 check (default_passing_score between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on organization_settings
  for each row execute function set_updated_at();

alter table organization_settings enable row level security;
alter table organization_settings force row level security;

create table score_scale_ranges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  min_score int not null check (min_score between 0 and 100),
  max_score int not null check (max_score between 0 and 100),
  label text not null,
  is_passing boolean not null default false,
  created_at timestamptz not null default now(),
  constraint score_scale_ranges_min_le_max check (min_score <= max_score),
  exclude using gist (
    organization_id with =,
    int4range(min_score, max_score, '[]') with &&
  )
);

create index score_scale_ranges_organization_id_idx on score_scale_ranges (organization_id);

alter table score_scale_ranges enable row level security;
alter table score_scale_ranges force row level security;

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

alter table profiles enable row level security;
alter table profiles force row level security;

create table profile_private (
  user_id uuid primary key references profiles (id) on delete cascade,
  email citext not null unique,
  phone text,
  dni text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on profile_private
  for each row execute function set_updated_at();

alter table profile_private enable row level security;
alter table profile_private force row level security;

create table platform_admins (
  user_id uuid primary key references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references profiles (id) on delete set null
);

alter table platform_admins enable row level security;
alter table platform_admins force row level security;

create table organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role membership_role not null,
  status membership_status not null default 'ACTIVE',
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_memberships_user_org_idx on organization_memberships (user_id, organization_id);
create index organization_memberships_org_role_idx on organization_memberships (organization_id, role);

create trigger set_updated_at
  before update on organization_memberships
  for each row execute function set_updated_at();

alter table organization_memberships enable row level security;
alter table organization_memberships force row level security;

create table organization_registration_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  token text not null unique default (
    rtrim(translate(encode(gen_random_bytes(32), 'base64'), '+/', '-_'), '=')
  ),
  label text,
  default_role membership_role not null default 'STUDENT',
  is_active boolean not null default true,
  expires_at timestamptz,
  use_count int not null default 0,
  created_by uuid references profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organization_registration_links_organization_id_idx on organization_registration_links (organization_id);

create trigger set_updated_at
  before update on organization_registration_links
  for each row execute function set_updated_at();

alter table organization_registration_links enable row level security;
alter table organization_registration_links force row level security;

create table groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  description text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create trigger set_updated_at
  before update on groups
  for each row execute function set_updated_at();

alter table groups enable row level security;
alter table groups force row level security;

create table group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  added_by uuid references profiles (id) on delete set null,
  added_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create index group_members_user_id_idx on group_members (user_id);

alter table group_members enable row level security;
alter table group_members force row level security;
