import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useGrades, useStreams } from "@/lib/hooks";
import { Button, Select, Label, Input, Card, Badge } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { Wallet, Plus, Search, Download, CheckCircle, AlertCircle } from "lucide-react";
import { formatCurrency, formatDate, exportToCsv } from "@/lib/utils";
import type { FeeBalance, FeeStructure, FeePayment } from "@/lib/types";

type Tab = "balances" | "structures" | "payments";

export default function Fees() {
  const [tab, setTab] = useState<Tab>("balances");
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Fees Management</h2>
        <p className="text-sm text-slate-500">Fee structures, payments and balances</p>
      </div>
      <div className="no-print flex gap-2">
        <TabBtn active={tab === "balances"} onClick={() => setTab("balances")} icon={<Wallet size={16} />} label="Balances" />
        <TabBtn active={tab === "structures"} onClick={() => setTab("structures")} icon={<Plus size={16} />} label="Structures" />
        <TabBtn active={tab === "payments"} onClick={() => setTab("payments")} icon={<Download size={16} />} label="Payments" />
      </div>
      {tab === "balances" && <Balances />}
      {tab === "structures" && <Structures />}
      {tab === "payments" && <Payments />}
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

function Balances() {
  const qc = useQueryClient();
  const toast = useToast();
  const grades = useGrades();
  const [gradeId, setGradeId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [search, setSearch] = useState("");
  const streams = useStreams(gradeId);

  const { data, isLoading } = useQuery({
    queryKey: ["fee-balances", gradeId, streamId],
    queryFn: async () => {
      let q = supabase.from("vw_fee_balances").select("*");
      if (gradeId) q = q.eq("grade_id", gradeId);
      if (streamId) q = q.eq("stream_id", streamId);
      const { data, error } = await q;
      if (error) throw error;
      return data as FeeBalance[];
    },
  });

  const filtered = data?.filter((b) => !search || b.student_name.toLowerCase().includes(search.toLowerCase()));
  const paid = filtered?.filter((b) => b.balance <= 0).length ?? 0;
  const outstanding = filtered?.filter((b) => b.balance > 0).length ?? 0;
  const totalOutstanding = filtered?.filter((b) => b.balance > 0).reduce((s, b) => s + b.balance, 0) ?? 0;

  const [payOpen, setPayOpen] = useState(false);
  const [row, setRow] = useState<FeeBalance | null>(null);
  const [payForm, setPayForm] = useState({ term: "", academic_year: "", amount: "", method: "cash", reference: "", payment_date: new Date().toISOString().slice(0, 10) });

  function openPay(b: FeeBalance) {
    setRow(b);
    setPayForm({ term: b.term, academic_year: b.academic_year, amount: "", method: "cash", reference: "", payment_date: new Date().toISOString().slice(0, 10) });
    setPayOpen(true);
  }

  const recordPay = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("fee_payments").insert({
        student_id: row!.student_id,
        term: payForm.term,
        academic_year: payForm.academic_year,
        amount: Number(payForm.amount),
        method: payForm.method,
        reference: payForm.reference || null,
        payment_date: payForm.payment_date,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fee-balances"] });
      qc.invalidateQueries({ queryKey: ["fee-payments"] });
      toast("Payment recorded", "success");
      setPayOpen(false);
    },
    onError: (e: any) => toast(e.message, "error"),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard label="Fully Paid" value={paid} icon={<CheckCircle size={16} />} tone="text-green-600" />
        <SummaryCard label="Outstanding" value={outstanding} icon={<AlertCircle size={16} />} tone="text-amber-600" />
        <SummaryCard label="Total Balance" value={formatCurrency(totalOutstanding)} tone="text-red-600" />
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <Input className="pl-9" placeholder="Search student…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={gradeId} onChange={(e) => { setGradeId(e.target.value); setStreamId(""); }} className="w-auto">
          <option value="">All grades</option>
          {grades.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
        <Select value={streamId} onChange={(e) => setStreamId(e.target.value)} className="w-auto">
          <option value="">All streams</option>
          {streams.data?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Button variant="outline" onClick={() => exportToCsv("fee-balances.csv", (filtered ?? []).map((b) => ({
          admission_number: b.admission_number,
          student_name: b.student_name,
          parent_name: b.parent_name,
          parent_phone: b.parent_phone,
          term: b.term,
          academic_year: b.academic_year,
          expected: b.expected,
          paid: b.paid,
          balance: b.balance,
        })))}><Download size={16} /> Export</Button>
      </div>

      {isLoading ? <div className="flex justify-center py-10"><Spinner className="h-7 w-7" /></div> : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Student</th><th className="px-4 py-3">Term</th>
                  <th className="px-4 py-3">Expected</th><th className="px-4 py-3">Paid</th>
                  <th className="px-4 py-3">Balance</th><th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered?.map((b) => (
                  <tr key={b.student_id + b.term} className="border-b border-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-700">{b.student_name}<div className="text-xs text-slate-400">{b.admission_number}</div></td>
                    <td className="px-4 py-2">{b.term} {b.academic_year}</td>
                    <td className="px-4 py-2">{formatCurrency(b.expected)}</td>
                    <td className="px-4 py-2">{formatCurrency(b.paid)}</td>
                    <td className="px-4 py-2 font-semibold">{formatCurrency(b.balance)}</td>
                    <td className="px-4 py-2">{b.balance <= 0 ? <Badge className="bg-green-100 text-green-700">Paid</Badge> : <Badge className="bg-amber-100 text-amber-700">Balance</Badge>}</td>
                    <td className="px-4 py-2 text-right"><Button size="sm" variant="outline" onClick={() => openPay(b)}>Record payment</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Record payment" footer={
        <>
          <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
          <Button loading={recordPay.isPending} onClick={() => recordPay.mutate()}>Save</Button>
        </>
      }>
        {row && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">{row.student_name} — balance {formatCurrency(row.balance)}</p>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Term</Label><Input value={payForm.term} onChange={(e) => setPayForm({ ...payForm, term: e.target.value })} /></div>
              <div><Label>Academic year</Label><Input value={payForm.academic_year} onChange={(e) => setPayForm({ ...payForm, academic_year: e.target.value })} /></div>
              <div><Label>Amount</Label><Input type="number" min={0} value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} /></div>
              <div><Label>Method</Label><Select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}><option>cash</option><option>mpesa</option><option>bank</option><option>cheque</option></Select></div>
            </div>
            <div><Label>Reference</Label><Input value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} placeholder="Optional" /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Structures() {
  const qc = useQueryClient();
  const toast = useToast();
  const grades = useGrades();
  const { data, isLoading } = useQuery({
    queryKey: ["fee-structures"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fee_structures").select("*, grade:grades(name)").order("academic_year", { ascending: false });
      if (error) throw error;
      return data as unknown as (FeeStructure & { grade: { name: string } })[];
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FeeStructure | null>(null);
  const [form, setForm] = useState({ grade_id: "", term: "Term 1", academic_year: String(new Date().getFullYear()), amount: "" });

  function openCreate() { setEditing(null); setForm({ grade_id: grades.data?.[0]?.id ?? "", term: "Term 1", academic_year: String(new Date().getFullYear()), amount: "" }); setOpen(true); }
  function openEdit(s: FeeStructure) { setEditing(s); setForm({ grade_id: s.grade_id, term: s.term, academic_year: s.academic_year, amount: String(s.amount) }); setOpen(true); }

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, amount: Number(form.amount) };
      if (editing) { const { error } = await supabase.from("fee_structures").update(payload).eq("id", editing.id); if (error) throw error; }
      else { const { error } = await supabase.from("fee_structures").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fee-structures"] }); qc.invalidateQueries({ queryKey: ["fee-balances"] }); toast("Saved", "success"); setOpen(false); },
    onError: (e: any) => toast(e.message, "error"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("fee_structures").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fee-structures"] }); qc.invalidateQueries({ queryKey: ["fee-balances"] }); toast("Deleted", "success"); },
    onError: (e: any) => toast(e.message, "error"),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={openCreate}><Plus size={16} /> Add structure</Button></div>
      {isLoading ? <div className="flex justify-center py-10"><Spinner className="h-7 w-7" /></div> : (
        <Card>
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-3">Grade</th><th className="px-4 py-3">Term</th><th className="px-4 py-3">Year</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody>
              {data?.map((s) => (
                <tr key={s.id} className="border-b border-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-700">{s.grade?.name}</td>
                  <td className="px-4 py-2">{s.term}</td>
                  <td className="px-4 py-2">{s.academic_year}</td>
                  <td className="px-4 py-2">{formatCurrency(s.amount)}</td>
                  <td className="px-4 py-2 text-right">
                    <button className="text-brand-600 hover:underline" onClick={() => openEdit(s)}>Edit</button>
                    <button className="ml-3 text-red-600 hover:underline" onClick={() => remove.mutate(s.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit structure" : "Add structure"} footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
        </>
      }>
        <div className="space-y-4">
          <div><Label>Grade</Label><Select value={form.grade_id} onChange={(e) => setForm({ ...form, grade_id: e.target.value })}>{grades.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Term</Label><Input value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} /></div>
            <div><Label>Academic year</Label><Input value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} /></div>
          </div>
          <div><Label>Amount (KES)</Label><Input type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
        </div>
      </Modal>
    </div>
  );
}

function Payments() {
  const { data, isLoading } = useQuery({
    queryKey: ["fee-payments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fee_payments").select("*, student:students(full_name, admission_number)").order("payment_date", { ascending: false }).limit(200);
      if (error) throw error;
      return data as unknown as (FeePayment & { student: { full_name: string; admission_number: string } })[];
    },
  });

  return (
    <Card>
      {isLoading ? <div className="flex justify-center py-10"><Spinner className="h-7 w-7" /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Term</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Reference</th></tr>
            </thead>
            <tbody>
              {data?.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No payments recorded</td></tr>}
              {data?.map((p) => (
                <tr key={p.id} className="border-b border-slate-50">
                  <td className="px-4 py-2">{formatDate(p.payment_date)}</td>
                  <td className="px-4 py-2 font-medium text-slate-700">{p.student.full_name}</td>
                  <td className="px-4 py-2">{p.term} {p.academic_year}</td>
                  <td className="px-4 py-2 font-semibold">{formatCurrency(p.amount)}</td>
                  <td className="px-4 py-2 capitalize">{p.method}</td>
                  <td className="px-4 py-2 text-slate-500">{p.reference ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function SummaryCard({ label, value, icon, tone }: { label: string; value: React.ReactNode; icon?: React.ReactNode; tone: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <span className={tone}>{icon}</span>
      </div>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </Card>
  );
}
