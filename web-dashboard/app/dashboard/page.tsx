"use client";
import { useEffect, useState } from "react";
import { ShieldCheck, AlertTriangle, FileWarning, TrendingDown, Activity, Camera } from "lucide-react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState({
    active_permits: 0, compliance_rate: 0, critical_violations: 0, suspended_permits: []
  });

  useEffect(() => {
    api.get("/dashboard/metrics")
      .then(res => setMetrics(res.data))
      .catch(err => {
        if(err.response?.status === 401) router.push("/login");
        console.error(err);
      });
  }, [router]);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Global Overview</h2>
          <p className="text-slate-500 mt-1">Real-time AI surveillance and permit telemetry.</p>
        </div>
      </div>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-4 bg-blue-50 flex items-center justify-center rounded-xl text-blue-600"><FileWarning size={28} /></div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Active Permits</p>
            <p className="text-3xl font-bold text-slate-900">{metrics.active_permits}</p>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-4 bg-emerald-50 flex items-center justify-center rounded-xl text-emerald-600"><ShieldCheck size={28} /></div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Compliance Rate</p>
            <p className="text-3xl font-bold text-slate-900">{metrics.compliance_rate}%</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-4 bg-red-50 flex items-center justify-center rounded-xl text-red-600"><AlertTriangle size={28} /></div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Critical Flags</p>
            <p className="text-3xl font-bold text-slate-900">{metrics.critical_violations}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-4 bg-orange-50 flex items-center justify-center rounded-xl text-orange-600"><TrendingDown size={28} /></div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Auto-Suspended</p>
            <p className="text-3xl font-bold text-slate-900">{metrics.suspended_permits.length}</p>
          </div>
        </div>
      </div>

      {/* Expanded Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Recent AI Activity Log (Takes up 2/3 width) */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Activity className="text-blue-500" />
            <h3 className="text-lg font-bold text-slate-900">Recent AI Interventions</h3>
          </div>
          
          <div className="space-y-4">
            {metrics.suspended_permits.length > 0 ? (
              metrics.suspended_permits.map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-4 bg-red-50/50 border border-red-100 rounded-xl">
                  <div>
                    <p className="font-semibold text-slate-900">{p.permit_code}</p>
                    <p className="text-sm text-slate-500">Contractor: {p.contractor}</p>
                  </div>
                  <span className="px-3 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full flex items-center gap-1">
                    <AlertTriangle size={12} /> SUSPENDED
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center p-8 text-slate-500 border-2 border-dashed border-slate-100 rounded-xl">
                No recent violations detected. The factory floor is secure.
              </div>
            )}
            
            {/* Mock compliant log to make it look active */}
            <div className="flex items-center justify-between p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl">
              <div>
                <p className="font-semibold text-slate-900">WP-2026-999</p>
                <p className="text-sm text-slate-500">Contractor: BuildCorp Ltd (Routine Check)</p>
              </div>
              <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full flex items-center gap-1">
                <ShieldCheck size={12} /> COMPLIANT
              </span>
            </div>
          </div>
        </div>

        {/* Action Panel */}
        <div className="bg-slate-900 rounded-2xl shadow-sm p-6 text-white">
          <h3 className="text-lg font-bold mb-4">Command Center</h3>
          <p className="text-slate-400 text-sm mb-6">
            Active monitoring is engaged. Gemini AI is processing incoming visual telemetry from mobile inspectors.
          </p>
          <button onClick={() => router.push('/sandbox')} className="w-full bg-blue-600 hover:bg-blue-700 font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
            <Camera size={18} />
            Test AI Sandbox
          </button>
        </div>

      </div>
    </div>
  );
}
