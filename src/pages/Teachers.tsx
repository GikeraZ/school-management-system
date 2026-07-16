import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button, Input, Label, Card } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { EmptyState, Spinner } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { UserCog, Plus } from "lucide-react";
import type { Teacher } from "@/lib/types";

export default function Teachers() {
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["teachers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teachers").select("*").order("full_name");
      if (error) throw error;
      return data as Teacher[];
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  function openCreate() {
    setEditing(null);
    setFullName("");
    setEmail("");
    setPhone("");
    setOpen(true);
  }
  function openEdit(t: Teacher) {
    setEditing(t);
    setFullName(t.full_name);
    setEmail(t.email ?? "");
    setPhone(t.phone ?? "");
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        const { error } = await supabase.from("teachers").update({ full_name: fullName, email: email || null, phone: phone || null }).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("teachers").insert({ full_name: fullName, email: email || null, phone: phone || null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teachers"] });
      toast(editing ? "Teacher updated" : "Teacher added", "success");
      setOpen(false);
    },
    onError: (e: any) => toast(e.message, "error"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("teachers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teachers"] });
      toast("Teacher removed", "success");
    },
    onError: (e: any) => toast(e.message, "error"),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Teachers & Staff</h2>
          <p className="text-sm text-slate-500">Manage teaching staff directory</p>
        </div>
        <Button onClick={openCreate}><Plus size={16} /> Add teacher</Button>
      </div>

      {data?.length === 0 ? (
        <EmptyState icon={<UserCog size={40} />} title="No teachers yet" description="Add teaching staff to your directory." action={<Button onClick={openCreate}><Plus size={16} /> Add teacher</Button>} />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((t) => (
                <tr key={t.id} className="border-b border-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">{t.full_name}</td>
                  <td className="px-4 py-3">{t.email || "—"}</td>
                  <td className="px-4 py-3">{t.phone || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-brand-600 hover:underline" onClick={() => openEdit(t)}>Edit</button>
                    <button className="ml-3 text-red-600 hover:underline" onClick={() => remove.mutate(t.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit teacher" : "Add teacher"} footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
        </>
      }>
        <div className="space-y-4">
          <div>
            <Label>Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@school.ac.ke" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+2547..." />
          </div>
        </div>
      </Modal>
    </div>
  );
}
