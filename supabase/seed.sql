-- ============================================================================
-- Seed data: demo academic structure
-- ============================================================================
-- Run this in the Supabase SQL Editor to populate demo data.
-- All inserts use ON CONFLICT so they are safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Academic structure: Grades
-- ---------------------------------------------------------------------------
insert into public.grades (name, level) values
  ('Grade 1', 1),
  ('Grade 2', 2),
  ('Grade 3', 3),
  ('Grade 4', 4),
  ('Grade 5', 5),
  ('Grade 6', 6),
  ('Grade 7', 7),
  ('Grade 8', 8)
on conflict (level) do nothing;

-- ---------------------------------------------------------------------------
-- Streams for every grade (North & South)
-- ---------------------------------------------------------------------------
insert into public.streams (grade_id, name)
select id, 'North' from public.grades
on conflict (grade_id, name) do nothing;

insert into public.streams (grade_id, name)
select id, 'South' from public.grades
on conflict (grade_id, name) do nothing;

-- ---------------------------------------------------------------------------
-- Subjects
-- ---------------------------------------------------------------------------
insert into public.subjects (name, code) values
  ('Mathematics', 'MATH'),
  ('English', 'ENG'),
  ('Science', 'SCI'),
  ('Kiswahili', 'KIS'),
  ('Social Studies', 'SST'),
  ('Religious Education', 'RE'),
  ('Creative Arts', 'ART'),
  ('Physical Education', 'PE')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Exams (2026 academic year)
-- ---------------------------------------------------------------------------
insert into public.exams (name, term, academic_year, exam_date) values
  ('CAT 1', 'Term 1', '2026', '2026-02-14'),
  ('Midterm', 'Term 1', '2026', '2026-03-07'),
  ('End Term 1', 'Term 1', '2026', '2026-04-03'),
  ('CAT 1', 'Term 2', '2026', '2026-05-22'),
  ('Midterm', 'Term 2', '2026', '2026-06-19'),
  ('End Term 2', 'Term 2', '2026', '2026-07-31'),
  ('CAT 1', 'Term 3', '2026', '2026-09-11'),
  ('Midterm', 'Term 3', '2026', '2026-10-09'),
  ('End Term 3', 'Term 3', '2026', '2026-11-27')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Fee structures
-- ---------------------------------------------------------------------------
insert into public.fee_structures (grade_id, term, academic_year, amount)
select id, 'Term 1', '2026', 15000 from public.grades where level = 6
on conflict (grade_id, term, academic_year) do nothing;

insert into public.fee_structures (grade_id, term, academic_year, amount)
select id, 'Term 2', '2026', 15000 from public.grades where level = 6
on conflict (grade_id, term, academic_year) do nothing;

insert into public.fee_structures (grade_id, term, academic_year, amount)
select id, 'Term 3', '2026', 15000 from public.grades where level = 6
on conflict (grade_id, term, academic_year) do nothing;

-- ---------------------------------------------------------------------------
-- Students (10 per stream for Grade 6, North & South)
-- ---------------------------------------------------------------------------
do $$
declare
  s record;
  first text[] := array['Amina','Brian','Cynthia','David','Esther','Farid','Grace','Hassan','Imani','Juma'];
  last  text[] := array['Otieno','Wanjiru','Kamau','Achieng','Mwangi','Njeri','Odhiambo','Wanjala','Cherono','Mutua'];
  i int;
  adm int := 6001;
begin
  for s in
    select id, grade_id
    from public.streams
    where grade_id = (select id from public.grades where level = 6)
  loop
    for i in 1..10 loop
      insert into public.students (
        admission_number, full_name, gender, grade_id, stream_id,
        parent_name, parent_phone, status
      ) values (
        'G6/' || adm,
        first[i] || ' ' || last[i],
        (case when i % 2 = 0 then 'female' else 'male' end)::public.gender,
        s.grade_id, s.id,
        'Parent of ' || first[i],
        '+2547' || lpad((600000 + adm)::text, 7, '0'),
        'active'::public.student_status
      ) on conflict (admission_number) do nothing;
      adm := adm + 1;
    end loop;
  end loop;
end $$;
