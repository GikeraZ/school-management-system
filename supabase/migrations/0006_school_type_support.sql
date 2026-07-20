-- ============================================================================
-- Migration 0006: School type support, grading scales, teacher assignments
-- ============================================================================
-- Supports Primary, Secondary, and Mixed schools with configurable grading.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.school_type as enum ('primary', 'secondary', 'mixed');
create type public.grading_method as enum ('cbc', 'kcse', 'percentage');

-- ---------------------------------------------------------------------------
-- School Settings (singleton — one row per school)
-- ---------------------------------------------------------------------------
create table public.school_settings (
  id                uuid primary key default gen_random_uuid(),
  school_name       text not null default 'My School',
  school_type       public.school_type not null default 'primary',
  grading_method    public.grading_method not null default 'percentage',
  motto             text,
  address           text,
  phone             text,
  email             text,
  logo_url          text,
  academic_year     text not null default to_char(now(), 'YYYY'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Seed a default row
insert into public.school_settings (id) values (gen_random_uuid())
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Grading Scales (per school type and grading method)
-- ---------------------------------------------------------------------------
create table public.grading_scales (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,        -- e.g. "KCSE Standard", "CBC Primary"
  school_type     public.school_type not null,
  grading_method  public.grading_method not null,
  is_default      boolean not null default false,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Grading Boundaries (individual rows per grade letter)
-- ---------------------------------------------------------------------------
create table public.grading_boundaries (
  id              uuid primary key default gen_random_uuid(),
  scale_id        uuid not null references public.grading_scales (id) on delete cascade,
  grade_letter    text not null,         -- "A", "A-", "EE", "ME", etc.
  min_percentage  numeric(5,2) not null, -- e.g. 80.00
  max_percentage  numeric(5,2) not null default 100.00,
  points          numeric(4,1),          -- KCSE points: 12, 11, 10... or null for CBC
  remarks         text,                  -- "Excellent", "Meeting Expectation", etc.
  sort_order      int not null default 0,
  unique (scale_id, grade_letter)
);

-- ---------------------------------------------------------------------------
-- Teacher Assignments (which teacher teaches which subject in which class/stream)
-- ---------------------------------------------------------------------------
create table public.teacher_assignments (
  id              uuid primary key default gen_random_uuid(),
  teacher_id      uuid not null references public.teachers (id) on delete cascade,
  subject_id      uuid not null references public.subjects (id) on delete cascade,
  grade_id        uuid not null references public.grades (id) on delete cascade,
  stream_id       uuid references public.streams (id) on delete cascade, -- null = all streams
  academic_year   text not null default to_char(now(), 'YYYY'),
  created_at      timestamptz not null default now(),
  unique (teacher_id, subject_id, grade_id, stream_id, academic_year)
);

-- ---------------------------------------------------------------------------
-- Class Teacher (one teacher per class/stream)
-- ---------------------------------------------------------------------------
create table public.class_teachers (
  id              uuid primary key default gen_random_uuid(),
  teacher_id      uuid not null references public.teachers (id) on delete cascade,
  grade_id        uuid not null references public.grades (id) on delete cascade,
  stream_id       uuid references public.streams (id) on delete cascade,
  academic_year   text not null default to_char(now(), 'YYYY'),
  created_at      timestamptz not null default now(),
  unique (grade_id, stream_id, academic_year)
);

-- ---------------------------------------------------------------------------
-- Timetable
-- ---------------------------------------------------------------------------
create table public.timetable_slots (
  id              uuid primary key default gen_random_uuid(),
  grade_id        uuid not null references public.grades (id) on delete cascade,
  stream_id       uuid references public.streams (id) on delete cascade,
  subject_id      uuid not null references public.subjects (id) on delete cascade,
  teacher_id      uuid references public.teachers (id) on delete set null,
  day_of_week     int not null check (day_of_week between 0 and 6), -- 0=Mon
  start_time      time not null,
  end_time        time not null,
  academic_year   text not null default to_char(now(), 'YYYY'),
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Student Promotions
-- ---------------------------------------------------------------------------
create table public.student_promotions (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.students (id) on delete cascade,
  from_grade_id     uuid not null references public.grades (id),
  from_stream_id    uuid references public.streams (id),
  to_grade_id       uuid not null references public.grades (id),
  to_stream_id      uuid references public.streams (id),
  academic_year     text not null,
  promoted_by       uuid references auth.users (id),
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Alter results table to add points and position
-- ---------------------------------------------------------------------------
alter table public.results
  add column if not exists points numeric(4,1),
  add column if not exists position int,
  add column if not exists class_position int,
  add column if not exists stream_position int;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_teacher_assignments_teacher on public.teacher_assignments (teacher_id);
create index if not exists idx_teacher_assignments_grade on public.teacher_assignments (grade_id);
create index if not exists idx_teacher_assignments_subject on public.teacher_assignments (subject_id);
create index if not exists idx_timetable_grade on public.timetable_slots (grade_id);
create index if not exists idx_timetable_day on public.timetable_slots (day_of_week);
create index if not exists idx_student_promotions_student on public.student_promotions (student_id);
create index if not exists idx_grading_boundaries_scale on public.grading_boundaries (scale_id);

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------
alter table public.school_settings      enable row level security;
alter table public.grading_scales       enable row level security;
alter table public.grading_boundaries   enable row level security;
alter table public.teacher_assignments  enable row level security;
alter table public.class_teachers       enable row level security;
alter table public.timetable_slots      enable row level security;
alter table public.student_promotions   enable row level security;

-- school_settings: staff read, head teachers write
create policy school_settings_select on public.school_settings for select using (public.is_staff());
create policy school_settings_ht_write on public.school_settings
  for all using (public.is_head_teacher()) with check (public.is_head_teacher());

-- grading_scales + boundaries: staff read, head teachers write
create policy grading_scales_select on public.grading_scales for select using (public.is_staff());
create policy grading_scales_ht_write on public.grading_scales
  for all using (public.is_head_teacher()) with check (public.is_head_teacher());
create policy grading_boundaries_select on public.grading_boundaries for select using (public.is_staff());
create policy grading_boundaries_ht_write on public.grading_boundaries
  for all using (public.is_head_teacher()) with check (public.is_head_teacher());

-- teacher_assignments: staff read, head teachers write
create policy teacher_assignments_select on public.teacher_assignments for select using (public.is_staff());
create policy teacher_assignments_ht_write on public.teacher_assignments
  for all using (public.is_head_teacher()) with check (public.is_head_teacher());

-- class_teachers: staff read, head teachers write
create policy class_teachers_select on public.class_teachers for select using (public.is_staff());
create policy class_teachers_ht_write on public.class_teachers
  for all using (public.is_head_teacher()) with check (public.is_head_teacher());

-- timetable: staff read, head teachers write
create policy timetable_select on public.timetable_slots for select using (public.is_staff());
create policy timetable_ht_write on public.timetable_slots
  for all using (public.is_head_teacher()) with check (public.is_head_teacher());

-- student_promotions: staff read, head teachers write
create policy promotions_select on public.student_promotions for select using (public.is_staff());
create policy promotions_ht_write on public.student_promotions
  for all using (public.is_head_teacher()) with check (public.is_head_teacher());

-- ---------------------------------------------------------------------------
-- Updated-at trigger for school_settings
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists school_settings_set_updated_at on public.school_settings;
create trigger school_settings_set_updated_at
  before update on public.school_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Seed: Default KCSE grading scale (for secondary)
-- ---------------------------------------------------------------------------
insert into public.grading_scales (id, name, school_type, grading_method, is_default) values
  ('a1111111-1111-1111-1111-111111111101', 'KCSE Standard', 'secondary', 'kcse', true),
  ('a1111111-1111-1111-1111-111111111102', 'CBC Primary', 'primary', 'cbc', true),
  ('a1111111-1111-1111-1111-111111111103', 'Percentage Primary', 'primary', 'percentage', false)
on conflict do nothing;

-- KCSE boundaries
insert into public.grading_boundaries (scale_id, grade_letter, min_percentage, max_percentage, points, remarks, sort_order) values
  ('a1111111-1111-1111-1111-111111111101', 'A',  80, 100, 12, 'Excellent',      1),
  ('a1111111-1111-1111-1111-111111111101', 'A-', 75, 79.99, 11, 'Very Good',    2),
  ('a1111111-1111-1111-1111-111111111101', 'B+', 70, 74.99, 10, 'Good',          3),
  ('a1111111-1111-1111-1111-111111111101', 'B',  65, 69.99, 9,  'Above Average', 4),
  ('a1111111-1111-1111-1111-111111111101', 'B-', 60, 64.99, 8,  'Average',       5),
  ('a1111111-1111-1111-1111-111111111101', 'C+', 55, 59.99, 7,  'Good',          6),
  ('a1111111-1111-1111-1111-111111111101', 'C',  50, 54.99, 6,  'Above Average', 7),
  ('a1111111-1111-1111-1111-111111111101', 'C-', 45, 49.99, 5,  'Average',       8),
  ('a1111111-1111-1111-1111-111111111101', 'D+', 40, 44.99, 4,  'Below Average', 9),
  ('a1111111-1111-1111-1111-111111111101', 'D',  35, 39.99, 3,  'Poor',         10),
  ('a1111111-1111-1111-1111-111111111101', 'D-', 30, 34.99, 2,  'Very Poor',    11),
  ('a1111111-1111-1111-1111-111111111101', 'E',   0, 29.99, 1,  'Failed',       12)
on conflict (scale_id, grade_letter) do nothing;

-- CBC boundaries (primary)
insert into public.grading_boundaries (scale_id, grade_letter, min_percentage, max_percentage, points, remarks, sort_order) values
  ('a1111111-1111-1111-1111-111111111102', 'EE', 75, 100, null, 'Exceeding Expectations', 1),
  ('a1111111-1111-1111-1111-111111111102', 'ME', 50, 74.99, null, 'Meeting Expectations', 2),
  ('a1111111-1111-1111-1111-111111111102', 'AE', 25, 49.99, null, 'Approaching Expectations', 3),
  ('a1111111-1111-1111-1111-111111111102', 'BE',  0, 24.99, null, 'Below Expectations', 4)
on conflict (scale_id, grade_letter) do nothing;

-- Percentage boundaries (primary alternative)
insert into public.grading_boundaries (scale_id, grade_letter, min_percentage, max_percentage, points, remarks, sort_order) values
  ('a1111111-1111-1111-1111-111111111103', 'A',  80, 100, null, 'Excellent',     1),
  ('a1111111-1111-1111-1111-111111111103', 'B',  65, 79.99, null, 'Good',         2),
  ('a1111111-1111-1111-1111-111111111103', 'C',  50, 64.99, null, 'Average',      3),
  ('a1111111-1111-1111-1111-111111111103', 'D',  30, 49.99, null, 'Below Average', 4),
  ('a1111111-1111-1111-1111-111111111103', 'E',   0, 29.99, null, 'Poor',          5)
on conflict (scale_id, grade_letter) do nothing;
