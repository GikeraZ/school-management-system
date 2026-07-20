import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useGrades, useStreams, useSubjects, useExams, useSchoolSettings, useGradingScales, useGradingBoundaries } from "@/lib/hooks";
import { Button, Input, Label, Select, Card, Stat } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { EmptyState, Spinner } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import {
  ClipboardList,
  Plus,
  Save,
  Send,
  CheckCircle,
  Search,
  Upload,
  Download,
  X,
  AlertTriangle,
  Trophy,
  TrendingDown,
  Users,
  BarChart3,
  FileSpreadsheet,
  Eraser,
  Hash,
} from "lucide-react";
import { computeGrade, computeGradeFromBoundaries, gradeToPoints, gradeColor, autoRemarks, computePositions } from "@/lib/utils";
import { useStudents } from "@/lib/hooks";
import * as XLSX from "xlsx";

interface Row {
  marks: string;
  remarks: string;
}

interface ExistingResult {
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
  entered_by: string | null;
}

export default function ResultsEntry() {
  const qc = useQueryClient();
  const toast = useToast();
  const { isHeadTeacher, user } = useAuth();

  const grades = useGrades();
  const subjects = useSubjects();
  const exams = useExams();
  const { data: settings } = useSchoolSettings();
  const { data: scales } = useGradingScales(settings?.school_type);
  // Find the default scale matching the school's grading method
  const activeScaleId = useMemo(() => {
    if (!scales?.length) return undefined;
    const match = scales.find((s) => s.grading_method === settings?.grading_method && s.is_default)
      ?? scales.find((s) => s.grading_method === settings?.grading_method)
      ?? scales[0];
    return match?.id;
  }, [scales, settings?.grading_method]);
  const { data: boundaries } = useGradingBoundaries(activeScaleId);

  const [academicYear, setAcademicYear] = useState("");
  const [term, setTerm] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [examId, setExamId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => { setStreamId(""); setSubjectId(""); }, [gradeId]);
  useEffect(() => { setExamId(""); }, [academicYear, term]);

  const streams = useStreams(gradeId);
  const students = useStudents(gradeId, streamId);

  const academicYears = useMemo(() => {
    if (!exams.data) return [];
    const years = new Set(exams.data.map((e) => e.academic_year));
    return Array.from(years).sort().reverse();
  }, [exams.data]);

  const terms = useMemo(() => {
    if (!exams.data) return [];
    let filtered = exams.data;
    if (academicYear) filtered = filtered.filter((e) => e.academic_year === academicYear);
    const t = new Set(filtered.map((e) => e.term));
    return Array.from(t).sort();
  }, [exams.data, academicYear]);

  const filteredExams = useMemo(() => {
    if (!exams.data) return [];
    let list = exams.data;
    if (academicYear) list = list.filter((e) => e.academic_year === academicYear);
    if (term) list = list.filter((e) => e.term === term);
    return list;
  }, [exams.data, academicYear, term]);

  const { data: existing, isLoading: loadingResults } = useQuery({
    queryKey: ["results-form", examId, subjectId, streamId],
    enabled: !!(examId && subjectId && streamId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("*")
        .eq("exam_id", examId)
        .eq("subject_id", subjectId)
        .eq("stream_id", streamId);
      if (error) throw error;
      const map: Record<string, ExistingResult> = {};
      (data as ExistingResult[]).forEach((r) => (map[r.student_id] = r));
      return map;
    },
  });

  const [rows, setRows] = useState<Record<string, Row>>({});
  const [published, setPublished] = useState(false);

  useEffect(() => {
    if (!existing) return;
    const init: Record<string, Row> = {};
    Object.values(existing).forEach((r) => {
      init[r.student_id] = {
        marks: String(r.marks ?? ""),
        remarks: r.remarks ?? "",
      };
    });
    setRows(init);
    const anyPublished = Object.values(existing).some((r) => r.published);
    setPublished(anyPublished);
  }, [existing]);

  const [examModal, setExamModal] = useState(false);
  const [examForm, setExamForm] = useState({
    name: "",
    term: "Term 1",
    exam_date: "",
    academic_year: String(new Date().getFullYear()),
  });
  const [importModal, setImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<Record<string, string>[]>([]);

  const marksInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const ready = !!(gradeId && streamId && subjectId && examId);
  const outOf = 100;

  const filteredStudents = useMemo(() => {
    if (!students.data) return [];
    if (!searchQuery.trim()) return students.data;
    const q = searchQuery.toLowerCase();
    return students.data.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        s.admission_number.toLowerCase().includes(q),
    );
  }, [students.data, searchQuery]);

  // Compute per-student marks, grade, points
  const computedRows = useMemo(() => {
    const result: Record<string, { marks: number | null; grade: string | null; points: number | null; remarks: string }> = {};
    for (const s of filteredStudents) {
      const m = rows[s.id]?.marks;
      const marks = m === "" || m == null ? null : Number(m);
      let grade: string | null = null;
      let pts: number | null = null;
      let remarks = rows[s.id]?.remarks ?? "";
      if (marks != null && !isNaN(marks)) {
        if (boundaries && boundaries.length > 0) {
          const computed = computeGradeFromBoundaries(marks, outOf, boundaries);
          grade = computed.grade_letter;
          pts = computed.points;
          if (!remarks) remarks = computed.remarks ?? "";
        } else {
          grade = computeGrade(marks, outOf);
          pts = gradeToPoints(grade);
          if (!remarks) remarks = autoRemarks(grade);
        }
      }
      result[s.id] = { marks, grade, points: pts, remarks };
    }
    return result;
  }, [filteredStudents, rows, boundaries]);

  // Compute positions across the full stream (not just filtered)
  const positions = useMemo(() => {
    const allIds = (students.data ?? []).map((s) => s.id);
    return computePositions(allIds, (id) => {
      const m = rows[id]?.marks;
      return m === "" || m == null ? 0 : Number(m);
    });
  }, [rows, students.data]);

  const stats = useMemo(() => {
    const allStudents = students.data ?? [];
    const vals: number[] = [];
    let entered = 0;
    let missing = 0;

    allStudents.forEach((s) => {
      const m = rows[s.id]?.marks;
      if (m !== "" && m != null && m !== undefined) {
        const num = Number(m);
        if (!isNaN(num)) {
          vals.push(num);
          entered++;
        } else {
          missing++;
        }
      } else {
        missing++;
      }
    });

    return {
      highest: vals.length ? Math.max(...vals) : 0,
      lowest: vals.length ? Math.min(...vals) : 0,
      average: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0,
      entered,
      missing,
      total: allStudents.length,
    };
  }, [rows, students.data]);

  function setMark(studentId: string, value: string) {
    if (value !== "" && !/^\d*\.?\d*$/.test(value)) return;
    const num = Number(value);
    if (value !== "" && (num < 0 || num > outOf)) {
      setValidationErrors((prev) => ({ ...prev, [studentId]: `Marks must be between 0 and ${outOf}` }));
    } else {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[studentId];
        return next;
      });
    }
    setRows((r) => ({
      ...r,
      [studentId]: {
        marks: value,
        remarks: r[studentId]?.remarks ?? "",
      },
    }));
  }

  function setRem(studentId: string, value: string) {
    setRows((r) => ({
      ...r,
      [studentId]: {
        marks: r[studentId]?.marks ?? "",
        remarks: value,
      },
    }));
  }

  function validateAll(): boolean {
    const errors: Record<string, string> = {};
    let hasError = false;
    students.data?.forEach((s) => {
      const m = rows[s.id]?.marks;
      if (m !== "" && m != null && m !== undefined) {
        const num = Number(m);
        if (isNaN(num) || num < 0 || num > outOf) {
          errors[s.id] = `Marks must be between 0 and ${outOf}`;
          hasError = true;
        }
      }
    });
    setValidationErrors(errors);
    return !hasError;
  }

  const saveMutation = useMutation({
    mutationFn: async (doPublish: boolean) => {
      if (!validateAll()) throw new Error("Please fix validation errors before saving");
      const payload = students.data!.map((s) => {
        const m = rows[s.id]?.marks;
        const marks = m === "" || m == null ? 0 : Number(m);
        let gradeLetter: string | null = null;
        let pts: number | null = null;
        let remarks = rows[s.id]?.remarks ?? "";
        if (boundaries && boundaries.length > 0) {
          const computed = computeGradeFromBoundaries(marks, outOf, boundaries);
          gradeLetter = computed.grade_letter;
          pts = computed.points;
          if (!remarks) remarks = computed.remarks ?? "";
        } else {
          gradeLetter = computeGrade(marks, outOf);
          pts = gradeToPoints(gradeLetter);
          if (!remarks) remarks = autoRemarks(gradeLetter);
        }
        return {
          exam_id: examId,
          grade_id: gradeId,
          stream_id: streamId,
          subject_id: subjectId,
          student_id: s.id,
          marks,
          out_of: outOf,
          grade_letter: gradeLetter,
          points: pts,
          remarks,
          published: doPublish,
          entered_by: user?.id ?? null,
        };
      });
      const { error } = await supabase
        .from("results")
        .upsert(payload, { onConflict: "exam_id,subject_id,student_id" });
      if (error) throw error;
      return doPublish;
    },
    onSuccess: (didPublish) => {
      qc.invalidateQueries({ queryKey: ["results-form", examId, subjectId, streamId] });
      qc.invalidateQueries({ queryKey: ["results"] });
      toast(didPublish ? "Results submitted & published" : "Draft saved successfully", "success");
      if (didPublish) setPublished(true);
    },
    onError: (e: any) => toast(e.message, "error"),
  });

  const createExam = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("exams").insert(examForm).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["exams"] });
      setExamId(data.id);
      setExamModal(false);
      setExamForm({ name: "", term: "Term 1", exam_date: "", academic_year: String(new Date().getFullYear()) });
      toast("Exam created", "success");
    },
    onError: (e: any) => toast(e.message, "error"),
  });

  function downloadTemplate() {
    const headers = ["Admission Number", "Student Name", `Marks (out of ${outOf})`];
    const sampleRows = students.data?.slice(0, 3).map((s) => [
      s.admission_number,
      s.full_name,
      "",
    ]) ?? [["ADM001", "John Doe", ""], ["ADM002", "Jane Smith", ""]];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Results Template");
    ws["!cols"] = [{ wch: 20 }, { wch: 25 }, { wch: 20 }];
    XLSX.writeFile(wb, "results-import-template.xlsx");
    toast("Template downloaded", "success");
  }

  function handleImportFile(file: File) {
    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

        const parsed = jsonData.map((row) => {
          const keys = Object.keys(row);
          const admKey = keys.find((k) => k.toLowerCase().includes("admission")) ?? keys[0];
          const marksKey = keys.find((k) => k.toLowerCase().includes("mark")) ?? keys[2] ?? keys[keys.length - 1];
          return {
            admission_number: String(row[admKey] ?? "").trim(),
            marks: String(row[marksKey] ?? "").trim(),
          };
        }).filter((r) => r.admission_number && r.marks !== "");

        setImportPreview(parsed);
      } catch {
        toast("Failed to parse file. Please check the format.", "error");
        setImportFile(null);
        setImportPreview([]);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function applyImport() {
    if (!students.data || !importPreview.length) return;
    const studentMap = new Map(students.data.map((s) => [s.admission_number, s]));
    let imported = 0;
    let skipped = 0;

    importPreview.forEach((row) => {
      const student = studentMap.get(row.admission_number);
      if (student) {
        const marks = Number(row.marks);
        if (!isNaN(marks) && marks >= 0 && marks <= outOf) {
          setRows((prev) => ({
            ...prev,
            [student.id]: {
              marks: String(marks),
              remarks: prev[student.id]?.remarks ?? "",
            },
          }));
          imported++;
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
    });

    toast(
      `Imported ${imported} result${imported !== 1 ? "s" : ""}${skipped > 0 ? `. ${skipped} row${skipped !== 1 ? "s" : ""} skipped` : ""}`,
      imported > 0 ? "success" : "error",
    );
    setImportModal(false);
    setImportFile(null);
    setImportPreview([]);
  }

  const clearAllMarks = useCallback(() => {
    setRows({});
    setValidationErrors({});
  }, []);

  const cancelAll = useCallback(() => {
    if (!existing) {
      setRows({});
    } else {
      const init: Record<string, Row> = {};
      Object.values(existing).forEach((r) => {
        init[r.student_id] = {
          marks: String(r.marks ?? ""),
          remarks: r.remarks ?? "",
        };
      });
      setRows(init);
    }
    setValidationErrors({});
    setSearchQuery("");
  }, [existing]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, studentId: string, field: "marks" | "remarks") => {
      if (e.key === "Tab" && !e.shiftKey) return;
      if (e.key === "Enter") {
        e.preventDefault();
        const ids = filteredStudents.map((s) => s.id);
        const idx = ids.indexOf(studentId);
        if (field === "marks") {
          const remarksEl = marksInputRefs.current[studentId + "_remarks"];
          if (remarksEl) remarksEl.focus();
          else if (idx < ids.length - 1) marksInputRefs.current[ids[idx + 1]]?.focus();
        } else if (idx < ids.length - 1) {
          marksInputRefs.current[ids[idx + 1]]?.focus();
        }
      }
    },
    [filteredStudents],
  );

  const selectedSubject = subjects.data?.find((s) => s.id === subjectId);
  const selectedExam = exams.data?.find((e) => e.id === examId);
  const selectedGrade = grades.data?.find((g) => g.id === gradeId);
  const selectedStream = streams.data?.find((s) => s.id === streamId);

  const hasNoGrades = !grades.isLoading && grades.data?.length === 0;
  const hasNoSubjects = !subjects.isLoading && subjects.data?.length === 0;
  const hasNoExams = !exams.isLoading && exams.data?.length === 0;
  const hasNoStreams = !streams.isLoading && streams.data?.length === 0 && !!gradeId;
  const hasNoStudents = !students.isLoading && students.data?.length === 0 && !!streamId;

  const gradingLabel = settings?.grading_method === "cbc" ? "CBC" : settings?.grading_method === "percentage" ? "Percentage" : "KCSE";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Results Entry</h2>
          <p className="text-sm text-slate-500">
            Enter and manage student examination results — {gradingLabel} grading
          </p>
        </div>
      </div>

      {/* Selector Panel */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <ClipboardList size={14} />
          Selection
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div>
            <Label>Academic Year</Label>
            <Select value={academicYear} onChange={(e) => setAcademicYear(e.target.value)}>
              <option value="">All Years</option>
              {academicYears.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </div>
          <div>
            <Label>Term</Label>
            <Select value={term} onChange={(e) => setTerm(e.target.value)}>
              <option value="">All Terms</option>
              {terms.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
          <div>
            <Label>Exam</Label>
            <div className="flex gap-1">
              <Select value={examId} onChange={(e) => setExamId(e.target.value)}>
                <option value="">Select exam</option>
                {filteredExams.map((ex) => (
                  <option key={ex.id} value={ex.id}>{ex.name} ({ex.term})</option>
                ))}
              </Select>
              {isHeadTeacher && (
                <Button variant="outline" size="sm" onClick={() => setExamModal(true)} title="New exam">
                  <Plus size={14} />
                </Button>
              )}
            </div>
          </div>
          <div>
            <Label>Class / Form</Label>
            <Select value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
              <option value="">Select class</option>
              {grades.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Stream</Label>
            <Select value={streamId} onChange={(e) => setStreamId(e.target.value)} disabled={!gradeId}>
              <option value="">{hasNoStreams ? "No streams available" : "Select stream"}</option>
              {streams.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Subject</Label>
            <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!streamId}>
              <option value="">{hasNoSubjects ? "No subjects available" : "Select subject"}</option>
              {subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
        </div>

        {ready && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-md bg-slate-100 px-2 py-1 font-medium">{selectedGrade?.name}</span>
            <span className="text-slate-300">/</span>
            <span className="rounded-md bg-slate-100 px-2 py-1 font-medium">{selectedStream?.name}</span>
            <span className="text-slate-300">|</span>
            <span className="rounded-md bg-blue-50 px-2 py-1 font-medium text-blue-700">{selectedSubject?.name}</span>
            <span className="text-slate-300">|</span>
            <span className="rounded-md bg-green-50 px-2 py-1 font-medium text-green-700">{selectedExam?.name}</span>
            <span className="text-slate-300">|</span>
            <span className="rounded-md bg-purple-50 px-2 py-1 font-medium text-purple-700">{selectedExam?.term} {selectedExam?.academic_year}</span>
          </div>
        )}
      </Card>

      {/* Empty / guidance states */}
      {!ready && (
        <EmptyState
          icon={<ClipboardList size={40} />}
          title="Choose selectors to begin"
          description={
            hasNoGrades
              ? "No classes found. Ask the Head Teacher to create classes under Management > Grades first."
              : hasNoExams
              ? "No exams found. Click the + button next to the Exam selector to create one."
              : hasNoSubjects
              ? "No subjects found. Ask the Head Teacher to create subjects under Management > Subjects."
              : hasNoStreams && gradeId
              ? "No streams found for this class. Ask the Head Teacher to add streams under Management > Streams."
              : hasNoStudents && streamId
              ? "No students found in this class/stream. Add students via the Students page."
              : "Select academic year, term, exam, class, stream and subject to enter marks."
          }
          action={
            hasNoGrades && isHeadTeacher ? (
              <Button onClick={() => window.location.href = "/grades"}>Create Classes</Button>
            ) : hasNoExams && isHeadTeacher ? (
              <Button onClick={() => setExamModal(true)}><Plus size={16} /> Create Exam</Button>
            ) : hasNoSubjects && isHeadTeacher ? (
              <Button onClick={() => window.location.href = "/subjects"}>Create Subjects</Button>
            ) : hasNoStreams && isHeadTeacher && gradeId ? (
              <Button onClick={() => window.location.href = "/streams"}>Add Streams</Button>
            ) : undefined
          }
        />
      )}

      {/* Results entry area */}
      {ready && (
        <>
          {/* Statistics */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Highest" value={stats.highest} icon={<Trophy size={18} />} hint="Top score" />
            <Stat label="Lowest" value={stats.lowest} icon={<TrendingDown size={18} />} hint="Bottom score" />
            <Stat label="Average" value={stats.average} icon={<BarChart3 size={18} />} hint="Class mean" />
            <Stat label="Entered" value={`${stats.entered}/${stats.total}`} icon={<Users size={18} />} hint={`${stats.total} students`} />
            <Stat label="Missing" value={stats.missing} icon={<AlertTriangle size={18} />} hint={stats.missing > 0 ? "Needs attention" : "All entered"} />
          </div>

          {/* Toolbar */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Search by name or admission #..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-56 pl-8 text-sm"
                  />
                </div>
                {searchQuery && (
                  <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")}>
                    <X size={14} /> Clear
                  </Button>
                )}
                <span className="text-xs text-slate-400">
                  {filteredStudents.length} of {students.data?.length ?? 0} students
                </span>
              </div>

              <div className="flex items-center gap-2">
                {published && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
                    <CheckCircle size={12} /> Published
                  </span>
                )}

                <Button variant="outline" size="sm" onClick={downloadTemplate} title="Download import template">
                  <Download size={14} /> Template
                </Button>

                <Button variant="outline" size="sm" onClick={() => setImportModal(true)} title="Import results from file">
                  <Upload size={14} /> Import
                </Button>

                <Button variant="outline" size="sm" onClick={clearAllMarks} title="Clear all entered marks">
                  <Eraser size={14} /> Clear
                </Button>

                <Button variant="outline" size="sm" onClick={cancelAll}>
                  <X size={14} /> Cancel
                </Button>

                <Button
                  variant="outline"
                  onClick={() => saveMutation.mutate(false)}
                  loading={saveMutation.isPending}
                >
                  <Save size={16} /> Save Draft
                </Button>

                {isHeadTeacher && (
                  <Button
                    onClick={() => saveMutation.mutate(true)}
                    loading={saveMutation.isPending}
                  >
                    <Send size={16} /> {published ? "Re-submit" : "Submit Results"}
                  </Button>
                )}

                {!isHeadTeacher && (
                  <Button
                    onClick={() => saveMutation.mutate(false)}
                    loading={saveMutation.isPending}
                  >
                    <Send size={16} /> Save
                  </Button>
                )}
              </div>
            </div>

            {/* Validation errors banner */}
            {Object.keys(validationErrors).length > 0 && (
              <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
                <AlertTriangle size={14} className="mr-1 inline" />
                {Object.keys(validationErrors).length} validation error(s) found. Please fix the highlighted fields below.
              </div>
            )}

            {/* Results table */}
            {loadingResults ? (
              <div className="flex justify-center py-10"><Spinner className="h-7 w-7" /></div>
            ) : filteredStudents.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">
                {searchQuery ? "No students match your search." : "No students found in this class/stream."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50/50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">#</th>
                      <th className="px-4 py-3 font-medium">Adm. No.</th>
                      <th className="px-4 py-3 font-medium">Student Name</th>
                      <th className="px-4 py-3 font-medium">Marks /{outOf}</th>
                      <th className="px-4 py-3 font-medium">Grade</th>
                      <th className="px-4 py-3 font-medium">Points</th>
                      <th className="px-4 py-3 font-medium">Position</th>
                      <th className="px-4 py-3 font-medium">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((s, i) => {
                      const computed = computedRows[s.id];
                      const marks = computed?.marks ?? null;
                      const grade = computed?.grade ?? null;
                      const pts = computed?.points ?? null;
                      const pos = positions[s.id];
                      const hasError = !!validationErrors[s.id];
                      const existingResult = existing?.[s.id];
                      const isRowPublished = existingResult?.published ?? false;

                      return (
                        <tr
                          key={s.id}
                          className={`border-b border-slate-50 transition-colors hover:bg-slate-50/50 ${
                            hasError ? "bg-red-50/50" : ""
                          } ${isRowPublished ? "bg-green-50/30" : ""}`}
                        >
                          <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                          <td className="px-4 py-2 font-mono text-xs text-slate-600">{s.admission_number}</td>
                          <td className="px-4 py-2 font-medium text-slate-700">{s.full_name}</td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-1">
                              <input
                                ref={(el) => { marksInputRefs.current[s.id] = el; }}
                                type="number"
                                min={0}
                                max={outOf}
                                step={1}
                                className={`input w-20 text-sm ${hasError ? "border-red-400 focus:border-red-500 focus:ring-red-200" : ""}`}
                                value={rows[s.id]?.marks ?? ""}
                                onChange={(e) => setMark(s.id, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, s.id, "marks")}
                                placeholder="—"
                              />
                              {hasError && (
                                <span className="text-xs text-red-500" title={validationErrors[s.id]}>!</span>
                              )}
                            </div>
                            {hasError && (
                              <p className="mt-0.5 text-xs text-red-500">{validationErrors[s.id]}</p>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            {grade && (
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${gradeColor(grade)}`}>
                                {grade}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            {pts != null && (
                              <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-700">
                                <Hash size={12} className="text-slate-400" />
                                {pts}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            {pos != null && marks != null && (
                              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                                pos === 1 ? "bg-yellow-100 text-yellow-800" :
                                pos <= 3 ? "bg-slate-100 text-slate-700" :
                                "text-slate-500"
                              }`}>
                                {pos}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <input
                              ref={(el) => { marksInputRefs.current[s.id + "_remarks"] = el; }}
                              type="text"
                              className="input w-36 text-sm"
                              value={rows[s.id]?.remarks ?? ""}
                              onChange={(e) => setRem(s.id, e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, s.id, "remarks")}
                              placeholder={grade ? autoRemarks(grade) : "Optional"}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Footer summary */}
            {ready && filteredStudents.length > 0 && (
              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 text-xs text-slate-500">
                <span>
                  {stats.entered} of {stats.total} results entered
                  {stats.average > 0 && <> | Class Average: <b className="text-slate-700">{stats.average}%</b></>}
                </span>
                <span>
                  {isHeadTeacher ? "Head Teacher" : "Teacher"} Access
                </span>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Import Modal */}
      <Modal
        open={importModal}
        onClose={() => { setImportModal(false); setImportFile(null); setImportPreview([]); }}
        title="Import Results from File"
        footer={
          <>
            <Button variant="outline" onClick={() => { setImportModal(false); setImportFile(null); setImportPreview([]); }}>
              Cancel
            </Button>
            {importPreview.length > 0 && (
              <Button onClick={applyImport}>
                <Upload size={16} /> Apply {importPreview.length} Results
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          <label className="block cursor-pointer rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/30">
            <FileSpreadsheet size={32} className="mx-auto mb-2 text-slate-400" />
            <p className="text-sm text-slate-600">
              {importFile ? importFile.name : "Click to choose an Excel or CSV file"}
            </p>
            <p className="mt-1 text-xs text-slate-400">Supports .xlsx, .xls, .csv</p>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }}
            />
          </label>

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={downloadTemplate}>
              <Download size={14} /> Download Template
            </Button>
          </div>

          {importPreview.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Preview ({importPreview.length} rows)</p>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-left uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Adm. No.</th>
                      <th className="px-3 py-2">Marks</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.map((row, i) => {
                      const student = students.data?.find((s) => s.admission_number === row.admission_number);
                      const marks = Number(row.marks);
                      const valid = student && !isNaN(marks) && marks >= 0 && marks <= outOf;
                      return (
                        <tr key={i} className={`border-t border-slate-100 ${valid ? "" : "bg-red-50"}`}>
                          <td className="px-3 py-1.5 font-mono">{row.admission_number}</td>
                          <td className="px-3 py-1.5">{row.marks}</td>
                          <td className="px-3 py-1.5">
                            {valid ? (
                              <span className="text-green-600">Matched: {student?.full_name}</span>
                            ) : (
                              <span className="text-red-600">{!student ? "Student not found" : "Invalid marks"}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Create Exam Modal */}
      <Modal
        open={examModal}
        onClose={() => setExamModal(false)}
        title="Create New Exam"
        footer={
          <>
            <Button variant="outline" onClick={() => setExamModal(false)}>Cancel</Button>
            <Button loading={createExam.isPending} onClick={() => createExam.mutate()}>Create Exam</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label>Exam Name</Label>
            <Input
              value={examForm.name}
              onChange={(e) => setExamForm({ ...examForm, name: e.target.value })}
              placeholder="e.g. CAT 1, Midterm, End Term"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Term</Label>
              <Select value={examForm.term} onChange={(e) => setExamForm({ ...examForm, term: e.target.value })}>
                <option value="Term 1">Term 1</option>
                <option value="Term 2">Term 2</option>
                <option value="Term 3">Term 3</option>
              </Select>
            </div>
            <div>
              <Label>Exam Date</Label>
              <Input type="date" value={examForm.exam_date} onChange={(e) => setExamForm({ ...examForm, exam_date: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Academic Year</Label>
            <Input
              value={examForm.academic_year}
              onChange={(e) => setExamForm({ ...examForm, academic_year: e.target.value })}
              placeholder="2026"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
