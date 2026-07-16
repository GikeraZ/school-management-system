import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useGrades, useStreams, useSubjects, useExams } from "@/lib/hooks";
import { Button, Select, Label, Card, Textarea, Badge, Input } from "@/components/ui";
import { EmptyState, Spinner } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { callEdge } from "@/lib/api";
import { MessageSquare, Send, Megaphone, History, Layers, PenLine } from "lucide-react";
import { formatDate, computeGrade, isValidE164 } from "@/lib/utils";

type Tab = "aggregate" | "results" | "custom" | "announcement" | "logs";

export default function SMS() {
  const [tab, setTab] = useState<Tab>("aggregate");
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Parent SMS</h2>
        <p className="text-sm text-slate-500">Send result messages and announcements via Twilio</p>
      </div>
      <div className="no-print flex flex-wrap gap-2">
        <TabBtn active={tab === "aggregate"} onClick={() => setTab("aggregate")} icon={<Layers size={16} />} label="Aggregate Results" />
        <TabBtn active={tab === "results"} onClick={() => setTab("results")} icon={<MessageSquare size={16} />} label="Per-Subject Results" />
        <TabBtn active={tab === "custom"} onClick={() => setTab("custom")} icon={<PenLine size={16} />} label="Custom SMS" />
        <TabBtn active={tab === "announcement"} onClick={() => setTab("announcement")} icon={<Megaphone size={16} />} label="Announcement" />
        <TabBtn active={tab === "logs"} onClick={() => setTab("logs")} icon={<History size={16} />} label="SMS Logs" />
      </div>
      {tab === "aggregate" && <AggregateResults />}
      {tab === "results" && <ResultSms />}
      {tab === "custom" && <CustomSms />}
      {tab === "announcement" && <Announcement />}
      {tab === "logs" && <Logs />}
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-brand-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>
      {icon} {label}
    </button>
  );
}

