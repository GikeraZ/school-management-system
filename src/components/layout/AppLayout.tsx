import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  ClipboardList,
  BarChart3,
  Award,
  MessageSquare,
  Wallet,
  Bell,
  Layers,
  BookOpen,
  UserCog,
  Menu,
  LogOut,
  Settings,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  headOnly?: boolean;
}

const navItems: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/students", label: "Students", icon: Users },
  { to: "/results", label: "Results Entry", icon: ClipboardList },
  { to: "/analysis", label: "Analysis", icon: BarChart3 },
  { to: "/merit", label: "Merit Reports", icon: Award },
  { to: "/sms", label: "SMS", icon: MessageSquare, headOnly: true },
  { to: "/fees", label: "Fees", icon: Wallet },
  { to: "/fee-reminders", label: "Fee Reminders", icon: Bell, headOnly: true },
];

const adminItems: NavItem[] = [
  { to: "/school-settings", label: "School Settings", icon: Settings, headOnly: true },
  { to: "/grades", label: "Grades", icon: Layers, headOnly: true },
  { to: "/streams", label: "Streams", icon: GraduationCap, headOnly: true },
  { to: "/subjects", label: "Subjects", icon: BookOpen, headOnly: true },
  { to: "/teachers", label: "Teachers", icon: UserCog, headOnly: true },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, roleRow, isHeadTeacher, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const items = [...navItems, ...adminItems].filter(
    (i) => !i.headOnly || isHeadTeacher,
  );

  function SidebarContent() {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <GraduationCap size={18} />
          </div>
          <span className="text-sm font-semibold text-slate-800">SchoolMS</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {navItems
            .filter((i) => !i.headOnly || isHeadTeacher)
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                    isActive
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-600 hover:bg-slate-100",
                  )
                }
              >
                <item.icon size={18} />
                {item.label}
              </NavLink>
            ))}

          {isHeadTeacher && (
            <>
              <p className="px-3 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Management
              </p>
              {adminItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                      isActive
                        ? "bg-brand-50 text-brand-700"
                        : "text-slate-600 hover:bg-slate-100",
                    )
                  }
                >
                  <item.icon size={18} />
                  {item.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="border-t border-slate-100 p-3">
          <div className="mb-2 px-2">
            <p className="text-sm font-medium text-slate-700">{roleRow?.full_name}</p>
            <p className="text-xs capitalize text-slate-500">{roleRow?.role?.replace("_", " ")}</p>
          </div>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <aside className="no-print hidden w-64 shrink-0 border-r border-slate-200 bg-white md:block">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="no-print fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl">
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <button className="rounded-md p-1 text-slate-600 hover:bg-slate-100 md:hidden" onClick={() => setOpen(true)}>
            <Menu size={20} />
          </button>
          <h1 className="text-sm font-semibold text-slate-700">
            {items.find((i) => i.to === location.pathname)?.label ?? "School Management System"}
          </h1>
          <span className="text-xs text-slate-400">{user?.email}</span>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
