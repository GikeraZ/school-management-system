import { supabase, EDGE_BASE } from "./supabase";

// Call a Supabase edge function with the current session's Authorization header.
export async function callEdge<T = any>(
  name: string,
  body: unknown,
): Promise<{ data: T | null; error: string | null }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(`${EDGE_BASE}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { data: null, error: json?.error ?? `Request failed (${res.status})` };
  }
  return { data: json, error: null };
}
