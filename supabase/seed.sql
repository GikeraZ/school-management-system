-- ============================================================================
-- Seed data: demo academic structure
-- ============================================================================
-- NOTE: The demo Head Teacher user must be created via the Supabase Dashboard
-- or Auth Admin API (not a raw SQL insert) because GoTrue requires specific
-- auth schema fields.
--
-- To create via the Dashboard:
--   1. Go to Authentication > Users > Add user
--   2. Email: head@school.ac.ke   Password: School@123
--   3. Check "Auto Confirm User"
--   4. Then run the user_roles UPDATE below to promote to head_teacher.
--
-- To create via CLI:
--   supabase projects api-keys --project-ref <ref>
--   curl -X POST https://<ref>.supabase.co/auth/v1/admin/users \
--     -H "apikey: <service_role_key>" \
--     -H "Authorization: Bearer <service_role_key>" \
--     -H "Content-Type: application/json" \
--     -d '{"email":"head@school.ac.ke","password":"School@123","email_confirm":true}'
-- ============================================================================

-- Promote head teacher (replace <USER_ID> with the auth.users id from above)
-- update public.user_roles set role = 'head_teacher' where user_id = '<USER_ID>';

-- ---------------------------------------------------------------------------
-- Academic structure
-- ---------------------------------------------------------------------------
insert into public.grades (id, name, level) values
  ('22222222-2222-2222-2222-222222222201', 'Grade 4', 4),
  ('22222222-2222-2222-2222-222222222202', 'Grade 5', 5),
  ('22222222-2222-2222-2222-222222222203', 'Grade 6', 6)
on conflict (level) do nothing;

insert into public.streams (id, grade_id, name) values
  ('33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222203', 'East'),
  ('33333333-3333-3333-3333-333333333302', '22222222-2222-2222-2222-222222222203', 'West')
on conflict (id) do nothing;

insert into public.subjects (id, name, code) values
  ('44444444-4444-4444-4444-444444444401', 'Mathematics', 'MATH'),
  ('44444444-4444-4444-4444-444444444402', 'English', 'ENG'),
  ('44444444-4444-4444-4444-444444444403', 'Science', 'SCI'),
  ('44444444-4444-4444-4444-444444444404', 'Kiswahili', 'KIS')
on conflict (code) do nothing;

-- Exam
insert into public.exams (id, name, term, academic_year, exam_date) values
  ('55555555-5555-5555-5555-555555555501', 'End Term 1', 'Term 1', '2026', '2026-03-20')
on conflict (id) do nothing;

-- Fee structure for Grade 6
insert into public.fee_structures (grade_id, term, academic_year, amount) values
  ('22222222-2222-2222-2222-222222222203', 'Term 1', '2026', 20000)
on conflict (grade_id, term, academic_year) do nothing;

-- Students (generated per stream with E.164 parent phones).
do $$
declare
  s record;
  first text[] := array['Amina','Brian','Cynthia','David','Esther','Farid','Grace','Hassan','Imani','Juma'];
  last  text[] := array['Otieno','Wanjiru','Kamau','Achieng','Mwangi','Njeri','Odhiambo','Wanjala','Cherono','Mutua'];
  i int;
  adm int := 6001;
begin
  for s in select id, grade_id from public.streams where grade_id = '22222222-2222-2222-2222-222222222203' loop
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
