import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Button, Input, Label, Card } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { EmptyState, Spinner } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { BookOpen, Plus } from "lucide-react";
import type { Subject } from "@/lib/types";

export default function Subjects() {
  const qc = useQueryClient();
  const toast = useToast();
  const { isHeadTeacher } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("*").order("name");
      if (error) throw error;
      return data as Subject[];
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  function openCreate() {
    setEditing(null);
    setName("");
    setCode("");
    setOpen(true);
  }
  function openEdit(s: Subject) {
    setEditing(s);
    setName(s.name);
    setCode(s.code ?? "");
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        const { error } = await supabase.from("subjects").update({ name, code }).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("subjects").insert({ name, code: code || null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subjects"] });
      toast(editing ? "Subject updated" : "Subject created", "success");
      setOpen(false);
    },
    onError: (e: any) => toast(e.message, "error"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subjects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subjects"] });
      toast("Subject deleted", "success");
    },
    onError: (e: any) => toast(e.message, "error"),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Subjects</h2>
          <p className="text-sm text-slate-500">Subjects taught across the school</p>
        </div>
        {isHeadTeacher && <Button onClick={openCreate}><Plus size={16} /> Add subject</Button>}
      </div>

      {data?.length === 0 ? (
        <EmptyState icon={<BookOpen size={40} />} title="No subjects yet" description="Add subjects to enter results against them." action={isHeadTeacher && <Button onClick={openCreate}><Plus size={16} /> Add subject</Button>} />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Code</th>
                {isHeadTeacher && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {data?.map((s) => (
                <tr key={s.id} className="border-b border-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">{s.name}</td>
                  <td className="px-4 py-3">{s.code || "—"}</td>
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

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit subject" : "Add subject"} footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
        </>
      }>
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mathematics" />
          </div>
          <div>
            <Label>Code (optional)</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="MATH" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
