import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useGrades, useStreams, useExams } from "@/lib/hooks";
import { Button, Select, Label, Card } from "@/components/ui";
import { EmptyState, Spinner } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { Award, Printer } from "lucide-react";
import { computeGrade, gradeColor, formatDate } from "@/lib/utils";

interface ReportCard {
  student_id: string;
  full_name: string;
  admission_number: string;
  parent_name: string;
  subjects: { name: string; marks: number; grade: string; remarks: string }[];
  total: number;
  count: number;
  average: number;
  position: number;
  outOf: number;
}

export default function MeritReports() {
  const toast = useToast();
  const [gradeId, setGradeId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [examId, setExamId] = useState("");

  const grades = useGrades();
  const streams = useStreams(gradeId);
  const exams = useExams();

  const { data: exam } = useQuery({
    queryKey: ["exam-detail", examId],
    enabled: !!examId,
    queryFn: async () => (await supabase.from("exams").select("*").eq("id", examId).single()).data,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["report-cards", examId, streamId],
    enabled: !!(examId && streamId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("student_id, marks, out_of, remarks, subject:subjects(name), student:students(full_name, admission_number, parent_name, parent_phone)")
        .eq("exam_id", examId)
        .eq("stream_id", streamId)
        .eq("published", true);
      if (error) throw error;
      const byStudent: Record<string, any> = {};
      (data as any[]).forEach((r) => {
        if (!byStudent[r.student_id]) {
          byStudent[r.student_id] = { ...r.student, subjects: [], total: 0, count: 0, outOf: 0 };
        }
        const b = byStudent[r.student_id];
        b.subjects.push({ name: r.subject.name, marks: r.marks, grade: computeGrade(r.marks, r.out_of), remarks: r.remarks ?? "" });
        b.total += r.marks;
        b.outOf += r.out_of;
        b.count += 1;
      });
      const arr: ReportCard[] = Object.values(byStudent).map((s: any) => ({
        student_id: s.student_id,
        full_name: s.full_name,
        admission_number: s.admission_number,
        parent_name: s.parent_name,
        subjects: s.subjects.sort((a: any, b: any) => a.name.localeCompare(b.name)),
        total: s.total,
        count: s.count,
        average: s.count ? Math.round(s.total / s.count) : 0,
        outOf: s.outOf,
        position: 0,
      }));
      arr.sort((a, b) => b.average - a.average);
      arr.forEach((r, i) => (r.position = i + 1));
      return arr;
    },
  });

  function print() {
    if (!data?.length) {
      toast("No published results to print", "error");
      return;
    }
    window.print();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Merit Reports</h2>
          <p className="text-sm text-slate-500">Printable report cards per student (published results only)</p>
        </div>
        <Button variant="outline" onClick={print} className="no-print"><Printer size={16} /> Print</Button>
      </div>

      <Card className="no-print grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
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
        <div>
          <Label>Exam</Label>
          <Select value={examId} onChange={(e) => setExamId(e.target.value)} disabled={!streamId}>
            <option value="">Select</option>
            {exams.data?.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.term})</option>)}
          </Select>
        </div>
      </Card>

      {!examId && <EmptyState icon={<Award size={40} />} title="Select a stream & exam" description="Generate printable report cards and a merit list." />}
      {examId && isLoading && <div className="flex justify-center py-10"><Spinner className="h-7 w-7" /></div>}

      {examId && !isLoading && (
        <div className="space-y-6">
          {data?.map((card) => (
            <Card key={card.student_id} className="print-area overflow-hidden">
              <div className="border-b border-slate-100 bg-brand-600 px-5 py-3 text-white">
                <h3 className="text-base font-semibold">School Management System</h3>
                <p className="text-xs opacity-90">{exam?.name} — {exam?.term} {exam?.academic_year}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 px-5 py-3 text-sm">
                <div><span className="text-slate-500">Student: </span><b>{card.full_name}</b></div>
                <div><span className="text-slate-500">Adm No: </span>{card.admission_number}</div>
                <div><span className="text-slate-500">Parent: </span>{card.parent_name}</div>
                <div><span className="text-slate-500">Position: </span><b>{card.position} of {data.length}</b></div>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr><th className="px-5 py-2">Subject</th><th className="px-5 py-2">Marks</th><th className="px-5 py-2">Grade</th><th className="px-5 py-2">Remarks</th></tr>
                </thead>
                <tbody>
                  {card.subjects.map((s) => (
                    <tr key={s.name} className="border-t border-slate-100">
                      <td className="px-5 py-2">{s.name}</td>
                      <td className="px-5 py-2">{s.marks}</td>
                      <td className="px-5 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${gradeColor(s.grade)}`}>{s.grade}</span></td>
                      <td className="px-5 py-2 text-slate-500">{s.remarks || "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-200 font-semibold">
                  <tr>
                    <td className="px-5 py-2">Total / Average</td>
                    <td className="px-5 py-2">{card.total}</td>
                    <td className="px-5 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${gradeColor(computeGrade(card.average, 100))}`}>{computeGrade(card.average, 100)}</span></td>
                    <td className="px-5 py-2">{card.average}%</td>
                  </tr>
                </tfoot>
              </table>
              <p className="px-5 py-3 text-xs text-slate-400">Generated on {formatDate(new Date().toISOString())}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
