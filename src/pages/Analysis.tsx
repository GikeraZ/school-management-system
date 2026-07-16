import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useGrades, useStreams, useSubjects, useExams } from "@/lib/hooks";
import { Button, Select, Label, Card } from "@/components/ui";
import { EmptyState, Spinner } from "@/components/EmptyState";
import { BarChart3, TrendingUp, Award } from "lucide-react";
import { computeGrade, gradeColor, formatDate } from "@/lib/utils";

type Tab = "subject" | "improved" | "merit";

interface ResultRow {
  student_id: string;
  marks: number;
  student: { full_name: string; admission_number: string };
  subject?: { name: string };
  remarks?: string | null;
}

function rank(list: ResultRow[]): (ResultRow & { position: number })[] {
  return [...list]
    .sort((a, b) => b.marks - a.marks)
    .map((r, i) => ({ ...r, position: i + 1 }));
}

export default function Analysis() {
  const [tab, setTab] = useState<Tab>("subject");
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Results Analysis</h2>
        <p className="text-sm text-slate-500">Performance analytics per stream and subject</p>
      </div>
      <div className="no-print flex gap-2">
        <TabBtn active={tab === "subject"} onClick={() => setTab("subject")} icon={<BarChart3 size={16} />} label="Subject Analysis" />
        <TabBtn active={tab === "improved"} onClick={() => setTab("improved")} icon={<TrendingUp size={16} />} label="Most Improved" />
        <TabBtn active={tab === "merit"} onClick={() => setTab("merit")} icon={<Award size={16} />} label="Merit List" />
      </div>
      {tab === "subject" && <SubjectAnalysis />}
      {tab === "improved" && <MostImproved />}
      {tab === "merit" && <MeritList />}
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-brand-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}
    >
      {icon} {label}
    </button>
  );
}

function ClassFilter({ gradeId, setGradeId, streamId, setStreamId, subjectId, setSubjectId, examId, setExamId, showSubject = true }:
  {
    gradeId: string; setGradeId: (v: string) => void;
    streamId: string; setStreamId: (v: string) => void;
    subjectId?: string; setSubjectId?: (v: string) => void;
    examId: string; setExamId: (v: string) => void;
    showSubject?: boolean;
  }) {
  const grades = useGrades();
  const streams = useStreams(gradeId);
  const subjects = useSubjects();
  const exams = useExams();
  return (
    <Card className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
      <div>
        <Label>Grade</Label>
        <Select value={gradeId} onChange={(e) => { setGradeId(e.target.value); setStreamId(""); }}>
          <option value="">Select</option>
          {grades.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
      </div>
      <div>
        <Label>Stream</Label>
        <Select value={streamId} onChange={(e) => setStreamId(e.target.value)} disabled={!gradeId}>
          <option value="">Select</option>
          {streams.data?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </div>
      {showSubject && setSubjectId && (
        <div>
          <Label>Subject</Label>
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!streamId}>
            <option value="">Select</option>
            {subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
      )}
      <div>
        <Label>Exam</Label>
        <Select value={examId} onChange={(e) => setExamId(e.target.value)} disabled={!streamId}>
          <option value="">Select</option>
          {exams.data?.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.term})</option>)}
        </Select>
      </div>
    </Card>
  );
}

