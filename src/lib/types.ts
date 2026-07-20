export type UserRole = "teacher" | "head_teacher";

export interface UserRoleRow {
  id: string;
  user_id: string;
  role: UserRole;
  full_name: string;
  email: string | null;
  created_at: string;
}

export interface Teacher {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  user_id: string | null;
  created_at: string;
}

export interface Grade {
  id: string;
  name: string;
  level: number;
  created_at: string;
}

export interface Stream {
  id: string;
  grade_id: string;
  name: string;
  created_at: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string | null;
  created_at: string;
}

export interface Student {
  id: string;
  admission_number: string;
  full_name: string;
  gender: "male" | "female" | "other" | null;
  grade_id: string;
  stream_id: string;
  parent_name: string;
  parent_phone: string;
  status: "active" | "inactive" | "transferred" | "completed";
  date_of_birth: string | null;
  created_at: string;
}

export interface Exam {
  id: string;
  name: string;
  term: string;
  academic_year: string;
  exam_date: string;
  created_at: string;
}

export interface Result {
  id: string;
  exam_id: string;
  grade_id: string;
  stream_id: string;
  subject_id: string;
  student_id: string;
  marks: number;
  out_of: number;
  grade_letter: string | null;
  remarks: string | null;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface FeeStructure {
  id: string;
  grade_id: string;
  term: string;
  academic_year: string;
  amount: number;
  created_at: string;
}

export interface FeePayment {
  id: string;
  student_id: string;
  term: string;
  academic_year: string;
  amount: number;
  payment_date: string;
  method: string | null;
  reference: string | null;
  created_at: string;
}

export interface FeeReminderSettings {
  id: string;
  enabled: boolean;
  frequency_days: number;
  last_run: string | null;
  next_run: string | null;
  updated_at: string;
}

export type SmsType = "result" | "bulk_result" | "announcement" | "fee_reminder";
export type SmsStatus = "queued" | "sent" | "failed" | "delivered" | "undelivered";

export interface SmsLog {
  id: string;
  recipient_phone: string;
  recipient_name: string | null;
  student_id: string | null;
  type: SmsType;
  message: string;
  status: SmsStatus;
  provider_message_id: string | null;
  error: string | null;
  sent_by: string | null;
  created_at: string;
}

export interface FeeBalance {
  student_id: string;
  student_name: string;
  admission_number: string;
  parent_name: string;
  parent_phone: string;
  grade_id: string;
  stream_id: string;
  fee_structure_id: string;
  term: string;
  academic_year: string;
  expected: number;
  paid: number;
  balance: number;
}

// ---------------------------------------------------------------------------
// School type support
// ---------------------------------------------------------------------------
export type SchoolType = "primary" | "secondary" | "mixed";
export type GradingMethod = "cbc" | "kcse" | "percentage";

export interface SchoolSettings {
  id: string;
  school_name: string;
  school_type: SchoolType;
  grading_method: GradingMethod;
  motto: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  academic_year: string;
  created_at: string;
  updated_at: string;
}

export interface GradingScale {
  id: string;
  name: string;
  school_type: SchoolType;
  grading_method: GradingMethod;
  is_default: boolean;
  created_at: string;
}

export interface GradingBoundary {
  id: string;
  scale_id: string;
  grade_letter: string;
  min_percentage: number;
  max_percentage: number;
  points: number | null;
  remarks: string | null;
  sort_order: number;
}

export interface TeacherAssignment {
  id: string;
  teacher_id: string;
  subject_id: string;
  grade_id: string;
  stream_id: string | null;
  academic_year: string;
  created_at: string;
}

export interface ClassTeacher {
  id: string;
  teacher_id: string;
  grade_id: string;
  stream_id: string | null;
  academic_year: string;
  created_at: string;
}

export interface TimetableSlot {
  id: string;
  grade_id: string;
  stream_id: string | null;
  subject_id: string;
  teacher_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  academic_year: string;
  created_at: string;
}

export interface StudentPromotion {
  id: string;
  student_id: string;
  from_grade_id: string;
  from_stream_id: string | null;
  to_grade_id: string;
  to_stream_id: string | null;
  academic_year: string;
  promoted_by: string | null;
  created_at: string;
}

// Result with extra fields for position/points
export interface ResultWithExtras extends Result {
  points: number | null;
  position: number | null;
  class_position: number | null;
  stream_position: number | null;
}
