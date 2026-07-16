import { getAuthContext, requireHeadTeacher, json, corsHeaders } from "../_shared/auth.ts";
import { sendTwilioMessage, formatResultMessage } from "../_shared/twilio.ts";

// Bulk SMS dispatcher.
//  - mode "results": send a per-student summary for an exam+stream (must be published).
//  - mode "announcement": send the same message to selected parents (by student_ids,
//    stream_ids, and/or grade_ids).
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

  const body = await req.json();
  const mode = body.mode ?? "announcement";

  if (mode === "results") {
    return await sendStreamResults(ctx, body);
  }
  return await sendAnnouncement(ctx, body);
});

async function sendStreamResults(
  ctx: Awaited<ReturnType<typeof getAuthContext>>,
  body: any,
) {
  const { exam_id, stream_id } = body;
  if (!exam_id || !stream_id) {
    return json({ error: "exam_id and stream_id are required." }, 400);
  }

  const { data: exam } = await ctx.supabase
    .from("exams")
    .select("name")
    .eq("id", exam_id)
    .single();

  const { data: results, error } = await ctx.supabase
    .from("results")
    .select(
      "marks, out_of, grade_letter, subject:subjects(name), student:students(id, full_name, parent_name, parent_phone)",
    )
    .eq("exam_id", exam_id)
    .eq("stream_id", stream_id)
    .eq("published", true);

  if (error) return json({ error: error.message }, 400);
  if (!results || results.length === 0) {
    return json({ error: "No published results found for this stream/exam." }, 404);
  }

  // Group by student.
  const byStudent = new Map<string, any>();
  for (const r of results) {
    const s = r.student as any;
    if (!byStudent.has(s.id)) {
      byStudent.set(s.id, { student: s, rows: [] });
    }
    byStudent.get(s.id).rows.push(r);
  }

  const sent: string[] = [];
  const failed: { phone: string; error: string }[] = [];

  for (const { student, rows } of byStudent.values()) {
    const parts = rows
      .sort((a: any, b: any) => (a.subject.name > b.subject.name ? 1 : -1))
      .map(
        (r: any) =>
          `${r.subject.name} ${r.marks}/${r.out_of}(${r.grade_letter})`,
      );
    const total = rows.reduce((s: number, r: any) => s + Number(r.marks), 0);
    const avg = Math.round(total / rows.length);
    const message =
      `Dear parent, ${student.full_name}'s ${exam?.name ?? "exam"} results: ` +
      `${parts.join(", ")}. Total ${total}, Avg ${avg}%. - School`;

    const res = await sendTwilioMessage(student.parent_phone, message);
    await ctx.supabase.from("sms_logs").insert({
      recipient_phone: student.parent_phone,
      recipient_name: student.parent_name,
      student_id: student.id,
      type: "bulk_result",
      message,
      status: res.success ? "sent" : "failed",
      provider_message_id: res.sid ?? null,
      error: res.error ?? null,
      sent_by: ctx.user!.id,
    });
    if (res.success) sent.push(student.parent_phone);
    else failed.push({ phone: student.parent_phone, error: res.error ?? "unknown" });
  }

  return json({ ok: true, sent: sent.length, failed: failed.length, failedDetails: failed });
}

async function sendAnnouncement(
  ctx: Awaited<ReturnType<typeof getAuthContext>>,
  body: any,
) {
  const { message, student_ids, stream_ids, grade_ids } = body;
  if (!message) return json({ error: "Message body is required." }, 400);
  if (
    (!student_ids || student_ids.length === 0) &&
    (!stream_ids || stream_ids.length === 0) &&
    (!grade_ids || grade_ids.length === 0)
  ) {
    return json({ error: "Provide student_ids, stream_ids, or grade_ids." }, 400);
  }

  let query = ctx.supabase
    .from("students")
    .select("id, full_name, parent_name, parent_phone")
    .eq("status", "active");

  if (student_ids?.length) {
    query = query.in("id", student_ids);
  } else if (stream_ids?.length) {
    query = query.in("stream_id", stream_ids);
  } else if (grade_ids?.length) {
    query = query.in("grade_id", grade_ids);
  }

  const { data: students, error } = await query;
  if (error) return json({ error: error.message }, 400);
  if (!students || students.length === 0) {
    return json({ error: "No parents matched the selection." }, 404);
  }

  const sent: string[] = [];
  const failed: { phone: string; error: string }[] = [];

  for (const s of students) {
    const res = await sendTwilioMessage(s.parent_phone, message);
    await ctx.supabase.from("sms_logs").insert({
      recipient_phone: s.parent_phone,
      recipient_name: s.parent_name,
      student_id: s.id,
      type: "announcement",
      message,
      status: res.success ? "sent" : "failed",
      provider_message_id: res.sid ?? null,
      error: res.error ?? null,
      sent_by: ctx.user!.id,
    });
    if (res.success) sent.push(s.parent_phone);
    else failed.push({ phone: s.parent_phone, error: res.error ?? "unknown" });
  }

  return json({ ok: true, sent: sent.length, failed: failed.length, failedDetails: failed });
}
