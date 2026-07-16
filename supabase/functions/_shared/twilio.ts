// Twilio SMS helpers. Secrets are read from Deno env (set via `supabase secrets set`)
// and are never exposed to the browser.

const SENDER = Deno.env.get("SMS_SENDER_NAME") ?? "School";

interface TwilioResult {
  success: boolean;
  sid?: string;
  error?: string;
}

export async function sendTwilioMessage(
  to: string,
  body: string,
): Promise<TwilioResult> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_PHONE_NUMBER");

  if (!sid || !token || !from) {
    return { success: false, error: "Twilio credentials not configured." };
  }

  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const auth = "Basic " + btoa(`${sid}:${token}`);

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: auth,
        },
        body: params.toString(),
      },
    );
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data?.message ?? "Twilio error" };
    }
    return { success: true, sid: data.sid };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export function formatResultMessage(
  studentName: string,
  examName: string,
  subject: string,
  marks: number,
  outOf: number,
  grade: string,
): string {
  const pct = Math.round((marks / outOf) * 100);
  return (
    `${SENDER}: Dear parent, ${studentName}'s ${subject} result for ` +
    `${examName} is ${marks}/${outOf} (${pct}%, Grade ${grade}). Thank you.`
  );
}

export function formatFeeReminder(
  studentName: string,
  balance: number,
): string {
  return (
    `Dear parent, ${studentName} has a fee balance of KES ${balance.toLocaleString()}. ` +
    `Kindly clear at your earliest convenience. - ${SENDER}`
  );
}