/* ── Aggregate Results ─────────────────────────────────────────────────── */
function AggregateResults() {
  const qc = useQueryClient();
  const toast = useToast();
  const grades = useGrades();
  const exams = useExams();

  const [gradeId, setGradeId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [examId, setExamId] = useState("");
  const streams = useStreams(gradeId);

  const { data: students, isLoading } = useQuery({
    queryKey: ["sms-aggregate", examId, streamId],
    enabled: !!(examId && streamId),
    queryFn: async () => {
      const { data: exam } = await supabase.from("exams").select("name").eq("id", examId).single();
      const { data: results, error } = await supabase
        .from("results")
        .select("student_id, marks, out_of, published, grade_letter, subject:subjects(name), student:students(full_name, parent_name, parent_phone)")
        .eq("exam_id", examId)
        .eq("stream_id", streamId);
      if (error) throw error;

      const byStudent: Record<string, {
        student: { full_name: string; parent_name: string; parent_phone: string };
        subjects: { name: string; marks: number; out_of: number; grade_letter: string | null; published: boolean }[];
      }> = {};

      (results as any[]).forEach((r: any) => {
        const sid = r.student_id;
        if (!byStudent[sid]) {
          byStudent[sid] = { student: r.student, subjects: [] };
        }
        byStudent[sid].subjects.push({
          name: r.subject.name,
          marks: r.marks,
          out_of: r.out_of,
          grade_letter: r.grade_letter,
          published: r.published,
        });
      });

      return Object.entries(byStudent).map(([sid, v]) => {
        const pubSubs = v.subjects.filter((s) => s.published);
        const totalMarks = pubSubs.reduce((sum, s) => sum + s.marks, 0);
        const totalOutOf = pubSubs.reduce((sum, s) => sum + s.out_of, 0);
        const avg = pubSubs.length ? Math.round(totalMarks / pubSubs.length) : 0;
        const overallGrade = computeGrade(avg, 100);
        return {
          student_id: sid,
          student: v.student,
          subjects: pubSubs.sort((a, b) => a.name.localeCompare(b.name)),
          totalMarks,
          totalOutOf,
          avg,
          overallGrade,
          examName: exam?.name ?? "exam",
        };
      });
    },
  });

  const sendOne = useMutation({
    mutationFn: async (row: any) => {
      const subParts = row.subjects.map((s: any) => `${s.name} ${s.marks}/${s.out_of}(${s.grade_letter})`);
      const message =
        `Dear parent, ${row.student.full_name}'s ${row.examName} aggregate results:\n` +
        `${subParts.join(", ")}.\n` +
        `Total: ${row.totalMarks}, Average: ${row.avg}%, Grade: ${row.overallGrade}. Thank you.`;
      const { error } = await callEdge("send-sms", {
        to: row.student.parent_phone,
        message,
        student_id: row.student_id,
        type: "result",
      });
      if (error) throw new Error(error);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sms-logs"] }); toast("SMS sent", "success"); },
    onError: (e: any) => toast(e.message, "error"),
  });

  const sendBulk = useMutation({
    mutationFn: async () => {
      const { error, data } = await callEdge("send-bulk-sms", { mode: "results", exam_id: examId, stream_id: streamId });
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: (d: any) => { qc.invalidateQueries({ queryKey: ["sms-logs"] }); toast(`Sent ${d?.sent ?? 0}, failed ${d?.failed ?? 0}`, "success"); },
    onError: (e: any) => toast(e.message, "error"),
  });

  return (
    <div className="space-y-4">
      <Card className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
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

      {!examId && <EmptyState icon={<Layers size={40} />} title="Select class & exam" description="Send aggregate results across all subjects to parents." />}
      {examId && isLoading && <div className="flex justify-center py-10"><Spinner className="h-7 w-7" /></div>}
      {examId && !isLoading && (
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-sm text-slate-500">{students?.length} students</span>
            <Button onClick={() => sendBulk.mutate()} loading={sendBulk.isPending}><Send size={16} /> Bulk SMS all parents</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Subjects</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Average</th>
                  <th className="px-4 py-3">Grade</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {students?.map((r) => (
                  <tr key={r.student_id} className="border-b border-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-700">
                      {r.student.full_name}
                      <div className="text-xs text-slate-400">{r.student.parent_phone}</div>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600 max-w-xs truncate">
                      {r.subjects.map((s: any) => `${s.name} ${s.marks}/${s.out_of}`).join(", ")}
                    </td>
                    <td className="px-4 py-2 font-semibold">{r.totalMarks}</td>
                    <td className="px-4 py-2">{r.avg}%</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${r.overallGrade ? getGradeColor(r.overallGrade) : ""}`}>{r.overallGrade ?? "—"}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => sendOne.mutate(r)} loading={sendOne.isPending}>Send</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ── Per-Subject Results ───────────────────────────────────────────────── */
function ResultSms() {
  const qc = useQueryClient();
  const toast = useToast();
  const grades = useGrades();
  const subjects = useSubjects();
  const exams = useExams();

  const [gradeId, setGradeId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [examId, setExamId] = useState("");
  const streams = useStreams(gradeId);

  const { data: students, isLoading } = useQuery({
    queryKey: ["sms-results", examId, streamId, subjectId],
    enabled: !!(examId && streamId && subjectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("student_id, marks, out_of, published, student:students(full_name, parent_name, parent_phone)")
        .eq("exam_id", examId)
        .eq("stream_id", streamId)
        .eq("subject_id", subjectId);
      if (error) throw error;
      return data as unknown as ({ student_id: string; marks: number; out_of: number; published: boolean; student: { full_name: string; parent_name: string; parent_phone: string } })[];
    },
  });

  const exam = exams.data?.find((e) => e.id === examId);
  const subject = subjects.data?.find((s) => s.id === subjectId);

  const sendOne = useMutation({
    mutationFn: async (row: any) => {
      const message =
        `Dear parent, ${row.student.full_name}'s ${subject?.name} result for ${exam?.name} ` +
        `is ${row.marks}/${row.out_of} (Grade ${computeGrade(row.marks, row.out_of)}). Thank you.`;
      const { error } = await callEdge("send-sms", {
        to: row.student.parent_phone,
        message,
        student_id: row.student_id,
        type: "result",
      });
      if (error) throw new Error(error);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sms-logs"] }); toast("SMS sent", "success"); },
    onError: (e: any) => toast(e.message, "error"),
  });

  return (
    <div className="space-y-4">
      <Card className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
        <div><Label>Grade</Label><Select value={gradeId} onChange={(e) => { setGradeId(e.target.value); setStreamId(""); }}><option value="">Select</option>{grades.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></div>
        <div><Label>Stream</Label><Select value={streamId} onChange={(e) => setStreamId(e.target.value)} disabled={!gradeId}><option value="">Select</option>{streams.data?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
        <div><Label>Subject</Label><Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!streamId}><option value="">Select</option>{subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
        <div><Label>Exam</Label><Select value={examId} onChange={(e) => setExamId(e.target.value)} disabled={!streamId}><option value="">Select</option>{exams.data?.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.term})</option>)}</Select></div>
      </Card>

      {!examId && <EmptyState icon={<MessageSquare size={40} />} title="Select class & exam" description="Send individual subject result SMS to parents." />}
      {examId && isLoading && <div className="flex justify-center py-10"><Spinner className="h-7 w-7" /></div>}
      {examId && !isLoading && (
        <Card>
          <div className="border-b border-slate-100 px-4 py-3">
            <span className="text-sm text-slate-500">{students?.length} students</span>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Parent phone</th><th className="px-4 py-3">Marks</th><th className="px-4 py-3">Published</th><th className="px-4 py-3 text-right">Action</th></tr>
            </thead>
            <tbody>
              {students?.map((r) => (
                <tr key={r.student_id} className="border-b border-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-700">{r.student.full_name}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.student.parent_phone}</td>
                  <td className="px-4 py-2">{r.marks}/{r.out_of}</td>
                  <td className="px-4 py-2">{r.published ? <Badge className="bg-green-100 text-green-700">Yes</Badge> : <Badge className="bg-slate-100 text-slate-500">No</Badge>}</td>
                  <td className="px-4 py-2 text-right"><Button size="sm" variant="outline" onClick={() => sendOne.mutate(r)} loading={sendOne.isPending}>Send</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

/* ── Custom SMS ────────────────────────────────────────────────────────── */
function CustomSms() {
  const qc = useQueryClient();
  const toast = useToast();
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  const send = useMutation({
    mutationFn: async () => {
      if (!isValidE164(phone)) throw new Error("Phone must be in E.164 format, e.g. +254712345678");
      if (!message.trim()) throw new Error("Message cannot be empty");
      const { error } = await callEdge("send-sms", { to: phone.trim(), message: message.trim(), type: "announcement" });
      if (error) throw new Error(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sms-logs"] });
      toast("SMS sent", "success");
      setMessage("");
    },
    onError: (e: any) => toast(e.message, "error"),
  });

  return (
    <Card className="max-w-2xl space-y-4 p-4">
      <div>
        <Label>Recipient phone (E.164)</Label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254712345678" />
        <p className="mt-1 text-xs text-slate-400">Enter the parent's phone number directly</p>
      </div>
      <div>
        <Label>Message</Label>
        <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type your message here..." />
        <p className="mt-1 text-xs text-slate-400">{message.length}/1600 characters</p>
      </div>
      <Button onClick={() => send.mutate()} loading={send.isPending}><Send size={16} /> Send SMS</Button>
    </Card>
  );
}

/* ── Announcement ──────────────────────────────────────────────────────── */
function Announcement() {
  const qc = useQueryClient();
  const toast = useToast();
  const grades = useGrades();
  const [gradeId, setGradeId] = useState("");
  const streams = useStreams(gradeId);
  const [scope, setScope] = useState<"grade" | "stream">("stream");
  const [streamId, setStreamId] = useState("");
  const [message, setMessage] = useState("");

  const send = useMutation({
    mutationFn: async () => {
      if (!message.trim()) throw new Error("Message cannot be empty");
      const payload: any = { mode: "announcement", message };
      if (scope === "grade") {
        if (!gradeId) throw new Error("Select a grade");
        payload.grade_ids = [gradeId];
      } else {
        if (!streamId) throw new Error("Select a stream");
        payload.stream_ids = [streamId];
      }
      const { error, data } = await callEdge("send-bulk-sms", payload);
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: (d: any) => { qc.invalidateQueries({ queryKey: ["sms-logs"] }); toast(`Sent ${d?.sent ?? 0}, failed ${d?.failed ?? 0}`, "success"); setMessage(""); },
    onError: (e: any) => toast(e.message, "error"),
  });

  return (
    <Card className="max-w-2xl space-y-4 p-4">
      <div>
        <Label>Target</Label>
        <div className="flex gap-2">
          <button onClick={() => setScope("grade")} className={`rounded-lg px-3 py-2 text-sm ${scope === "grade" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"}`}>Whole grade</button>
          <button onClick={() => setScope("stream")} className={`rounded-lg px-3 py-2 text-sm ${scope === "stream" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"}`}>Specific stream</button>
        </div>
      </div>
      {scope === "grade" ? (
        <div><Label>Grade</Label><Select value={gradeId} onChange={(e) => setGradeId(e.target.value)}><option value="">Select grade</option>{grades.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Grade</Label><Select value={gradeId} onChange={(e) => { setGradeId(e.target.value); setStreamId(""); }}><option value="">Select grade</option>{grades.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></div>
          <div><Label>Stream</Label><Select value={streamId} onChange={(e) => setStreamId(e.target.value)} disabled={!gradeId}><option value="">Select stream</option>{streams.data?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
        </div>
      )}
      <div>
        <Label>Message</Label>
        <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. School closes early on Friday for staff meeting." />
        <p className="mt-1 text-xs text-slate-400">{message.length}/1600 characters</p>
      </div>
      <Button onClick={() => send.mutate()} loading={send.isPending}><Send size={16} /> Send announcement</Button>
    </Card>
  );
}

/* ── SMS Logs ──────────────────────────────────────────────────────────── */
function Logs() {
  const { data, isLoading } = useQuery({
    queryKey: ["sms-logs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sms_logs").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });

  const colors: Record<string, string> = {
    sent: "bg-green-100 text-green-700",
    delivered: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
    queued: "bg-slate-100 text-slate-500",
    undelivered: "bg-orange-100 text-orange-700",
  };

  return (
    <Card>
      {isLoading ? <div className="flex justify-center py-10"><Spinner className="h-7 w-7" /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Recipient</th><th className="px-4 py-3">Message</th><th className="px-4 py-3">Status</th></tr>
            </thead>
            <tbody>
              {data?.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No SMS logs yet</td></tr>}
              {data?.map((l: any) => (
                <tr key={l.id} className="border-b border-slate-50">
                  <td className="px-4 py-2 whitespace-nowrap text-slate-500">{formatDate(l.created_at)}</td>
                  <td className="px-4 py-2 capitalize">{l.type.replace("_", " ")}</td>
                  <td className="px-4 py-2 font-mono text-xs">{l.recipient_phone}</td>
                  <td className="px-4 py-2 max-w-xs truncate" title={l.message}>{l.message}</td>
                  <td className="px-4 py-2"><Badge className={colors[l.status] ?? "bg-slate-100 text-slate-500"}>{l.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ── Helpers ───────────────────────────────────────────────────────────── */
function getGradeColor(grade: string): string {
  if (grade.startsWith("A")) return "bg-green-100 text-green-700";
  if (grade.startsWith("B")) return "bg-blue-100 text-blue-700";
  if (grade.startsWith("C")) return "bg-yellow-100 text-yellow-800";
  if (grade.startsWith("D")) return "bg-orange-100 text-orange-700";
  return "bg-red-100 text-red-700";
}
