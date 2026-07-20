import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./components/Toast";
import { supabase } from "./lib/supabase";
import "./index.css";

function isJwtError(msg: string | undefined): boolean {
  return !!msg && (msg.toLowerCase().includes("jwt") || msg.toLowerCase().includes("expired") || msg.toLowerCase().includes("invalid token"));
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: (failureCount, error) => {
      const msg = (error as any)?.message ?? "";
      if (isJwtError(msg)) {
        supabase.auth.signOut().then(() => { window.location.href = "/login"; });
        return false;
      }
      return failureCount < 2;
    }, refetchOnWindowFocus: false, staleTime: 30_000 },
    mutations: { onError: (error) => {
      const msg = (error as any)?.message ?? "";
      if (isJwtError(msg)) {
        supabase.auth.signOut().then(() => { window.location.href = "/login"; });
      }
    }},
  },
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
