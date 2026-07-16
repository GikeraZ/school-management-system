import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button, Card, Input, Label, Badge } from "@/components/ui";
import { EmptyState, Spinner } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { callEdge } from "@/lib/api";
import { Bell, Pause, Play, Eye, Send } from "lucide-react";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { FeeBalance } from "@/lib/types";

export default function FeeReminders() {
  const qc = useQueryClient();
  const toast = useToast();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["fee-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("fee_reminder_settings").select("*").limit(1).single();
      return data as any;
    },
  });

  const { data: outstanding, isLoading: loadingPreview } = useQuery({
    queryKey: ["preview-outstanding"],
    queryFn: async () => {
      const { data } = await supabase.from("vw_fee_outstanding").select("*");
      return data as FeeBalance[];
    },
  });

  const latest = outstanding?.reduce(
    (acc, b) => {
      if (!acc) return b;
      if (b.academic_year > acc.academic_year) return b;
      if (b.academic_year === acc.academic_year && b.term > acc.term) return b;
      return acc;
    },
    null as FeeBalance | null,
  );
  const previewRows = outstanding?.filter((b) => latest && b.academic_year === latest.academic_year && b.term === latest.term) ?? [];

  const [freq, setFreq] = useState(settings?.frequency_days ?? 7);

  const updateSettings = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await supabase.from("fee_reminder_settings").update(patch).eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fee-settings"] }); toast("Settings updated", "success"); },
    onError: (e: any) => toast(e.message, "error"),
  });

  const toggle = () => updateSettings.mutate({ enabled: !settings.enabled });
  const saveFreq = () => updateSettings.mutate({ frequency_days: Number(freq) });

  const sendNow = useMutation({
    mutationFn: async () => {
      const { error, data } = await callEdge("weekly-fee-reminder", {});
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: (d: any) => { qc.invalidateQueries({ queryKey: ["fee-settings"] }); qc.invalidateQueries({ queryKey: ["sms-logs"] }); toast(`Sent ${d?.sent ?? 0}, failed ${d?.failed ?? 0}`, "success"); },
    onError: (e: any) => toast(e.message, "error"),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Weekly Fee Reminders</h2>
        <p className="text-sm text-slate-500">Automated SMS to parents with outstanding balances</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</p>
          <p className="mt-1 flex items-center gap-2 text-lg font-semibold">
            {settings.enabled ? <Badge className="bg-green-100 text-green-700"><Play size={12} /> Active</Badge> : <Badge className="bg-slate-100 text-slate-500"><Pause size={12} /> Paused</Badge>}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Last run</p>
          <p className="mt-1 text-lg font-semibold">{formatDateTime(settings.last_run)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Next run</p>
          <p className="mt-1 text-lg font-semibold">{formatDateTime(settings.next_run)}</p>
        </Card>
      </div>

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label>Frequency (days)</Label>
            <Input type="number" min={1} max={60} value={freq} onChange={(e) => setFreq(Number(e.target.value))} className="w-32" />
          </div>
          <Button variant="outline" onClick={saveFreq} loading={updateSettings.isPending}>Save frequency</Button>
          <Button variant={settings.enabled ? "danger" : "primary"} onClick={toggle} loading={updateSettings.isPending}>
            {settings.enabled ? <><Pause size={16} /> Pause</> : <><Play size={16} /> Resume</>}
          </Button>
          <Button variant="outline" onClick={() => sendNow.mutate()} loading={sendNow.isPending}><Send size={16} /> Send now</Button>
        </div>
        <p className="text-xs text-slate-400">The job runs daily and only sends when enabled and the next-run timestamp is due. Pausing stops all automated sends.</p>
      </Card>

      <Card>
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Eye size={16} className="text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-800">Next send preview</h3>
          {latest && <span className="text-xs text-slate-500">{latest.term} {latest.academic_year} · {previewRows.length} parents</span>}
        </div>
        {loadingPreview ? <div className="flex justify-center py-10"><Spinner className="h-7 w-7" /></div> : previewRows.length === 0 ? (
          <EmptyState icon={<Bell size={40} />} title="Nothing to send" description="No outstanding balances for the upcoming run." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Parent</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Balance</th></tr>
              </thead>
              <tbody>
                {previewRows.map((b) => (
                  <tr key={b.student_id} className="border-b border-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-700">{b.student_name}</td>
                    <td className="px-4 py-2">{b.parent_name}</td>
                    <td className="px-4 py-2 font-mono text-xs">{b.parent_phone}</td>
                    <td className="px-4 py-2 font-semibold text-red-600">{formatCurrency(b.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
