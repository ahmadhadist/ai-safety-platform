"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { LayoutDashboard, Camera, ClipboardList, Settings, ShieldAlert, LogOut, Bot, Users, History } from "lucide-react";

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [aiStatus, setAiStatus] = useState<{ available: boolean; backend: string; model_chain: string[]; evidence_storage: string } | null>(null);

  useEffect(() => {
    if (pathname === "/login") return;
    api.get("/system/ai-status").then((res) => setAiStatus(res.data)).catch(() => setAiStatus(null));
  }, [pathname]);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    document.cookie = "auth_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    router.push("/login");
  };

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 text-white flex flex-col justify-between">
        <div>
          <div className="p-6 flex items-center gap-3">
            <ShieldAlert className="text-red-500 w-8 h-8" />
            <h1 className="text-xl font-bold tracking-tight">EHS Global</h1>
          </div>
          <nav className="px-4 space-y-2 mt-4">
            <Link href="/dashboard" className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${pathname === '/dashboard' ? 'bg-slate-800' : 'hover:bg-slate-800'}`}>
              <LayoutDashboard size={20} className="text-blue-400" />
              <span>Overview</span>
            </Link>
            <Link href="/sandbox" className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${pathname === '/sandbox' ? 'bg-slate-800' : 'hover:bg-slate-800'}`}>
              <Camera size={20} className="text-purple-400" />
              <span>AI Inspection</span>
            </Link>
            {process.env.NEXT_PUBLIC_ENABLE_PERMITS === "true" && (
              <Link href="/permits" className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${pathname === '/permits' ? 'bg-slate-800' : 'hover:bg-slate-800'}`}>
              <ClipboardList size={20} className="text-emerald-400" />
              <span>Permits</span>
            </Link>
            )}
            <Link href="/audits" className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${pathname === '/audits' ? 'bg-slate-800' : 'hover:bg-slate-800'}`}>
              <History size={20} className="text-orange-400" />
              <span>Inspection History</span>
            </Link>
            <Link href="/copilot" className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${pathname === '/copilot' ? 'bg-slate-800' : 'hover:bg-slate-800'}`}>
              <Bot size={20} className="text-pink-400" />
              <span>EHS Co-Pilot</span>
            </Link>
            <Link href="/policies" className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${pathname === '/policies' ? 'bg-slate-800' : 'hover:bg-slate-800'}`}>
              <Settings size={20} className="text-amber-400" />
              <span>Safety Policies</span>
            </Link>
            <Link href="/team" className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${pathname === '/team' ? 'bg-slate-800' : 'hover:bg-slate-800'}`}>
              <Users size={20} className="text-indigo-400" />
              <span>Team Access</span>
            </Link>
          </nav>
        </div>
        
        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 p-3 w-full rounded-lg hover:bg-red-950/50 text-slate-300 hover:text-red-400 transition-colors"
          >
            <LogOut size={20} />
            <span>Sign Out</span>
          </button>
          {aiStatus && (
            <div className="mt-4 p-2.5 rounded-lg bg-slate-800/60 border border-slate-700 text-[11px] space-y-0.5">
              <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                <span className={`w-2 h-2 rounded-full ${aiStatus.available ? "bg-emerald-400" : "bg-red-500"}`} />
                {aiStatus.backend}
              </div>
              <div className="text-slate-400 font-mono truncate" title={aiStatus.model_chain.join(" → ")}>{aiStatus.model_chain[0]}</div>
              <div className="text-slate-500">Evidence: {aiStatus.evidence_storage}</div>
            </div>
          )}
          <div className="mt-4 text-xs text-slate-500 text-center">
            AI Builder Cup 2026 Edition
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-8">
        {children}
      </div>
    </div>
  );
}
