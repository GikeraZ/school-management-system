import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useSchoolSettings } from "@/lib/hooks";
import { Stat, Card, CardHeader } from "@/components/ui";
import { Spinner } from "@/components/EmptyState";
import { Users, ClipboardList, Wallet, MessageSquare, GraduationCap, UserCog, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { isPrimarySchool, isSecondarySchool, schoolTypeLabel } from "@/lib/utils";

export default function Dashboard() {
  const { isHeadTeacher } = useAuth();
  const { data: settings } = useSchoolSettings();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [students, teachers, grades, subjects, exams, published, sms] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("teachers").select("id", { count: "exact", head: true }),
        supabase.from("grades").select("id", { count: "exact", head: true }),
        supabase.from("subjects").select("id", { count: "exact", head: true }),
        supabase.from("exams").select("id", { count: "exact", head: true }),
        supabase.from("results").select("id", { count: "exact", head: true }).eq("published", true),
        supabase.from("sms_logs").select("id", { count: "exact", head: true }),
      ]);
      const outResult = await supabase.from("vw_fee_outstanding").select("balance");
      const outRows = outResult.data ?? [];
      const totalOutstanding = outRows.reduce((s: number, r: any) => s + Number(r.balance), 0);

      // Compute mean score from published results
      const resultsData = (await supabase.from("results").select("marks, out_of").eq("published", true).limit(1000)).data ?? [];
      const avgScore = resultsData.length
        ? Math.round(resultsData.reduce((s: number, r: any) => s + (Number(r.marks) / Number(r.out_of)) * 100, 0) / resultsData.length)
        : 0;

      return {
        students: students.count ?? 0,
        teachers: teachers.count ?? 0,
        grades: grades.count ?? 0,
        subjects: subjects.count ?? 0,
        exams: exams.count ?? 0,
        published: published.count ?? 0,
        outstandingCount: outRows.length,
        totalOutstanding,
        sms: sms.count ?? 0,
        avgScore,
      };
    },
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;

  const schoolType = settings?.school_type ?? "primary";
  const primary = isPrimarySchool(schoolType);
  const secondary = isSecondarySchool(schoolType);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">
          {isHeadTeacher ? "Head Teacher Dashboard" : "Teacher Dashboard"}
        </h2>
        <p className="text-sm text-slate-500">
          {settings?.school_name ?? "School Management System"} — {schoolTypeLabel(schoolType)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {primary && <Stat label="Grades" value={data?.grades} icon={<GraduationCap size={16} />} hint="PP1 – Grade 8" />}
        {secondary && <Stat label="Forms" value={data?.grades} icon={<GraduationCap size={16} />} hint="Form 1 – Form 4" />}
        {!primary && !secondary && <Stat label="Classes" value={data?.grades} icon={<GraduationCap size={16} />} />}

        <Stat label="Learners" value={data?.students} icon={<Users size={16} />} hint="Active" />
        <Stat label="Teachers" value={data?.teachers} icon={<UserCog size={16} />} />
        <Stat label="Subjects" value={data?.subjects} icon={<BookOpen size={16} />} />

        {secondary && (
          <Stat
            label="Mean Score"
            value={`${data?.avgScore ?? 0}%`}
            icon={<ClipboardList size={16} />}
            hint="Average across all published results"
          />
        )}

        <Stat label="Published Results" value={data?.published} icon={<ClipboardList size={16} />} />
        <Stat label="Exams" value={data?.exams} icon={<GraduationCap size={16} />} />
        <Stat label="SMS Sent" value={data?.sms} icon={<MessageSquare size={16} />} />
        <Stat
          label="Outstanding Fees"
          value={data?.outstandingCount}
          hint={`KES ${Number(data?.totalOutstanding ?? 0).toLocaleString()}`}
          icon={<Wallet size={16} />}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Quick actions" />
          <div className="grid grid-cols-2 gap-2 p-4">
            <Link to="/results" className="rounded-lg border border-slate-200 p-3 text-sm font-medium text-slate-700 hover:bg-slate-50">Enter results</Link>
            <Link to="/analysis" className="rounded-lg border border-slate-200 p-3 text-sm font-medium text-slate-700 hover:bg-slate-50">View analysis</Link>
            <Link to="/merit" className="rounded-lg border border-slate-200 p-3 text-sm font-medium text-slate-700 hover:bg-slate-50">Merit reports</Link>
            {isHeadTeacher && <Link to="/sms" className="rounded-lg border border-slate-200 p-3 text-sm font-medium text-slate-700 hover:bg-slate-50">Send SMS</Link>}
            {isHeadTeacher && <Link to="/school-settings" className="rounded-lg border border-slate-200 p-3 text-sm font-medium text-slate-700 hover:bg-slate-50">School Settings</Link>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Need attention" />
          <div className="space-y-2 p-4 text-sm">
            <div className="flex justify-between rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
              <span>Students with fee balance</span>
              <span className="font-semibold">{data?.outstandingCount}</span>
            </div>
            <Link to="/fees" className="block rounded-lg bg-slate-50 px-3 py-2 text-slate-600 hover:bg-slate-100">
              Review fee balances →
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
