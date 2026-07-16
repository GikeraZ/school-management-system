-- ============================================================================
-- Analytics views
-- ============================================================================

-- Per-student fee balance for each (term, academic_year) fee structure.
-- Used by the fees dashboard and the weekly fee-reminder automation.
create or replace view public.vw_fee_balances as
select
  s.id            as student_id,
  s.full_name     as student_name,
  s.admission_number,
  s.parent_name,
  s.parent_phone,
  s.grade_id,
  s.stream_id,
  fs.id           as fee_structure_id,
  fs.term,
  fs.academic_year,
  fs.amount       as expected,
  coalesce(sum(p.amount), 0) as paid,
  (fs.amount - coalesce(sum(p.amount), 0)) as balance
from public.students s
join public.fee_structures fs on fs.grade_id = s.grade_id
left join public.fee_payments p
  on p.student_id = s.id
  and p.term = fs.term
  and p.academic_year = fs.academic_year
where s.status = 'active'
group by s.id, s.full_name, s.admission_number, s.parent_name, s.parent_phone,
         s.grade_id, s.stream_id, fs.id, fs.term, fs.academic_year, fs.amount;

-- Convenience: students who currently owe money (balance > 0).
create or replace view public.vw_fee_outstanding as
select * from public.vw_fee_balances
where balance > 0;
