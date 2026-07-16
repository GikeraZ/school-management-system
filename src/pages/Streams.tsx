import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Button, Input, Label, Select, Card } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { EmptyState, Spinner } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { GraduationCap, Plus } from "lucide-react";
import type { Stream } from "@/lib/types";

export default function Streams() {
  const qc = useQueryClient();
  const toast = useToast();
  const { isHeadTeacher } = useAuth();
  const { data: grades } = useQuery({
    queryKey: ["grades"],
    queryFn: async () => {
      const { data } = await supabase.from("grades").select("*").order("level");
      return data as any[];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["streams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("streams").select("*, grade:grades(name)").order("name");
      if (error) throw error;
      return data as unknown as (Stream & { grade: { name: string } })[];
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Stream | null>(null);
  const [name, setName] = useState("");
  const [gradeId, setGradeId] = useState("");

  function openCreate() {
    setEditing(null);
    setName("");
    setGradeId(grades?.[0]?.id ?? "");
    setOpen(true);
  }
  function openEdit(s: Stream) {
    setEditing(s);
    setName(s.name);
    setGradeId(s.grade_id);
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        const { error } = await supabase.from("streams").update({ name, grade_id: gradeId }).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("streams").insert({ name, grade_id: gradeId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["streams"] });
      toast(editing ? "Stream updated" : "Stream created", "success");
      setOpen(false);
    },
    onError: (e: any) => toast(e.message, "error"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("streams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["streams"] });
      toast("Stream deleted", "success");
    },
    onError: (e: any) => toast(e.message, "error"),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Streams</h2>
          <p className="text-sm text-slate-500">Streams within each grade (e.g. East, West)</p>
        </div>
        {isHeadTeacher && <Button onClick={openCreate}><Plus size={16} /> Add stream</Button>}
      </div>

      {data?.length === 0 ? (
        <EmptyState icon={<GraduationCap size={40} />} title="No streams yet" description="Add streams to organize students." action={isHeadTeacher && <Button onClick={openCreate}><Plus size={16} /> Add stream</Button>} />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Grade</th>
                <th className="px-4 py-3">Stream</th>
                {isHeadTeacher && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {data?.map((s) => (
                <tr key={s.id} className="border-b border-slate-50">
                  <td className="px-4 py-3">{s.grade?.name}</td>
                  <td className="px-4 py-3 font-medium text-slate-700">{s.name}</td>
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
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit stream" : "Add stream"} footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
        </>
      }>
        <div className="space-y-4">
          <div>
            <Label>Grade</Label>
            <Select value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
              {grades?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Stream name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="East" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
