import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useGrades, useStreams, useSubjects, useExams } from "@/lib/hooks";
import { Button, Input, Label, Select, Card } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { EmptyState, Spinner } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { ClipboardList, Plus, Save, Send, CheckCircle } from "lucide-react";
import { computeGrade, gradeColor } from "@/lib/utils";
import { useStudents } from "@/lib/hooks";

interface Row {
  marks: string;
  remarks: string;
}

export default function ResultsEntry() {
  const qc = useQueryClient();
  const toast = useToast();
  const { isHeadTeacher } = useAuth();

  const grades = useGrades();
  const subjects = useSubjects();
  const exams = useExams();

  const [gradeId, setGradeId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [examId, setExamId] = useState("");

  useEffect(() => { setStreamId(""); }, [gradeId]);
  useEffect(() => { setExamId(""); setSubjectId(""); }, [streamId]);

  const streams = useStreams(gradeId);
  const students = useStudents(gradeId, streamId);

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
      const map: Record<string, any> = {};
      (data as any[]).forEach((r) => (map[r.student_id] = r));
      return map;
    },
  });

  const [rows, setRows] = useState<Record<string, Row>>({});
  const [published, setPublished] = useState(false);

  useEffect(() => {
    if (!existing) return;
    const init: Record<string, Row> = {};
    Object.values(existing).forEach((r: any) => {
      init[r.student_id] = { marks: String(r.marks), remarks: r.remarks ?? "" };
    });
    setRows(init);
    const anyPublished = Object.values(existing).some((r: any) => r.published);
    setPublished(anyPublished);
  }, [existing]);

  const [examModal, setExamModal] = useState(false);
  const [examForm, setExamForm] = useState({ name: "", term: "Term 1", exam_date: "", academic_year: String(new Date().getFullYear()) });

  const ready = gradeId && streamId && subjectId && examId;

  function setMark(studentId: string, value: string) {
    setRows((r) => ({ ...r, [studentId]: { marks: value, remarks: r[studentId]?.remarks ?? "" } }));
  }
  function setRem(studentId: string, value: string) {
    setRows((r) => ({ ...r, [studentId]: { marks: r[studentId]?.marks ?? "", remarks: value } }));
  }

  const saveMutation = useMutation({
    mutationFn: async (doPublish: boolean) => {
      const payload = students.data!.map((s: any) => {
        const m = rows[s.id]?.marks;
        const marks = m === "" || m == null ? 0 : Number(m);
        return {
          exam_id: examId,
          grade_id: gradeId,
          stream_id: streamId,
          subject_id: subjectId,
          student_id: s.id,
          marks,
          out_of: 100,
          grade_letter: computeGrade(marks, 100),
          remarks: rows[s.id]?.remarks ?? "",
          published: doPublish,
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
      toast(didPublish ? "Results saved & published" : "Draft saved", "success");
      setPublished(didPublish);
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
      toast("Exam created", "success");
    },
    onError: (e: any) => toast(e.message, "error"),
  });

  const avg = useMemo(() => {
    const vals = students.data?.map((s: any) => Number(rows[s.id]?.marks)).filter((v) => !isNaN(v) && v > 0) ?? [];
    if (!vals.length) return 0;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [rows, students.data]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Results Entry</h2>
        <p className="text-sm text-slate-500">Select grade → stream → subject → exam, then enter marks</p>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <Label>Grade</Label>
            <Select value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
              <option value="">Select grade</option>
              {grades.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Stream</Label>
            <Select value={streamId} onChange={(e) => setStreamId(e.target.value)} disabled={!gradeId}>
              <option value="">Select stream</option>
              {streams.data?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Subject</Label>
            <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!streamId}>
              <option value="">Select subject</option>
              {subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Exam</Label>
            <div className="flex gap-2">
              <Select value={examId} onChange={(e) => setExamId(e.target.value)} disabled={!streamId}>
                <option value="">Select exam</option>
                {exams.data?.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.term})</option>)}
              </Select>
              {isHeadTeacher && (
                <Button variant="outline" size="sm" onClick={() => setExamModal(true)} title="New exam"><Plus size={16} /></Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {!ready && (
        <EmptyState icon={<ClipboardList size={40} />} title="Choose a class & exam" description="Pick grade, stream, subject and exam to begin entering marks." />
      )}

      {ready && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div className="text-sm">
              <span className="font-semibold text-slate-700">{students.data?.length} students</span>
              {published && <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"><CheckCircle size={12} /> Published</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Class avg: <b>{avg}%</b></span>
              <Button variant="outline" onClick={() => saveMutation.mutate(false)} loading={saveMutation.isPending && !published}>
                <Save size={16} /> Save draft
              </Button>
              {isHeadTeacher && (
                <Button onClick={() => saveMutation.mutate(true)} loading={saveMutation.isPending && published}>
                  <Send size={16} /> {published ? "Re-publish" : "Save & Publish"}
                </Button>
              )}
            </div>
          </div>

          {loadingResults ? (
            <div className="flex justify-center py-10"><Spinner className="h-7 w-7" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Marks /100</th>
                    <th className="px-4 py-3">Grade</th>
                    <th className="px-4 py-3">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {students.data?.map((s: any, i: number) => {
                    const m = rows[s.id]?.marks;
                    const marks = m === "" || m == null ? null : Number(m);
                    return (
                      <tr key={s.id} className="border-b border-slate-50">
                        <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                        <td className="px-4 py-2 font-medium text-slate-700">{s.full_name}</td>
                        <td className="px-4 py-2">
                          <Input type="number" min={0} max={100} className="w-24" value={rows[s.id]?.marks ?? ""} onChange={(e) => setMark(s.id, e.target.value)} />
                        </td>
                        <td className="px-4 py-2">
                          {marks != null && (
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${gradeColor(computeGrade(marks, 100))}`}>
                              {computeGrade(marks, 100)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <Input value={rows[s.id]?.remarks ?? ""} onChange={(e) => setRem(s.id, e.target.value)} placeholder="Optional" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Modal open={examModal} onClose={() => setExamModal(false)} title="New exam" footer={
        <>
          <Button variant="outline" onClick={() => setExamModal(false)}>Cancel</Button>
          <Button loading={createExam.isPending} onClick={() => createExam.mutate()}>Create</Button>
        </>
      }>
        <div className="space-y-4">
          <div>
            <Label>Exam name</Label>
            <Input value={examForm.name} onChange={(e) => setExamForm({ ...examForm, name: e.target.value })} placeholder="End Term 1" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Term</Label>
              <Input value={examForm.term} onChange={(e) => setExamForm({ ...examForm, term: e.target.value })} placeholder="Term 1" />
            </div>
            <div>
              <Label>Exam date</Label>
              <Input type="date" value={examForm.exam_date} onChange={(e) => setExamForm({ ...examForm, exam_date: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Academic year</Label>
            <Input value={examForm.academic_year} onChange={(e) => setExamForm({ ...examForm, academic_year: e.target.value })} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
