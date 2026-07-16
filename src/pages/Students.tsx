import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Button, Input, Label, Select, Card } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { EmptyState, Spinner } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { Users, Plus, Search } from "lucide-react";
import { isValidE164 } from "@/lib/utils";
import type { Student } from "@/lib/types";

export default function Students() {
  const qc = useQueryClient();
  const toast = useToast();
  const { isHeadTeacher } = useAuth();

  const [gradeFilter, setGradeFilter] = useState("");
  const [streamFilter, setStreamFilter] = useState("");
  const [search, setSearch] = useState("");

  const { data: grades } = useQuery({
    queryKey: ["grades"],
    queryFn: async () => (await supabase.from("grades").select("*").order("level")).data as any[],
  });
  const { data: streams } = useQuery({
    queryKey: ["streams", gradeFilter],
    queryFn: async () => {
      let q = supabase.from("streams").select("*").order("name");
      if (gradeFilter) q = q.eq("grade_id", gradeFilter);
      return (await q).data as any[];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["students", gradeFilter, streamFilter, search],
    queryFn: async () => {
      let q = supabase.from("students").select("*, grade:grades(name), stream:streams(name)").order("full_name");
      if (gradeFilter) q = q.eq("grade_id", gradeFilter);
      if (streamFilter) q = q.eq("stream_id", streamFilter);
      if (search) q = q.ilike("full_name", `%${search}%`);
      return (await q).data as unknown as (Student & { grade: { name: string }; stream: { name: string } })[];
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState<any>({});

  function reset() {
    setForm({
      admission_number: "",
      full_name: "",
      gender: "male",
      grade_id: grades?.[0]?.id ?? "",
      stream_id: "",
      parent_name: "",
      parent_phone: "",
      status: "active",
      date_of_birth: "",
    });
  }
  function openCreate() {
    setEditing(null);
    reset();
    setOpen(true);
  }
  function openEdit(s: Student) {
    setEditing(s);
    setForm({ ...s });
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!isValidE164(form.parent_phone)) throw new Error("Parent phone must be in E.164 format, e.g. +254712345678");
      if (editing) {
        const { error } = await supabase.from("students").update(form).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("students").insert(form);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      toast(editing ? "Student updated" : "Student added", "success");
      setOpen(false);
    },
    onError: (e: any) => toast(e.message, "error"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("students").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      toast("Student deleted", "success");
    },
    onError: (e: any) => toast(e.message, "error"),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Students</h2>
          <p className="text-sm text-slate-500">Student records and parent contacts</p>
        </div>
        {isHeadTeacher && <Button onClick={openCreate}><Plus size={16} /> Add student</Button>}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <Input className="pl-9" placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={gradeFilter} onChange={(e) => { setGradeFilter(e.target.value); setStreamFilter(""); }} className="w-auto">
          <option value="">All grades</option>
          {grades?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
        <Select value={streamFilter} onChange={(e) => setStreamFilter(e.target.value)} className="w-auto">
          <option value="">All streams</option>
          {streams?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </div>

      {data?.length === 0 ? (
        <EmptyState icon={<Users size={40} />} title="No students found" description="Adjust filters or add a new student." action={isHeadTeacher && <Button onClick={openCreate}><Plus size={16} /> Add student</Button>} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Adm. No</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Grade</th>
                  <th className="px-4 py-3">Stream</th>
                  <th className="px-4 py-3">Parent</th>
                  <th className="px-4 py-3">Phone</th>
                  {isHeadTeacher && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {data?.map((s) => (
                  <tr key={s.id} className="border-b border-slate-50">
                    <td className="px-4 py-3 font-mono text-xs">{s.admission_number}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">{s.full_name}</td>
                    <td className="px-4 py-3">{s.grade?.name}</td>
                    <td className="px-4 py-3">{s.stream?.name}</td>
                    <td className="px-4 py-3">{s.parent_name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{s.parent_phone}</td>
                    {isHeadTeacher && (
                      <td className="px-4 py-3 text-right">
                        <button className="text-brand-600 hover:underline" onClick={() => openEdit(s)}>Edit</button>
                        <button className="ml-3 text-red-600 hover:underline" onClick={() => remove.mutate(s.id)}>Delete</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} size="lg" title={editing ? "Edit student" : "Add student"} footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
        </>
      }>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Admission number</Label>
            <Input value={form.admission_number ?? ""} onChange={(e) => setForm({ ...form, admission_number: e.target.value })} />
          </div>
          <div>
            <Label>Full name</Label>
            <Input value={form.full_name ?? ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <Label>Gender</Label>
            <Select value={form.gender ?? "male"} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </Select>
          </div>
          <div>
            <Label>Date of birth</Label>
            <Input type="date" value={form.date_of_birth ?? ""} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
          </div>
          <div>
            <Label>Grade</Label>
            <Select value={form.grade_id ?? ""} onChange={(e) => setForm({ ...form, grade_id: e.target.value, stream_id: "" })}>
              <option value="">Select grade</option>
              {grades?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Stream</Label>
            <Select value={form.stream_id ?? ""} onChange={(e) => setForm({ ...form, stream_id: e.target.value })}>
              <option value="">Select stream</option>
              {streams?.filter((s: any) => !form.grade_id || s.grade_id === form.grade_id).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Parent name</Label>
            <Input value={form.parent_name ?? ""} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} />
          </div>
          <div>
            <Label>Parent phone (E.164)</Label>
            <Input value={form.parent_phone ?? ""} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} placeholder="+254712345678" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
