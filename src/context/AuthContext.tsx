import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import type { UserRole, UserRoleRow } from "@/lib/types";

interface AuthState {
  user: User | null;
  roleRow: UserRoleRow | null;
  role: UserRole | null;
  loading: boolean;
  isHeadTeacher: boolean;
  isTeacher: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [roleRow, setRoleRow] = useState<UserRoleRow | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadRole(u: User | null) {
    if (!u) {
      setRoleRow(null);
      return;
    }
    const { data } = await supabase
      .from("user_roles")
      .select("*")
      .eq("user_id", u.id)
      .maybeSingle();
    setRoleRow((data as UserRoleRow) ?? null);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      loadRole(data.session?.user ?? null).finally(() => setLoading(false));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" && session) {
        setUser(session.user);
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setRoleRow(null);
      } else if (event === "SIGNED_IN" && session) {
        setUser(session.user);
        loadRole(session.user);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      const { data } = await supabase.auth.getUser();
      await loadRole(data.user);
    }
    return { error: error?.message ?? null };
  }

  async function signUp(email: string, password: string, fullName: string) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setRoleRow(null);
  }

  const value: AuthState = {
    user,
    roleRow,
    role: roleRow?.role ?? null,
    loading,
    isHeadTeacher: roleRow?.role === "head_teacher",
    isTeacher: roleRow?.role === "teacher" || roleRow?.role === "head_teacher",
    signIn,
    signUp,
    signOut,
    refreshRole: () => loadRole(user),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
