"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, AlertTriangle, ScanEye, OctagonX, Camera, MapPin, ArrowRight, Activity } from "lucide-react";
import { api } from "@/lib/api";
import { ACTION_LABEL, SEVERITY_STYLE, actionKey, riskLabel, timeAgo } from "@/lib/labels";

type Metrics = {
  total_inspections: number;
  compliance_rate: number;
  critical_violations: number;
  stop_work_orders: number;
  daily_trend: { date: string; inspections: number; violations: number }[];
  risk_breakdown: { risk_category: string; count: number }[];
  location_hotspots: { location: string; violations: number }[];
  recent_incidents: {
    id: string; at: string; location: string | null; severity: string; risk_category: string;
    action: string | null; headline: string | null; photo_url: string | null;
  }[];
};

const COMPLIANT = "#2563eb";
const VIOLATION = "#dc2626";

function KpiTile({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: string | number; hint: string; tone: string }) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
        <span className={`p-1.5 rounded-lg ${tone}`}>{icon}</span>
        {label}
      </div>
      <p className="text-3xl font-bold text-slate-900 mt-3 tabular-nums">{value}</p>
      <p className="text-xs text-slate-400 mt-1">{hint}</p>
    </div>
  );
}

function TrendChart({ data }: { data: Metrics["daily_trend"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.inspections));
  const H = 160;
  return (
    <div>
      <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COMPLIANT }} />Compliant</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: VIOLATION }} />Violations</span>
      </div>
      <div className="relative">
        <div className="flex items-end gap-1.5 border-b border-slate-200" style={{ height: H }}>
          {data.map((d, i) => {
            const ok = d.inspections - d.violations;
            return (
              <div
                key={d.date}
                className="relative flex-1 h-full flex flex-col justify-end cursor-default"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <div className={`flex flex-col justify-end gap-[2px] transition-opacity ${hover !== null && hover !== i ? "opacity-40" : ""}`}>
                  {d.violations > 0 && (
                    <div className="rounded-t" style={{ height: (d.violations / max) * (H - 8), background: VIOLATION }} />
                  )}
                  {ok > 0 && (
                    <div className={d.violations ? "" : "rounded-t"} style={{ height: (ok / max) * (H - 8), background: COMPLIANT }} />
                  )}
                </div>
                {hover === i && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap bg-slate-900 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg">
                    <div className="font-semibold">{new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
                    <div className="text-slate-300">{d.inspections} inspections · {d.violations} violations</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[11px] text-slate-400 mt-1.5">
          <span>{data[0] && new Date(data[0].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          <span>Today</span>
        </div>
      </div>
    </div>
  );
}

function BarList({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-sm text-slate-400 py-6 text-center">No violations recorded yet.</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${r.value}`}>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-slate-700 truncate pr-2">{r.label}</span>
            <span className="font-semibold text-slate-900 tabular-nums">{r.value}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-slate-700 transition-all duration-700" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardPage() {
  const [m, setM] = useState<Metrics | null>(null);

  useEffect(() => {
    api.get("/dashboard/metrics").then((res) => setM(res.data)).catch(console.error);
  }, []);

  if (!m) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 animate-pulse">
        <div className="h-9 w-64 bg-slate-200 rounded" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-32 bg-slate-200 rounded-2xl" />)}</div>
        <div className="h-72 bg-slate-200 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 fade-in">
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Safety Overview</h2>
          <p className="text-slate-500 mt-1 flex items-center gap-2">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" /></span>
            AI-detected hazards across all monitored areas · last 14 days
          </p>
        </div>
        <Link href="/sandbox" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium shadow-sm transition-colors">
          <Camera size={18} /> Run AI Inspection
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile icon={<ScanEye size={16} />} tone="bg-blue-50 text-blue-600" label="AI Inspections" value={m.total_inspections} hint="Photos analysed by Gemini" />
        <KpiTile icon={<ShieldCheck size={16} />} tone="bg-emerald-50 text-emerald-600" label="Compliance Rate" value={`${m.compliance_rate}%`} hint="Inspections with zero findings" />
        <KpiTile icon={<AlertTriangle size={16} />} tone="bg-red-50 text-red-600" label="Critical Hazards" value={m.critical_violations} hint="Life-threatening findings" />
        <KpiTile icon={<OctagonX size={16} />} tone="bg-orange-50 text-orange-600" label="Stop-Work Orders" value={m.stop_work_orders} hint="Issued automatically by AI" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-4"><Activity size={18} className="text-blue-600" /> Daily inspections</h3>
          <TrendChart data={m.daily_trend} />
        </section>
        <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-4">Violations by fatal-risk category</h3>
          <BarList rows={m.risk_breakdown.map((r) => ({ label: riskLabel(r.risk_category), value: r.count }))} />
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-slate-900">Recent incidents</h3>
            <Link href="/audits" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">View all <ArrowRight size={14} /></Link>
          </div>
          {m.recent_incidents.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No incidents. Every inspection passed.</p>}
          <ul className="divide-y divide-slate-100">
            {m.recent_incidents.map((inc) => {
              const action = actionKey(inc.action);
              return (
                <li key={inc.id} className="py-3 flex items-center gap-3">
                  {inc.photo_url ? (
                    <img src={inc.photo_url} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><AlertTriangle size={18} className="text-slate-400" /></div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{inc.headline || "Safety violation detected"}</p>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                      <MapPin size={12} /> {inc.location || "Unspecified"} · {riskLabel(inc.risk_category)} · {timeAgo(inc.at)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${SEVERITY_STYLE[inc.severity] || SEVERITY_STYLE.NONE}`}>{inc.severity}</span>
                    {action === "STOP_WORK" && <span className="text-[11px] font-semibold text-red-600">{ACTION_LABEL[action]}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-4">Hotspot locations</h3>
          <BarList rows={m.location_hotspots.map((h) => ({ label: h.location, value: h.violations }))} />
        </section>
      </div>
    </div>
  );
}
