import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSchoolSettings } from "@/lib/hooks";
import { Button, Input, Label, Select, Card, CardHeader } from "@/components/ui";
import { EmptyState, Spinner } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { Save } from "lucide-react";
import { schoolTypeLabel, defaultGradeNames } from "@/lib/utils";
import type { SchoolType, GradingMethod } from "@/lib/types";

export default function SchoolSettingsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: settings, isLoading } = useSchoolSettings();

  const [form, setForm] = useState<{
    school_name: string;
    school_type: SchoolType;
    grading_method: GradingMethod;
    motto: string;
    address: string;
    phone: string;
    email: string;
    academic_year: string;
  } | null>(null);

  // Initialize form when data loads
  if (settings && !form) {
    setForm({
      school_name: settings.school_name,
      school_type: settings.school_type,
      grading_method: settings.grading_method,
      motto: settings.motto ?? "",
      address: settings.address ?? "",
      phone: settings.phone ?? "",
      email: settings.email ?? "",
      academic_year: settings.academic_year,
    });
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form || !settings) return;
      const { error } = await supabase
        .from("school_settings")
        .update({
          school_name: form.school_name,
          school_type: form.school_type,
          grading_method: form.grading_method,
          motto: form.motto || null,
          address: form.address || null,
          phone: form.phone || null,
          email: form.email || null,
          academic_year: form.academic_year,
        })
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["school-settings"] });
      qc.invalidateQueries({ queryKey: ["grades"] });
      toast("School settings saved", "success");
    },
    onError: (e: any) => toast(e.message, "error"),
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;
  }

  if (!settings || !form) {
    return <EmptyState title="Settings not found" description="School settings table is missing." />;
  }

  const gradePreview = defaultGradeNames(form.school_type);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">School Settings</h2>
        <p className="text-sm text-slate-500">Configure school type, grading method, and general info</p>
      </div>

      {/* School Identity */}
      <Card>
        <CardHeader title="School Identity" />
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label>School Name</Label>
              <Input value={form.school_name} onChange={(e) => setForm({ ...form, school_name: e.target.value })} />
            </div>
            <div>
              <Label>Motto</Label>
              <Input value={form.motto} onChange={(e) => setForm({ ...form, motto: e.target.value })} placeholder="e.g. Knowledge is Power" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+254..." />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="info@school.ac.ke" />
            </div>
            <div className="md:col-span-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="P.O. Box..." />
            </div>
          </div>
        </div>
      </Card>

      {/* School Type */}
      <Card>
        <CardHeader title="School Type & Grading" />
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label>School Type</Label>
              <Select value={form.school_type} onChange={(e) => setForm({ ...form, school_type: e.target.value as SchoolType })}>
                <option value="primary">Primary School</option>
                <option value="secondary">Secondary School</option>
                <option value="mixed">Mixed (Primary + Secondary)</option>
              </Select>
              <p className="mt-1 text-xs text-slate-400">Determines available classes and terminology</p>
            </div>
            <div>
              <Label>Grading Method</Label>
              <Select value={form.grading_method} onChange={(e) => setForm({ ...form, grading_method: e.target.value as GradingMethod })}>
                <option value="kcse">KCSE (A, A-, B+, ...)</option>
                <option value="cbc">CBC (EE, ME, AE, BE)</option>
                <option value="percentage">Percentage (A, B, C, D, E)</option>
              </Select>
              <p className="mt-1 text-xs text-slate-400">How marks are converted to grades</p>
            </div>
            <div>
              <Label>Current Academic Year</Label>
              <Input value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} />
            </div>
          </div>
        </div>
      </Card>

      {/* Preview */}
      <Card>
        <CardHeader title="Academic Structure Preview" />
        <div className="p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">{schoolTypeLabel(form.school_type)}</span>
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
              {form.grading_method === "kcse" ? "KCSE Grading" : form.grading_method === "cbc" ? "CBC Grading" : "Percentage Grading"}
            </span>
          </div>
          <p className="mb-2 text-xs font-medium text-slate-500">Available classes:</p>
          <div className="flex flex-wrap gap-2">
            {gradePreview.map((g) => (
              <span key={g.level} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700">{g.name}</span>
            ))}
          </div>
          <p className="mt-3 mb-1 text-xs font-medium text-slate-500">Streams per class:</p>
          <div className="flex flex-wrap gap-2">
            {["North", "South", "East", "West"].map((s) => (
              <span key={s} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700">{s}</span>
            ))}
          </div>
        </div>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
          <Save size={16} /> Save Settings
        </Button>
      </div>
    </div>
  );
}
