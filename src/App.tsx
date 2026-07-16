import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { Spinner } from "@/components/EmptyState";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Students from "@/pages/Students";
import ResultsEntry from "@/pages/ResultsEntry";
import Analysis from "@/pages/Analysis";
import MeritReports from "@/pages/MeritReports";
import SMS from "@/pages/SMS";
import Fees from "@/pages/Fees";
import FeeReminders from "@/pages/FeeReminders";
import Grades from "@/pages/Grades";
import Streams from "@/pages/Streams";
import Subjects from "@/pages/Subjects";
import Teachers from "@/pages/Teachers";

function RequireAuth({ children, headOnly = false }: { children: JSX.Element; headOnly?: boolean }) {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!role) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">
        Your account is pending role assignment. Please contact the Head Teacher.
      </div>
    );
  }
  if (headOnly && role !== "head_teacher") return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/students" element={<Students />} />
                <Route path="/results" element={<ResultsEntry />} />
                <Route path="/analysis" element={<Analysis />} />
                <Route path="/merit" element={<MeritReports />} />
                <Route path="/sms" element={<RequireAuthHead><SMS /></RequireAuthHead>} />
                <Route path="/fees" element={<Fees />} />
                <Route path="/fee-reminders" element={<RequireAuthHead><FeeReminders /></RequireAuthHead>} />
                <Route path="/grades" element={<RequireAuthHead><Grades /></RequireAuthHead>} />
                <Route path="/streams" element={<RequireAuthHead><Streams /></RequireAuthHead>} />
                <Route path="/subjects" element={<RequireAuthHead><Subjects /></RequireAuthHead>} />
                <Route path="/teachers" element={<RequireAuthHead><Teachers /></RequireAuthHead>} />
              </Routes>
            </AppLayout>
          </RequireAuth>
        }
      >
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

// Wrapper used inline to enforce head_teacher on nested routes.
function RequireAuthHead({ children }: { children: JSX.Element }) {
  const { role } = useAuth();
  if (role !== "head_teacher") return <Navigate to="/" replace />;
  return children;
}