function SubjectAnalysis() {
  const [gradeId, setGradeId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [examId, setExamId] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["analysis-subject", examId, streamId, subjectId],
    enabled: !!(examId && streamId && subjectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("student_id, marks, remarks, student:students(full_name, admission_number)")
        .eq("exam_id", examId)
        .eq("stream_id", streamId)
        .eq("subject_id", subjectId)
        .order("marks", { ascending: false });
      if (error) throw error;
      return data as unknown as ResultRow[];
    },
  });

  const ranked = data ? rank(data) : [];
  const avg = ranked.length ? Math.round(ranked.reduce((s, r) => s + r.marks, 0) / ranked.length) : 0;
  const max = ranked[0]?.marks ?? 0;
  const min = ranked.length ? ranked[ranked.length - 1].marks : 0;

  return (
    <div className="space-y-4">
      <ClassFilter gradeId={gradeId} setGradeId={setGradeId} streamId={streamId} setStreamId={setStreamId} subjectId={subjectId} setSubjectId={setSubjectId} examId={examId} setExamId={setExamId} />
      {!examId && <EmptyState icon={<BarChart3 size={40} />} title="Select a class & exam" description="View student ranking, class average, highest and lowest." />}
      {examId && isLoading && <div className="flex justify-center py-10"><Spinner className="h-7 w-7" /></div>}
      {examId && !isLoading && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Class Average" value={`${avg}%`} />
            <Stat label="Highest" value={`${max}%`} />
            <Stat label="Lowest" value={`${min}%`} />
          </div>
          <Card>
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-4 py-3">Pos</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Marks</th><th className="px-4 py-3">Grade</th><th className="px-4 py-3">Remarks</th></tr>
              </thead>
              <tbody>
                {ranked.map((r) => (
                  <tr key={r.student_id} className="border-b border-slate-50">
                    <td className="px-4 py-2 font-semibold">{r.position}</td>
                    <td className="px-4 py-2 font-medium text-slate-700">{r.student.full_name}</td>
                    <td className="px-4 py-2">{r.marks}</td>
                    <td className="px-4 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${gradeColor(computeGrade(r.marks, 100))}`}>{computeGrade(r.marks, 100)}</span></td>
                    <td className="px-4 py-2 text-slate-500">{r.remarks ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

function MostImproved() {
  const [gradeId, setGradeId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [currentExam, setCurrentExam] = useState("");
  const [prevExam, setPrevExam] = useState("");

  async function fetchResults(examId: string): Promise<Record<string, { marks: number; row: ResultRow }>> {
    const { data } = await supabase
      .from("results")
      .select("student_id, marks, student:students(full_name, admission_number)")
      .eq("exam_id", examId)
      .eq("stream_id", streamId)
      .eq("subject_id", subjectId);
    const map: Record<string, { marks: number; row: ResultRow }> = {};
    (data as unknown as ResultRow[]).forEach((r) => (map[r.student_id] = { marks: r.marks, row: r }));
    return map;
  }

  const { data, isLoading } = useQuery({
    queryKey: ["analysis-improved", currentExam, prevExam, streamId, subjectId],
    enabled: !!(currentExam && prevExam && streamId && subjectId),
    queryFn: async () => {
      const [cur, prev] = await Promise.all([fetchResults(currentExam), fetchResults(prevExam)]);
      const curRanked = rank(Object.values(cur).map((c) => c.row));
      const prevRanked = rank(Object.values(prev).map((c) => c.row));
      const prevPos: Record<string, number> = {};
      prevRanked.forEach((r) => (prevPos[r.student_id] = r.position));
      const rows = curRanked.map((r) => {
        const prevMarks = prev[r.student_id]?.marks ?? null;
        const delta = prevMarks == null ? null : r.marks - prevMarks;
        const rankChange = prevPos[r.student_id] != null ? prevPos[r.student_id] - r.position : null;
        return { ...r, prevMarks, delta, rankChange };
      }).sort((a, b) => (b.delta ?? -Infinity) - (a.delta ?? -Infinity));
      return rows;
    },
  });

  return (
    <div className="space-y-4">
      <ClassFilter gradeId={gradeId} setGradeId={setGradeId} streamId={streamId} setStreamId={setStreamId} subjectId={subjectId} setSubjectId={setSubjectId} examId={currentExam} setExamId={setCurrentExam} />
      <div className="no-print">
        <Label>Compare against (previous exam)</Label>
        <ExamSelect value={prevExam} onChange={setPrevExam} disabled={!streamId} />
      </div>
      {!currentExam && <EmptyState icon={<TrendingUp size={40} />} title="Select exams to compare" description="Compare a chosen exam vs the previous one for the same stream & subject." />}
      {currentExam && isLoading && <div className="flex justify-center py-10"><Spinner className="h-7 w-7" /></div>}
      {currentExam && !isLoading && (
        <Card>
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Previous</th><th className="px-4 py-3">Current</th><th className="px-4 py-3">Δ Marks</th><th className="px-4 py-3">Rank change</th></tr>
            </thead>
            <tbody>
              {data?.map((r) => (
                <tr key={r.student_id} className="border-b border-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-700">{r.student.full_name}</td>
                  <td className="px-4 py-2">{r.prevMarks ?? "—"}</td>
                  <td className="px-4 py-2">{r.marks}</td>
                  <td className={`px-4 py-2 font-semibold ${r.delta != null && r.delta >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {r.delta == null ? "—" : (r.delta > 0 ? `+${r.delta}` : r.delta)}
                  </td>
                  <td className="px-4 py-2">
                    {r.rankChange == null ? "—" : r.rankChange > 0 ? `↑ ${r.rankChange}` : r.rankChange < 0 ? `↓ ${Math.abs(r.rankChange)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function MeritList() {
  const [gradeId, setGradeId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [examId, setExamId] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["analysis-merit", examId, streamId],
    enabled: !!(examId && streamId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("student_id, marks, subject:subjects(name), student:students(full_name, admission_number)")
        .eq("exam_id", examId)
        .eq("stream_id", streamId);
      if (error) throw error;
      const byStudent: Record<string, { full_name: string; admission_number: string; total: number; count: number; subjects: Record<string, number> }> = {};
      (data as unknown as (ResultRow & { subject: { name: string } })[]).forEach((r) => {
        if (!byStudent[r.student_id]) {
          byStudent[r.student_id] = { full_name: r.student.full_name, admission_number: r.student.admission_number, total: 0, count: 0, subjects: {} };
        }
        byStudent[r.student_id].total += r.marks;
        byStudent[r.student_id].subjects[r.subject!.name] = r.marks;
      });
      const arr = Object.entries(byStudent).map(([id, v]) => ({
        student_id: id,
        full_name: v.full_name,
        admission_number: v.admission_number,
        total: v.total,
        count: Object.keys(v.subjects).length,
        average: v.count ? Math.round(v.total / v.count) : 0,
        subjects: v.subjects,
      }));
      arr.sort((a, b) => b.average - a.average);
      return arr.map((r, i) => ({ ...r, position: i + 1 }));
    },
  });

  const subjectNames = useQuery({
    queryKey: ["merit-subjects", examId, streamId],
    enabled: !!(examId && streamId),
    queryFn: async () => {
      const { data } = await supabase
        .from("results")
        .select("subject:subjects(name)")
        .eq("exam_id", examId)
        .eq("stream_id", streamId);
      const set = new Set<string>();
      (data as any[])?.forEach((r) => set.add(r.subject.name));
      return Array.from(set);
    },
  });

  return (
    <div className="space-y-4">
      <ClassFilter gradeId={gradeId} setGradeId={setGradeId} streamId={streamId} setStreamId={setStreamId} examId={examId} setExamId={setExamId} showSubject={false} />
      <div className="no-print flex gap-2">
        <Button variant="outline" onClick={() => window.print()}>Print merit list</Button>
      </div>
      {!examId && <EmptyState icon={<Award size={40} />} title="Select a stream & exam" description="Overall merit list aggregated across all subjects." />}
      {examId && isLoading && <div className="flex justify-center py-10"><Spinner className="h-7 w-7" /></div>}
      {examId && !isLoading && (
        <Card className="print-area">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Pos</th>
                <th className="px-4 py-3">Student</th>
                {subjectNames.data?.map((s) => <th key={s} className="px-4 py-3">{s}</th>)}
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Avg</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((r) => (
                <tr key={r.student_id} className="border-b border-slate-50">
                  <td className="px-4 py-2 font-semibold">{r.position}</td>
                  <td className="px-4 py-2 font-medium text-slate-700">{r.full_name}</td>
                  {subjectNames.data?.map((s) => <td key={s} className="px-4 py-2">{r.subjects[s] ?? "—"}</td>)}
                  <td className="px-4 py-2 font-semibold">{r.total}</td>
                  <td className="px-4 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${gradeColor(computeGrade(r.average, 100))}`}>{r.average}%</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function ExamSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const exams = useExams();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="max-w-xs">
      <option value="">Select previous exam</option>
      {exams.data?.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.term}) — {formatDate(e.exam_date)}</option>)}
    </Select>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </Card>
  );
}
