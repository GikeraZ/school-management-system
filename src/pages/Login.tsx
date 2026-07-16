import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { GraduationCap, LogIn } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button, Input, Label } from "@/components/ui";
import { useToast } from "@/components/Toast";

export default function Login() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  const from = (location.state as any)?.from?.pathname ?? "/";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    if (mode === "signin") {
      const { error } = await signIn(email, password);
      if (error) toast(error, "error");
      else navigate(from, { replace: true });
    } else {
      const { error } = await signUp(email, password, fullName);
      if (error) toast(error, "error");
      else toast("Account created. You can now sign in.", "success");
      setMode("signin");
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white">
            <GraduationCap size={26} />
          </div>
          <h1 className="text-xl font-semibold text-slate-800">School Management System</h1>
          <p className="text-sm text-slate-500">Sign in to manage exams, fees & parent SMS</p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4 p-6">
          <h2 className="text-base font-semibold text-slate-800">
            {mode === "signin" ? "Sign in" : "Create account"}
          </h2>

          {mode === "signup" && (
            <div>
              <Label>Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Jane Doe" />
            </div>
          )}
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="teacher@school.ac.ke" />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="••••••••" />
          </div>

          <Button type="submit" loading={loading} className="w-full">
            <LogIn size={16} /> {mode === "signin" ? "Sign in" : "Create account"}
          </Button>

          <p className="text-center text-xs text-slate-500">
            {mode === "signin" ? (
              <>
                Need an account?{" "}
                <button type="button" className="text-brand-600 hover:underline" onClick={() => setMode("signup")}>
                  Create one
                </button>
              </>
            ) : (
              <>
                Already registered?{" "}
                <button type="button" className="text-brand-600 hover:underline" onClick={() => setMode("signin")}>
                  Sign in
                </button>
              </>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}
