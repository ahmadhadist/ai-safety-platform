"use client";
import { useState, useEffect } from "react";
import { History, Eye, ShieldAlert, CheckCircle, AlertTriangle, AlertCircle, Camera, HeartPulse, Sun, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";

type Observation = {
  category: string;
  description: string;
  is_infraction: boolean;
  confidence: number;
};

type AuditItem = {
  id: string;
  permit_code: string;
  contractor_company: string;
  inspector_id: string;
  photo_url: string | null;
  compliance_status: string;
  severity_level: string;
  auto_action_taken: boolean;
  created_at: string;
  ai_raw_json: {
    status?: string;
    severity?: string;
    summary_headline?: string;
    observations?: Observation[];
    enforcement_action?: string;
    recommendation?: string;
    data_retention_policy?: string;
    stop6_category?: string;
    health_evaluation?: {
      lighting_condition?: string;
      lighting_notes?: string;
      ergonomics_status?: string;
      ergonomics_notes?: string;
    };
    safety_perimeter_evaluation?: {
      housekeeping_5s_status?: string;
      housekeeping_notes?: string;
      barrier_and_apar_status?: string;
      perimeter_notes?: string;
    };
  };
};

export default function AuditsPage() {
  const [audits, setAudits] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAudit, setSelectedAudit] = useState<AuditItem | null>(null);
  
  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const limit = 10;

  const fetchAudits = async (currentPage: number) => {
    setLoading(true);
    try {
      const res = await api.get(`/inspections/history?page=${currentPage}&limit=${limit}`);
      setAudits(res.data.data);
      setTotalPages(res.data.total_pages);
      setTotalItems(res.data.total);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudits(page);
  }, [page]);

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "CRITICAL": return <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-md flex items-center gap-1"><AlertTriangle size={12}/> CRITICAL</span>;
      case "MEDIUM": return <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-md flex items-center gap-1"><AlertCircle size={12}/> MEDIUM</span>;
      case "LOW": return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-bold rounded-md flex items-center gap-1">LOW</span>;
      default: return <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-md flex items-center gap-1">NONE</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === "COMPLIANT") return <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-md flex items-center gap-1"><CheckCircle size={12}/> COMPLIANT</span>;
    return <span className="px-2 py-1 bg-rose-100 text-rose-700 text-xs font-bold rounded-md flex items-center gap-1"><ShieldAlert size={12}/> NON COMPLIANT</span>;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <History className="text-orange-500 w-8 h-8" /> 
            Audit History & Analysis
          </h2>
          <p className="text-slate-500 mt-1">Review historical safety inspections, AI computer vision reasoning, and legal evidence.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium text-sm">
            <tr>
              <th className="p-4">Date & Time</th>
              <th className="p-4">Permit Code</th>
              <th className="p-4">Contractor</th>
              <th className="p-4">Status</th>
              <th className="p-4">Toyota STOP 6</th>
              <th className="p-4">Severity</th>
              <th className="p-4 text-center">Auto Action</th>
              <th className="p-4 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {loading ? (
              <tr><td colSpan={8} className="p-4 text-center text-slate-500">Loading history...</td></tr>
            ) : audits.length === 0 ? (
              <tr><td colSpan={8} className="p-4 text-center text-slate-500">No inspection history found.</td></tr>
            ) : (
              audits.map(audit => (
                <tr key={audit.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 text-slate-700 font-medium">{new Date(audit.created_at).toLocaleString()}</td>
                  <td className="p-4 text-slate-900 font-bold">{audit.permit_code}</td>
                  <td className="p-4 text-slate-600">{audit.contractor_company}</td>
                  <td className="p-4">{getStatusBadge(audit.compliance_status)}</td>
                  <td className="p-4">
                    {audit.ai_raw_json?.stop6_category ? (
                      <span className="px-2 py-1 bg-rose-50 text-rose-700 text-[10px] font-bold rounded border border-rose-200 block truncate max-w-[120px]" title={audit.ai_raw_json.stop6_category}>
                        {audit.ai_raw_json.stop6_category.replace('STOP_6_', '').replace(/_/g, ' ')}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">-</span>
                    )}
                  </td>
                  <td className="p-4">{getSeverityBadge(audit.severity_level)}</td>
                  <td className="p-4 text-center">
                    {audit.auto_action_taken ? (
                      <span className="text-purple-600 font-semibold bg-purple-50 px-2 py-1 rounded">Yes</span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <button 
                      onClick={() => setSelectedAudit(audit)}
                      className="text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors font-medium flex items-center gap-2 ml-auto"
                    >
                      <Eye size={16} /> View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        
        {/* Pagination Controls */}
        {!loading && totalItems > 0 && (
          <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between">
            <span className="text-sm text-slate-500">
              Showing <span className="font-semibold text-slate-900">{(page - 1) * limit + 1}</span> to <span className="font-semibold text-slate-900">{Math.min(page * limit, totalItems)}</span> of <span className="font-semibold text-slate-900">{totalItems}</span> entries
            </span>
            <div className="flex gap-2">
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedAudit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col md:flex-row">
            
            {/* Left side: Photo */}
            <div className="w-full md:w-1/2 bg-slate-950 p-6 flex flex-col justify-center border-b md:border-b-0 md:border-r border-slate-800 relative">
              <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
                <Camera className="w-5 h-5 text-slate-400" /> Evidence Photo
              </h3>
              {selectedAudit.photo_url ? (
                <img src={selectedAudit.photo_url} alt="Audit Evidence" className="w-full h-auto rounded-lg shadow-lg border border-slate-700" />
              ) : (
                <div className="w-full aspect-video bg-slate-900 rounded-lg border border-slate-800 border-dashed flex flex-col items-center justify-center text-slate-500">
                  <ShieldAlert className="w-12 h-12 mb-2 text-emerald-500/50" />
                  <p>Photo Auto-Purged</p>
                  <p className="text-xs mt-1">Status: COMPLIANT</p>
                </div>
              )}
              
              <div className="mt-6 bg-slate-900 p-4 rounded-xl border border-slate-800">
                <p className="text-slate-400 text-xs mb-1">Retention Policy</p>
                <p className="text-slate-200 text-sm font-mono">{selectedAudit.ai_raw_json.data_retention_policy || "N/A"}</p>
              </div>
            </div>

            {/* Right side: AI Analysis */}
            <div className="w-full md:w-1/2 p-6 flex flex-col bg-slate-50">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-1">AI Safety Analysis</h3>
                  <p className="text-slate-500 text-sm">Permit: <span className="font-bold text-slate-700">{selectedAudit.permit_code}</span></p>
                </div>
                <button onClick={() => setSelectedAudit(null)} className="text-slate-400 hover:text-slate-700 p-2 bg-slate-200 hover:bg-slate-300 rounded-full transition-colors">
                  ✕
                </button>
              </div>

              <div className="space-y-6 flex-1 overflow-y-auto pr-2">
                {/* Headline & Badges */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <h4 className="font-bold text-lg text-slate-900 mb-3">{selectedAudit.ai_raw_json.summary_headline}</h4>
                  <div className="flex gap-2 flex-wrap">
                    {getStatusBadge(selectedAudit.compliance_status)}
                    {getSeverityBadge(selectedAudit.severity_level)}
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-md">
                      Action: {selectedAudit.ai_raw_json.enforcement_action}
                    </span>
                    {selectedAudit.ai_raw_json.stop6_category && (
                      <span className="px-2 py-1 bg-rose-100 text-rose-800 text-xs font-bold rounded-md flex items-center gap-1 border border-rose-200">
                        <ShieldAlert size={12} /> {selectedAudit.ai_raw_json.stop6_category}
                      </span>
                    )}
                  </div>
                </div>

                {/* Industrial Hygiene & Health Assessment */}
                {selectedAudit.ai_raw_json.health_evaluation && (
                  <div className="bg-emerald-50/80 border border-emerald-200 p-4 rounded-xl space-y-3">
                    <h4 className="font-bold text-xs text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                      <HeartPulse size={14} className="text-emerald-600" />
                      Industrial Hygiene & Health Assessment (Permenaker 5/2018)
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="bg-white p-3 rounded-lg border border-emerald-100 shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-slate-500 font-medium flex items-center gap-1">
                            <Sun size={12} className="text-amber-500" /> Pencahayaan (Lighting)
                          </span>
                          <span className="font-bold text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                            {selectedAudit.ai_raw_json.health_evaluation.lighting_condition || "ADEQUATE"}
                          </span>
                        </div>
                        <p className="text-slate-700 leading-relaxed text-[11px]">
                          {selectedAudit.ai_raw_json.health_evaluation.lighting_notes}
                        </p>
                      </div>

                      <div className="bg-white p-3 rounded-lg border border-emerald-100 shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-slate-500 font-medium flex items-center gap-1">
                            <HeartPulse size={12} className="text-emerald-500" /> Postur Kerja (Ergonomi)
                          </span>
                          <span className={`font-bold text-[10px] px-2 py-0.5 rounded ${
                            selectedAudit.ai_raw_json.health_evaluation.ergonomics_status === 'ERGONOMIC_STRAIN_RISK' 
                              ? 'bg-amber-100 text-amber-800' 
                              : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {selectedAudit.ai_raw_json.health_evaluation.ergonomics_status || "SAFE_POSTURE"}
                          </span>
                        </div>
                        <p className="text-slate-700 leading-relaxed text-[11px]">
                          {selectedAudit.ai_raw_json.health_evaluation.ergonomics_notes}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Safety Perimeter & Toyota 5S Assessment */}
                {selectedAudit.ai_raw_json.safety_perimeter_evaluation && (
                  <div className="bg-indigo-50/80 border border-indigo-200 p-4 rounded-xl space-y-3">
                    <h4 className="font-bold text-xs text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-indigo-600" />
                      Safety Perimeter & Toyota 5S
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="bg-white p-3 rounded-lg border border-indigo-100 shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-slate-500 font-medium flex items-center gap-1">
                            5S Housekeeping
                          </span>
                          <span className={`font-bold text-[10px] px-2 py-0.5 rounded ${
                            selectedAudit.ai_raw_json.safety_perimeter_evaluation.housekeeping_5s_status === 'CLEAN_AND_SAFE'
                              ? 'bg-emerald-100 text-emerald-800' 
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {selectedAudit.ai_raw_json.safety_perimeter_evaluation.housekeeping_5s_status || "CLEAN_AND_SAFE"}
                          </span>
                        </div>
                        <p className="text-slate-700 leading-relaxed text-[11px]">
                          {selectedAudit.ai_raw_json.safety_perimeter_evaluation.housekeeping_notes}
                        </p>
                      </div>

                      <div className="bg-white p-3 rounded-lg border border-indigo-100 shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-slate-500 font-medium flex items-center gap-1">
                            Perimeter / APAR
                          </span>
                          <span className={`font-bold text-[10px] px-2 py-0.5 rounded ${
                            selectedAudit.ai_raw_json.safety_perimeter_evaluation.barrier_and_apar_status === 'SECURE_PERIMETER' 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {selectedAudit.ai_raw_json.safety_perimeter_evaluation.barrier_and_apar_status || "SECURE_PERIMETER"}
                          </span>
                        </div>
                        <p className="text-slate-700 leading-relaxed text-[11px]">
                          {selectedAudit.ai_raw_json.safety_perimeter_evaluation.perimeter_notes}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Observations */}
                <div>
                  <h4 className="font-bold text-slate-800 mb-3 text-sm uppercase tracking-wider">AI Observations</h4>
                  <div className="space-y-3">
                    {selectedAudit.ai_raw_json.observations?.map((obs, idx) => (
                      <div key={idx} className={`p-4 rounded-xl border ${obs.is_infraction ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'}`}>
                        <div className="flex justify-between items-start mb-2">
                          <span className={`text-xs font-bold px-2 py-1 rounded ${obs.is_infraction ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {obs.category}
                          </span>
                          <span className="text-xs font-medium text-slate-500 bg-white px-2 py-1 rounded border border-slate-200 shadow-sm">
                            Conf: {Math.round(obs.confidence * 100)}%
                          </span>
                        </div>
                        <p className="text-slate-700 text-sm leading-relaxed">{obs.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recommendation */}
                <div>
                  <h4 className="font-bold text-slate-800 mb-2 text-sm uppercase tracking-wider">AI Recommendation</h4>
                  <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl">
                    <p className="text-indigo-900 text-sm leading-relaxed">{selectedAudit.ai_raw_json.recommendation}</p>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
