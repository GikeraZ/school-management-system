-- ============================================================================
-- School Management System — Initial schema
-- Compatible with Supabase (Postgres 15). Deploy with `supabase db push`
-- or paste into the Supabase SQL editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('teacher', 'head_teacher');
create type public.gender as enum ('male', 'female', 'other');
create type public.student_status as enum ('active', 'inactive', 'transferred', 'completed');
create type public.sms_type as enum ('result', 'bulk_result', 'announcement', 'fee_reminder');
create type public.sms_status as enum ('queued', 'sent', 'failed', 'delivered', 'undelivered');

-- ---------------------------------------------------------------------------
-- Profiles / Roles
-- A separate table drives login capabilities and role-based access (RLS).
-- ---------------------------------------------------------------------------
create table public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users (id) on delete cascade,
  role        public.user_role not null default 'teacher',
  full_name   text not null,
  email       text,
  created_at  timestamptz not null default now()
);

-- Auto-create a teacher role row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_roles (user_id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.email,
    (case
      when new.email like '%+admin@%' then 'head_teacher'
      else 'teacher'
    end)::public.user_role
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Staff directory (managed by Head Teachers)
-- ---------------------------------------------------------------------------
create table public.teachers (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  email       text,
  phone       text,
  user_id     uuid unique references auth.users (id) on delete set null,
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Academic structure: Grades -> Streams, and Subjects
-- ---------------------------------------------------------------------------
create table public.grades (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,        -- e.g. "Grade 6"
  level       int not null,         -- sorting / year level, e.g. 6
  created_at  timestamptz not null default now(),
  unique (level)
);

create table public.streams (
  id          uuid primary key default gen_random_uuid(),
  grade_id    uuid not null references public.grades (id) on delete cascade,
  name        text not null,        -- e.g. "East", "West"
  created_at  timestamptz not null default now(),
  unique (grade_id, name)
);

create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text,
  created_at  timestamptz not null default now(),
  unique (code)
);

-- ---------------------------------------------------------------------------
-- Students (includes parent contact — stored securely, never in client bundle)
-- ---------------------------------------------------------------------------
create table public.students (
  id                uuid primary key default gen_random_uuid(),
  admission_number  text not null unique,
  full_name         text not null,
  gender            public.gender,
  grade_id          uuid not null references public.grades (id) on delete restrict,
  stream_id         uuid not null references public.streams (id) on delete restrict,
  parent_name       text not null,
  parent_phone      text not null,  -- E.164, e.g. +254712345678
  status            public.student_status not null default 'active',
  date_of_birth     date,
  created_by        uuid references auth.users (id),
  created_at        timestamptz not null default now(),
  constraint phone_e164 check (parent_phone ~ '^\+[1-9]\d{6,14}$')
);

-- ---------------------------------------------------------------------------
-- Exams
-- ---------------------------------------------------------------------------
create table public.exams (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,     -- e.g. "End Term 1"
  term            text not null,     -- e.g. "Term 1"
  academic_year   text not null default to_char(now(), 'YYYY'),
  exam_date       date not null,
  created_by      uuid references auth.users (id),
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Results (marks per student per subject per exam)
-- ---------------------------------------------------------------------------
create table public.results (
  id            uuid primary key default gen_random_uuid(),
  exam_id       uuid not null references public.exams (id) on delete cascade,
  grade_id      uuid not null references public.grades (id) on delete cascade,
  stream_id     uuid not null references public.streams (id) on delete cascade,
  subject_id    uuid not null references public.subjects (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  marks         numeric(6,2) not null,
  out_of        numeric(6,2) not null default 100,
  grade_letter  text,
  remarks       text,
  published     boolean not null default false,
  entered_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (exam_id, subject_id, student_id)
);

-- ---------------------------------------------------------------------------
-- Fees
-- ---------------------------------------------------------------------------
create table public.fee_structures (
  id              uuid primary key default gen_random_uuid(),
  grade_id        uuid not null references public.grades (id) on delete cascade,
  term            text not null,
  academic_year   text not null default to_char(now(), 'YYYY'),
  amount          numeric(12,2) not null check (amount >= 0),
  created_by      uuid references auth.users (id),
  created_at      timestamptz not null default now(),
  unique (grade_id, term, academic_year)
);

create table public.fee_payments (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.students (id) on delete cascade,
  term            text not null,
  academic_year   text not null default to_char(now(), 'YYYY'),
  amount          numeric(12,2) not null check (amount > 0),
  payment_date    date not null default current_date,
  method          text default 'cash',
  reference       text,
  recorded_by     uuid references auth.users (id),
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Fee reminder automation settings (single configurable row)
-- ---------------------------------------------------------------------------
create table public.fee_reminder_settings (
  id              uuid primary key default gen_random_uuid(),
  enabled         boolean not null default true,
  frequency_days  int not null default 7 check (frequency_days between 1 and 60),
  last_run        timestamptz,
  next_run        timestamptz,
  updated_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now()
);

insert into public.fee_reminder_settings (id, next_run)
values (gen_random_uuid(), now() + interval '7 days')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- SMS logs
-- ---------------------------------------------------------------------------
create table public.sms_logs (
  id                  uuid primary key default gen_random_uuid(),
  recipient_phone     text not null,
  recipient_name      text,
  student_id          uuid references public.students (id) on delete set null,
  type                public.sms_type not null,
  message             text not null,
  status              public.sms_status not null default 'queued',
  provider_message_id text,
  error               text,
  sent_by             uuid references auth.users (id),
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index on public.students (grade_id);
create index on public.students (stream_id);
create index on public.results (exam_id);
create index on public.results (stream_id);
create index on public.results (subject_id);
create index on public.results (student_id);
create index on public.fee_payments (student_id);
create index on public.fee_payments (term, academic_year);
create index on public.sms_logs (student_id);
create index on public.sms_logs (created_at);

-- ---------------------------------------------------------------------------
-- Updated-at trigger for results
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger results_set_updated_at
  before update on public.results
  for each row execute function public.set_updated_at();
