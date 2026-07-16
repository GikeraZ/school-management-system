// Authorization helper: resolves the calling user and enforces the head_teacher role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "./cors.ts";

export interface AuthContext {
  supabase: ReturnType<typeof createClient>;
  user: { id: string; email: string | null } | null;
  role: "teacher" | "head_teacher" | null;
}

export async function getAuthContext(req: Request): Promise<AuthContext> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  const client = createClient(url, serviceKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
  } = await client.auth.getUser();

  let role: "teacher" | "head_teacher" | null = null;
  if (user) {
    const { data } = await client
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();
    role = (data?.role as AuthContext["role"]) ?? null;
  }

  return { supabase: client, user: user ? { id: user.id, email: user.email } : null, role };
}

export function requireHeadTeacher(ctx: AuthContext): Response | null {
  if (!ctx.user) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (ctx.role !== "head_teacher") {
    return json({ error: "Forbidden: head teacher access required" }, 403);
  }
  return null;
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export { corsHeaders };
