import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useSchoolSettings } from "@/lib/hooks";
import { Button, Input, Label, Card } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { EmptyState, Spinner } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { Layers, Plus } from "lucide-react";
import { isPrimarySchool, isSecondarySchool } from "@/lib/utils";
import type { Grade } from "@/lib/types";

export default function Grades() {
  const qc = useQueryClient();
  const toast = useToast();
  const { isHeadTeacher } = useAuth();
  const { data: settings } = useSchoolSettings();

  const { data, isLoading } = useQuery({
    queryKey: ["grades"],
    queryFn: async () => {
      const { data, error } = await supabase.from("grades").select("*").order("level");
      if (error) throw error;
      return data as Grade[];
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Grade | null>(null);
  const [name, setName] = useState("");
  const [level, setLevel] = useState(1);

  function openCreate() {
    setEditing(null);
    setName("");
    setLevel((data?.length ?? 0) + 1);
    setOpen(true);
  }
  function openEdit(g: Grade) {
    setEditing(g);
    setName(g.name);
    setLevel(g.level);
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        const { error } = await supabase.from("grades").update({ name, level }).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("grades").insert({ name, level });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grades"] });
      toast(editing ? "Grade updated" : "Grade created", "success");
      setOpen(false);
    },
    onError: (e: any) => toast(e.message, "error"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("grades").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grades"] });
      toast("Grade deleted", "success");
    },
    onError: (e: any) => toast(e.message, "error"),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;

  const schoolType = settings?.school_type ?? "primary";
  const title = isPrimarySchool(schoolType) ? "Grades" : isSecondarySchool(schoolType) ? "Forms" : "Classes";
  const subtitle = isPrimarySchool(schoolType)
    ? "PP1 – Grade 8"
    : isSecondarySchool(schoolType)
    ? "Form 1 – Form 4"
    : "All classes";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        {isHeadTeacher && <Button onClick={openCreate}><Plus size={16} /> Add {isSecondarySchool(schoolType) ? "form" : "grade"}</Button>}
      </div>

      {data?.length === 0 ? (
        <EmptyState
          icon={<Layers size={40} />}
          title={`No ${title.toLowerCase()} yet`}
          description={`Add your first ${isSecondarySchool(schoolType) ? "form" : "grade"} to get started.`}
          action={isHeadTeacher && <Button onClick={openCreate}><Plus size={16} /> Add {isSecondarySchool(schoolType) ? "form" : "grade"}</Button>}
        />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3">Name</th>
                {isHeadTeacher && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {data?.map((g) => (
                <tr key={g.id} className="border-b border-slate-50">
                  <td className="px-4 py-3">{g.level}</td>
                  <td className="px-4 py-3 font-medium text-slate-700">{g.name}</td>
                  {isHeadTeacher && (
                    <td className="px-4 py-3 text-right">
                      <button className="text-brand-600 hover:underline" onClick={() => openEdit(g)}>Edit</button>
                      <button className="ml-3 text-red-600 hover:underline" onClick={() => remove.mutate(g.id)}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Edit ${isSecondarySchool(schoolType) ? "form" : "grade"}` : `Add ${isSecondarySchool(schoolType) ? "form" : "grade"}`} footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
        </>
      }>
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={isSecondarySchool(schoolType) ? "Form 1" : "Grade 6"} />
          </div>
          <div>
            <Label>Level</Label>
            <Input type="number" value={level} onChange={(e) => setLevel(Number(e.target.value))} min={1} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
