import { getAuthContext, requireHeadTeacher, json, corsHeaders } from "../_shared/auth.ts";
import { sendTwilioMessage } from "../_shared/twilio.ts";

// Sends a single SMS (individual result or ad-hoc message) and writes an sms_logs row.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const ctx = await getAuthContext(req);
  const forbidden = requireHeadTeacher(ctx);
  if (forbidden) return forbidden;

  const { to, message, student_id, type } = await req.json();

  if (!to || !/^\+[1-9]\d{6,14}$/.test(to)) {
    return json({ error: "Valid E.164 recipient phone is required." }, 400);
  }
  if (!message || message.length === 0) {
    return json({ error: "Message body is required." }, 400);
  }

  const result = await sendTwilioMessage(to, message);

  const { data: log } = await ctx.supabase
    .from("sms_logs")
    .insert({
      recipient_phone: to,
      student_id: student_id ?? null,
      type: type ?? "announcement",
      message,
      status: result.success ? "sent" : "failed",
      provider_message_id: result.sid ?? null,
      error: result.error ?? null,
      sent_by: ctx.user!.id,
    })
    .select()
    .single();

  if (!result.success) {
    return json({ error: result.error, log }, 502);
  }
  return json({ ok: true, log });
});
