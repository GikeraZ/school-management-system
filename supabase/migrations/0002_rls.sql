-- ============================================================================
-- Role helpers, grading logic and Row Level Security
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Role helper functions (SECURITY DEFINER so they read user_roles reliably)
-- ---------------------------------------------------------------------------
create or replace function public.current_role()
returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.user_roles where user_id = auth.uid();
$$;

create or replace function public.is_head_teacher()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'head_teacher'
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Grading: convert marks to a Kenyan-style grade letter
-- ---------------------------------------------------------------------------
create or replace function public.compute_grade(marks numeric, out_of numeric)
returns text
language sql immutable as $$
  select case
    when out_of <= 0 or marks is null then null
    when (marks / out_of) * 100 >= 80 then 'A'
    when (marks / out_of) * 100 >= 75 then 'A-'
    when (marks / out_of) * 100 >= 70 then 'B+'
    when (marks / out_of) * 100 >= 65 then 'B'
    when (marks / out_of) * 100 >= 60 then 'B-'
    when (marks / out_of) * 100 >= 55 then 'C+'
    when (marks / out_of) * 100 >= 50 then 'C'
    when (marks / out_of) * 100 >= 45 then 'C-'
    when (marks / out_of) * 100 >= 40 then 'D+'
    when (marks / out_of) * 100 >= 35 then 'D'
    when (marks / out_of) * 100 >= 30 then 'D-'
    else 'E'
  end;
$$;

-- Trigger to keep grade_letter in sync with marks.
create or replace function public.sync_result_grade()
returns trigger language plpgsql as $$
begin
  new.grade_letter = public.compute_grade(new.marks, new.out_of);
  return new;
end;
$$;

create trigger results_sync_grade
  before insert or update of marks, out_of on public.results
  for each row execute function public.sync_result_grade();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.user_roles            enable row level security;
alter table public.teachers              enable row level security;
alter table public.grades                enable row level security;
alter table public.streams               enable row level security;
alter table public.subjects              enable row level security;
alter table public.students              enable row level security;
alter table public.exams                 enable row level security;
alter table public.results               enable row level security;
alter table public.fee_structures        enable row level security;
alter table public.fee_payments          enable row level security;
alter table public.fee_reminder_settings enable row level security;
alter table public.sms_logs              enable row level security;

-- user_roles: users read their own; head teachers read/manage all.
create policy user_roles_self_select on public.user_roles
  for select using (user_id = auth.uid() or public.is_head_teacher());
create policy user_roles_ht_write on public.user_roles
  for all using (public.is_head_teacher()) with check (public.is_head_teacher());

-- teachers: head teachers manage; staff read.
create policy teachers_select on public.teachers for select using (public.is_staff());
create policy teachers_ht_write on public.teachers
  for all using (public.is_head_teacher()) with check (public.is_head_teacher());

-- grades / streams / subjects: staff read; head teachers write.
create policy grades_select on public.grades for select using (public.is_staff());
create policy grades_ht_write on public.grades
  for all using (public.is_head_teacher()) with check (public.is_head_teacher());
create policy streams_select on public.streams for select using (public.is_staff());
create policy streams_ht_write on public.streams
  for all using (public.is_head_teacher()) with check (public.is_head_teacher());
create policy subjects_select on public.subjects for select using (public.is_staff());
create policy subjects_ht_write on public.subjects
  for all using (public.is_head_teacher()) with check (public.is_head_teacher());

-- students: staff read; head teachers write.
create policy students_select on public.students for select using (public.is_staff());
create policy students_ht_write on public.students
  for all using (public.is_head_teacher()) with check (public.is_head_teacher());

-- exams: staff read; head teachers write.
create policy exams_select on public.exams for select using (public.is_staff());
create policy exams_ht_write on public.exams
  for all using (public.is_head_teacher()) with check (public.is_head_teacher());

-- results: staff may read & edit draft results; only head teachers may publish.
create policy results_select on public.results for select using (public.is_staff());
create policy results_insert on public.results
  for insert with check (public.is_staff());
create policy results_update on public.results
  for update using (public.is_staff())
  with check ( (published = false) or public.is_head_teacher() );
create policy results_delete on public.results
  for delete using (public.is_head_teacher());

-- fees: staff read; head teachers write.
create policy fee_structures_select on public.fee_structures for select using (public.is_staff());
create policy fee_structures_ht_write on public.fee_structures
  for all using (public.is_head_teacher()) with check (public.is_head_teacher());
create policy fee_payments_select on public.fee_payments for select using (public.is_staff());
create policy fee_payments_ht_write on public.fee_payments
  for all using (public.is_head_teacher()) with check (public.is_head_teacher());
create policy fee_settings_select on public.fee_reminder_settings for select using (public.is_staff());
create policy fee_settings_ht_write on public.fee_reminder_settings
  for all using (public.is_head_teacher()) with check (public.is_head_teacher());

-- sms_logs: staff read; head teachers manage (edge functions use service role).
create policy sms_logs_select on public.sms_logs for select using (public.is_staff());
create policy sms_logs_ht_write on public.sms_logs
  for all using (public.is_head_teacher()) with check (public.is_head_teacher());
