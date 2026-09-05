"use client";
import { useState, useEffect, useRef } from "react";
import { UploadCloud, CheckCircle2, AlertOctagon, Shield, Factory, HeartPulse, Sun, ShieldAlert, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";

export default function SandboxPage() {
  const [file, setFile] = useState<File | null>(null);
  const [permits, setPermits] = useState<any[]>([]);
  const [permitId, setPermitId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPermits();
  }, []);

  const fetchPermits = async () => {
    try {
      const res = await api.get("/permits");
      setPermits(res.data);
      if (res.data.length > 0) {
        setPermitId(res.data[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch permits", err);
    }
  };

  const selectedPermit = permits.find((p) => p.id === permitId);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !permitId) return;

    setLoading(true);
    const formData = new FormData();
    formData.append("image", file);
    formData.append("permit_id", permitId);

    try {
      const res = await api.post("/inspections/audit", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setResult(res.data);
    } catch (err) {
      console.error(err);
      alert("Analysis failed. Ensure backend is running and authenticated.");
    }
    setLoading(false);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Factory className="text-blue-600" size={32} />
            CCTV AI Inspection Sandbox Field Inspection AI Sandbox
          </h2>
          <p className="text-slate-500 mt-1">
            Audit keselamatan kerja real-time berbasis Google Gemini Multimodal Vision untuk memvalidasi kepatuhan APD dan mendeteksi potensi bahaya pada <b>Lini Produksi Pabrik (Toyota Shopfloor)</b> maupun <b>Zona Kerja Kontraktor Eksternal</b>.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <form onSubmit={handleUpload} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-2">
                Pilih Target Zona Kerja / Operasi:
              </label>
              <select
                value={permitId}
                onChange={(e) => setPermitId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-3 text-sm outline-none focus:border-blue-500 bg-white shadow-sm font-medium"
              >
                {permits.map((p) => {
                  const isInternal = p.permit_code.includes("INT") || p.contractor_company.toLowerCase().includes("internal");
                  return (
                    <option key={p.id} value={p.id}>
                      {isInternal ? "🏭 [INTERNAL PABRIK] " : "🚧 [VENDOR] "}
                      {p.permit_code} — {p.contractor_company} ({p.location_zone})
                    </option>
                  );
                })}
              </select>

              {selectedPermit && (
                <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                  <div className="flex items-center gap-1 font-semibold text-slate-700">
                    <Shield size={14} className="text-blue-600" />
                    Aturan APD Wajib Gemini:
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedPermit.dynamic_rules?.required_ppe?.map((ppe: string) => (
                      <span key={ppe} className="px-2 py-0.5 bg-blue-100 text-blue-700 font-medium rounded-full">
                        {ppe}
                      </span>
                    )) || <span className="text-slate-400">Standar Umum</span>}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-2">
                Upload Foto CCTV / Bukti Lapangan
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors"
              >
                <UploadCloud className="w-12 h-12 text-blue-500 mb-3" />
                <p className="text-sm font-medium text-slate-700">
                  {file ? file.name : "Klik atau tarik foto CCTV ke sini"}
                </p>
                <p className="text-xs text-slate-400 mt-1">Format JPG/PNG (Bisa pakai foto di folder test-photos)</p>
                <input
                  type="file"
                  className="hidden"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !file || !permitId}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-medium py-3 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2"
            >
              {loading ? "Gemini Flash Sedang Menganalisis..." : "Jalankan Audit AI K3 (Run Inspection)"}
            </button>
          </form>
        </div>

        {/* Results Panel */}
        <div className="bg-slate-900 text-white p-6 rounded-xl shadow-sm h-[600px] overflow-auto flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold flex items-center gap-2">
                AI Verdict Real-Time
                {result && result.status === "COMPLIANT" && (
                  <span className="flex items-center gap-1 text-emerald-400 text-sm font-medium bg-emerald-950/80 px-2.5 py-1 rounded-full border border-emerald-800">
                    <CheckCircle2 size={16} /> 100% AMAN (COMPLIANT)
                  </span>
                )}
                {result && result.status === "NON_COMPLIANT" && (
                  <span className="flex items-center gap-1 text-red-400 text-sm font-medium bg-red-950/80 px-2.5 py-1 rounded-full border border-red-800">
                    <AlertOctagon size={16} /> BAHAYA (NON-COMPLIANT)
                  </span>
                )}
              </h3>
            </div>

            {!result && !loading && (
              <div className="text-slate-400 text-sm italic py-20 text-center">
                Pilih zona target dan unggah foto CCTV di sebelah kiri untuk melihat penalaran AI Gemini.
              </div>
            )}

            {loading && (
              <div className="animate-pulse space-y-4 py-10">
                <div className="h-4 bg-slate-800 rounded w-3/4"></div>
                <div className="h-4 bg-slate-800 rounded w-1/2"></div>
                <div className="h-32 bg-slate-800 rounded w-full"></div>
              </div>
            )}

            {result && (
              <div className="space-y-4 text-sm">
                {/* Headline Summary */}
                <div className="p-3.5 bg-slate-800/90 rounded-xl border border-slate-700">
                  <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">Ringkasan AI:</span>
                  <p className="text-sm font-medium text-slate-200 mt-1">{result.summary_headline}</p>
                </div>

                {/* Status & Enforcement Action Banner */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700">
                    <span className="text-[11px] text-slate-400 block">Tingkat Risiko:</span>
                    <span className={`text-sm font-bold ${result.severity === 'CRITICAL' ? 'text-red-400' : result.severity === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {result.severity}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700">
                    <span className="text-[11px] text-slate-400 block">Aksi Sistem (Enforcement):</span>
                    <span className={`text-sm font-bold ${
                      result.enforcement_action === 'SUSPEND_PERMIT' 
                        ? 'text-red-400' 
                        : result.enforcement_action === 'ISSUE_WARNING' 
                        ? 'text-amber-300' 
                        : 'text-emerald-400'
                    }`}>
                      {result.enforcement_action}
                    </span>
                  </div>
                </div>

                {/* Penjelasan Tindakan Manajerial */}
                {result.enforcement_action === 'SUSPEND_PERMIT' && (
                  <div className="p-3 bg-red-950/50 border border-red-800/70 rounded-lg text-xs text-red-300 flex items-center gap-2">
                    <span>🚨</span>
                    <span><b>Vendor Permit Suspended:</b> Izin kerja kontraktor otomatis dibekukan di database. Pekerjaan distop seketika.</span>
                  </div>
                )}
                {result.enforcement_action === 'ISSUE_WARNING' && (
                  <div className="p-3 bg-amber-950/50 border border-amber-800/70 rounded-lg text-xs text-amber-300 flex items-center gap-2">
                    <span>⚠️</span>
                    <span><b>Internal Coaching Alert:</b> Lini pabrik TETAP BERJALAN. Notifikasi teguran K3 dikirim ke Supervisor Lini untuk pembinaan pekerja internal.</span>
                  </div>
                )}
                {result.enforcement_action === 'NO_ACTION' && (
                  <div className="p-3 bg-emerald-950/50 border border-emerald-800/70 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
                    <span>✅</span>
                    <span><b>Zero Infraction:</b> Seluruh pekerja dan area mematuhi SOP keselamatan 100%. Tidak ada tindakan penegakan yang diperlukan.</span>
                  </div>
                )}

                {/* Toyota STOP 6 Standard Banner */}
                {result.stop6_category && (
                  <div className="p-3 bg-rose-950/50 border border-rose-800/70 rounded-lg text-xs text-rose-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-bold">
                      <ShieldAlert size={14} className="text-rose-400" />
                      Toyota STOP 6 Classification:
                    </span>
                    <span className="font-bold px-2 py-0.5 bg-rose-900/80 rounded border border-rose-700 text-rose-200">
                      {result.stop6_category}
                    </span>
                  </div>
                )}

                {/* Industrial Hygiene & Health Assessment */}
                {result.health_evaluation && (
                  <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-lg space-y-2 text-xs">
                    <div className="flex items-center justify-between text-emerald-400 font-bold border-b border-emerald-900/50 pb-1.5">
                      <span className="flex items-center gap-1.5">
                        <HeartPulse size={14} /> Industrial Hygiene Assessment (Permenaker 5/2018)
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="bg-slate-900/80 p-2 rounded border border-emerald-900/40">
                        <span className="text-slate-400 flex items-center gap-1 mb-0.5">
                          <Sun size={10} className="text-amber-400" /> Pencahayaan:
                        </span>
                        <span className="font-bold text-slate-200 block">
                          {result.health_evaluation.lighting_condition || "ADEQUATE"}
                        </span>
                        <p className="text-slate-400 mt-0.5">{result.health_evaluation.lighting_notes}</p>
                      </div>
                      <div className="bg-slate-900/80 p-2 rounded border border-emerald-900/40">
                        <span className="text-slate-400 flex items-center gap-1 mb-0.5">
                          <HeartPulse size={10} className="text-emerald-400" /> Postur Ergonomi:
                        </span>
                        <span className={`font-bold block ${
                          result.health_evaluation.ergonomics_status === 'ERGONOMIC_STRAIN_RISK' 
                            ? 'text-amber-300' 
                            : 'text-emerald-300'
                        }`}>
                          {result.health_evaluation.ergonomics_status || "SAFE_POSTURE"}
                        </span>
                        <p className="text-slate-400 mt-0.5">{result.health_evaluation.ergonomics_notes}</p>
                      </div>
                    </div>
                  </div>
                )}
                {/* Safety Perimeter & 5S Assessment */}
                {result.safety_perimeter_evaluation && (
                  <div className="p-3 bg-indigo-950/40 border border-indigo-800/60 rounded-lg space-y-2 text-xs mt-3">
                    <div className="flex items-center justify-between text-indigo-400 font-bold border-b border-indigo-900/50 pb-1.5">
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck size={14} /> Safety Perimeter & Toyota 5S
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="bg-slate-900/80 p-2 rounded border border-indigo-900/40">
                        <span className="text-slate-400 flex items-center gap-1 mb-0.5">
                          5S Housekeeping:
                        </span>
                        <span className={`font-bold block ${
                          result.safety_perimeter_evaluation.housekeeping_5s_status === 'CLEAN_AND_SAFE'
                            ? 'text-emerald-300' 
                            : 'text-rose-300'
                        }`}>
                          {result.safety_perimeter_evaluation.housekeeping_5s_status || "CLEAN_AND_SAFE"}
                        </span>
                        <p className="text-slate-400 mt-0.5">{result.safety_perimeter_evaluation.housekeeping_notes}</p>
                      </div>
                      <div className="bg-slate-900/80 p-2 rounded border border-indigo-900/40">
                        <span className="text-slate-400 flex items-center gap-1 mb-0.5">
                          Perimeter / APAR:
                        </span>
                        <span className={`font-bold block ${
                          result.safety_perimeter_evaluation.barrier_and_apar_status === 'SECURE_PERIMETER' 
                            ? 'text-emerald-300' 
                            : 'text-rose-300'
                        }`}>
                          {result.safety_perimeter_evaluation.barrier_and_apar_status || "SECURE_PERIMETER"}
                        </span>
                        <p className="text-slate-400 mt-0.5">{result.safety_perimeter_evaluation.perimeter_notes}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Raw JSON Details */}
                <pre className="text-xs bg-slate-950 p-3.5 rounded-lg overflow-x-auto text-emerald-400 border border-slate-800 font-mono max-h-48">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            )}
          </div>

          <div className="text-[11px] text-slate-500 border-t border-slate-800 pt-3 mt-4 flex justify-between">
            <span>Powered by Google Gemini 3.6 Flash</span>
            <span>Zero-Shot Spatial Reasoning</span>
          </div>
        </div>
      </div>
    </div>
  );
}
