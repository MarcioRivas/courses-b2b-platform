-- Seed data (orgs, settings, score ranges, groups, registration links).
-- Users are created separately by scripts/seed-users.ts (auth admin API),
-- which references the fixed ids below.

-- Organizations
insert into organizations (id, name, slug, status) values
  ('11111111-1111-1111-1111-111111111111', 'Club Atlético Demo', 'club-atletico-demo', 'ACTIVE'),
  ('22222222-2222-2222-2222-222222222222', 'Federación Demo', 'federacion-demo', 'ACTIVE');

-- Settings
insert into organization_settings (organization_id, timezone, default_passing_score) values
  ('11111111-1111-1111-1111-111111111111', 'America/Montevideo', 60),
  ('22222222-2222-2222-2222-222222222222', 'America/Montevideo', 60);

-- Score scale ranges (4 per org)
insert into score_scale_ranges (organization_id, min_score, max_score, label, is_passing) values
  ('11111111-1111-1111-1111-111111111111', 90, 100, 'Excelente', true),
  ('11111111-1111-1111-1111-111111111111', 80, 89, 'Muy bueno', true),
  ('11111111-1111-1111-1111-111111111111', 70, 79, 'Bueno', true),
  ('11111111-1111-1111-1111-111111111111', 0, 69, 'No aprobado', false),
  ('22222222-2222-2222-2222-222222222222', 90, 100, 'Excelente', true),
  ('22222222-2222-2222-2222-222222222222', 80, 89, 'Muy bueno', true),
  ('22222222-2222-2222-2222-222222222222', 70, 79, 'Bueno', true),
  ('22222222-2222-2222-2222-222222222222', 0, 69, 'No aprobado', false);

-- One group per org (created_by null: users don't exist yet in this script)
insert into groups (id, organization_id, name, description, created_by) values
  ('11111111-1111-1111-1111-111111111112', '11111111-1111-1111-1111-111111111111', 'Grupo Principal', 'Grupo de demostración', null),
  ('22222222-2222-2222-2222-222222222223', '22222222-2222-2222-2222-222222222222', 'Grupo Principal', 'Grupo de demostración', null);

-- One active registration link per org, fixed tokens, 30-day expiry
insert into organization_registration_links (
  id, organization_id, token, label, default_role, is_active, expires_at, created_by
) values
  (
    '11111111-1111-1111-1111-111111111113',
    '11111111-1111-1111-1111-111111111111',
    'demo-link-org-a',
    'Enlace de demostración',
    'STUDENT',
    true,
    now() + interval '30 days',
    null
  ),
  (
    '22222222-2222-2222-2222-222222222224',
    '22222222-2222-2222-2222-222222222222',
    'demo-link-org-b',
    'Enlace de demostración',
    'STUDENT',
    true,
    now() + interval '30 days',
    null
  );
