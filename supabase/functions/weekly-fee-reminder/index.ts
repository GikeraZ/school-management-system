import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendTwilioMessage, formatFeeReminder } from "../_shared/twilio.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Invoked by the pg_cron schedule (daily). Only acts when the reminder
// automation is enabled and the next_run timestamp is due.
Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: settings, error: sErr } = await supabase
    .from("fee_reminder_settings")
    .select("*")
    .limit(1)
    .single();

  if (sErr || !settings) {
    return new Response(JSON.stringify({ error: "No reminder settings found." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!settings.enabled) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "disabled" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const now = new Date();
  const next = settings.next_run ? new Date(settings.next_run) : null;
  if (next && next > now) {
    return new Response(
      JSON.stringify({ ok: true, skipped: true, reason: "not due", next_run: settings.next_run }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Determine the most recent (academic_year, term) with outstanding balances.
  const { data: latest } = await supabase
    .from("vw_fee_balances")
    .select("academic_year, term")
    .gt("balance", 0)
    .order("academic_year", { ascending: false })
    .order("term", { ascending: false })
    .limit(1);

  if (!latest || latest.length === 0) {
    await bumpSchedule(supabase, settings);
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "no outstanding" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: outstanding } = await supabase
    .from("vw_fee_balances")
    .select("student_id, student_name, parent_phone, balance, academic_year, term")
    .gt("balance", 0)
    .eq("academic_year", latest[0].academic_year)
    .eq("term", latest[0].term);

  let sent = 0;
  let failed = 0;

  for (const row of outstanding ?? []) {
    const message = formatFeeReminder(row.student_name, Number(row.balance));
    const res = await sendTwilioMessage(row.parent_phone, message);
    await supabase.from("sms_logs").insert({
      recipient_phone: row.parent_phone,
      recipient_name: row.student_name,
      student_id: row.student_id,
      type: "fee_reminder",
      message,
      status: res.success ? "sent" : "failed",
      provider_message_id: res.sid ?? null,
      error: res.error ?? null,
    });
    if (res.success) sent++;
    else failed++;
  }

  await bumpSchedule(supabase, settings);

  return new Response(
    JSON.stringify({
      ok: true,
      sent,
      failed,
      academic_year: latest[0].academic_year,
      term: latest[0].term,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

async function bumpSchedule(supabase: ReturnType<typeof createClient>, settings: any) {
  const nextRun = new Date(Date.now() + (settings.frequency_days ?? 7) * 86400000);
  await supabase
    .from("fee_reminder_settings")
    .update({ last_run: new Date().toISOString(), next_run: nextRun.toISOString() })
    .eq("id", settings.id);
}
