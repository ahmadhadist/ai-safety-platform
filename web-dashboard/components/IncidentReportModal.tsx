"use client";
import { useEffect, useState } from "react";
import { FileText, Printer, RefreshCw, X } from "lucide-react";
import { api } from "@/lib/api";
import { humanize } from "@/lib/labels";

type Report = {
  title: string;
  incident_summary: string;
  immediate_actions_taken: string[];
  five_whys: string[];
  root_cause: string;
  contributing_factors: string[];
  corrective_actions: { action: string; owner_role: string; due_in_days: number; control_type: string }[];
  lessons_learned: string;
  regulatory_references: string[];
};

const CONTROL_ORDER = ["ELIMINATION", "SUBSTITUTION", "ENGINEERING", "ADMINISTRATIVE", "PPE"];

export default function IncidentReportModal({
  auditId, location, policy, when, onClose,
}: { auditId: string; location: string; policy: string; when: string; onClose: () => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = (regenerate = false) => {
    setLoading(true);
    setError("");
    api.post(`/inspections/${auditId}/report${regenerate ? "?regenerate=true" : ""}`)
      .then((res) => setReport(res.data))
      .catch((e) => setError(e?.response?.data?.detail || "Could not generate the report."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [auditId]); // eslint-disable-line react-hooks/exhaustive-deps

  const due = (days: number) => new Date(Date.now() + days * 86400000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 print:static print:bg-white print:p-0">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl print:shadow-none print:max-h-none print:rounded-none" id="incident-report">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between print:hidden">
          <span className="flex items-center gap-2 font-semibold text-slate-800"><FileText size={18} className="text-blue-600" /> Incident Investigation Report</span>
          <div className="flex gap-2">
            <button onClick={() => load(true)} disabled={loading} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" title="Regenerate"><RefreshCw size={16} /></button>
            <button onClick={() => window.print()} disabled={!report} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-40"><Printer size={14} /> Print / PDF</button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><X size={16} /></button>
          </div>
        </div>

        <div className="p-8 space-y-6 text-sm text-slate-700">
          {loading && (
            <div className="space-y-3 animate-pulse">
              <div className="h-6 w-2/3 bg-slate-200 rounded" />
              <div className="h-4 w-full bg-slate-100 rounded" />
              <div className="h-4 w-5/6 bg-slate-100 rounded" />
              <p className="text-xs text-slate-400 pt-2">Gemini is running a 5-Whys root-cause analysis…</p>
            </div>
          )}
          {error && <p className="text-red-600">{error}</p>}

          {report && !loading && (
            <>
              <header className="border-b border-slate-200 pb-4">
                <p className="text-xs uppercase tracking-wider text-slate-400">Incident Investigation · AI-assisted draft</p>
                <h2 className="text-2xl font-bold text-slate-900 mt-1">{report.title}</h2>
                <p className="text-slate-500 mt-1">{location} · {policy} · {new Date(when + (when.endsWith("Z") ? "" : "Z")).toLocaleString()}</p>
              </header>

              <Section title="Summary"><p>{report.incident_summary}</p></Section>
              <Section title="Immediate actions"><ul className="list-disc pl-5 space-y-1">{report.immediate_actions_taken.map((a, i) => <li key={i}>{a}</li>)}</ul></Section>

              <Section title="Root-cause analysis (5 Whys)">
                <ol className="space-y-2">
                  {report.five_whys.map((w, i) => (
                    <li key={i} className="flex gap-3"><span className="shrink-0 w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center">{i + 1}</span><span>{w}</span></li>
                  ))}
                </ol>
                <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200"><span className="font-semibold text-red-800">Root cause: </span>{report.root_cause}</div>
              </Section>

              {report.contributing_factors.length > 0 && (
                <Section title="Contributing factors"><ul className="list-disc pl-5 space-y-1">{report.contributing_factors.map((f, i) => <li key={i}>{f}</li>)}</ul></Section>
              )}

              <Section title="Corrective & preventive actions (hierarchy of controls)">
                <table className="w-full text-left border border-slate-200 rounded-lg overflow-hidden">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr><th className="p-2">Action</th><th className="p-2">Control</th><th className="p-2">Owner</th><th className="p-2">Due</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...report.corrective_actions]
                      .sort((a, b) => CONTROL_ORDER.indexOf(a.control_type) - CONTROL_ORDER.indexOf(b.control_type))
                      .map((a, i) => (
                        <tr key={i}>
                          <td className="p-2">{a.action}</td>
                          <td className="p-2 whitespace-nowrap text-xs font-semibold">{humanize(a.control_type)}</td>
                          <td className="p-2 text-xs">{a.owner_role}</td>
                          <td className="p-2 whitespace-nowrap text-xs">{due(a.due_in_days)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </Section>

              <Section title="Lessons learned"><p>{report.lessons_learned}</p></Section>
              <Section title="References"><ul className="list-disc pl-5 space-y-1 text-xs">{report.regulatory_references.map((r, i) => <li key={i}>{r}</li>)}</ul></Section>

              <footer className="pt-6 border-t border-slate-200 grid grid-cols-2 gap-8 text-xs text-slate-500">
                <div><div className="h-10 border-b border-slate-300" />Investigated by (EHS)</div>
                <div><div className="h-10 border-b border-slate-300" />Approved by (Area Manager)</div>
              </footer>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">{title}</h3>
      {children}
    </section>
  );
}
