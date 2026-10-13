"use client";
import { useEffect, useRef, useState } from "react";
import {
  UploadCloud, CheckCircle2, OctagonX, AlertTriangle, ScanEye, HeartPulse, Sun, ShieldCheck, Cpu, BellRing,
  MapPin, Thermometer, ChevronDown, Image as ImageIcon, Lightbulb, Users,
} from "lucide-react";
import { api } from "@/lib/api";
import EvidenceViewer from "@/components/EvidenceViewer";
import { ACTION_LABEL, actionKey, humanize, riskLabel } from "@/lib/labels";

type Policy = { id: string; title: string; permit_type: string; dynamic_rules: any };

const SAMPLES = [
  { file: "/samples/demo_violation_welding.jpg", label: "Hot work", policy: "Standard Hot Work", location: "Welding Bay A" },
  { file: "/samples/demo_compliant_worker.jpg", label: "Site worker", policy: "General Factory Floor", location: "Assembly Line 1" },
];
const LOCATIONS = ["Welding Bay A", "Scaffold Zone - Unit 4", "Assembly Line 1", "Warehouse Dock 2", "Substation B", "Tank Farm - T3"];

const VERDICT = {
  STOP_WORK: { title: "Stop Work Order", note: "Imminent danger detected. Work must stop until the hazard is corrected.", box: "bg-red-600", icon: OctagonX },
  ISSUE_WARNING: { title: "Warning Issued", note: "Violation found. Supervisor notified for correction and coaching.", box: "bg-amber-500", icon: AlertTriangle },
  NO_ACTION: { title: "Compliant", note: "No hazards found. Photo auto-purged to protect worker privacy.", box: "bg-emerald-600", icon: CheckCircle2 },
};

export default function SandboxPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [policyId, setPolicyId] = useState("");
  const [location, setLocation] = useState(LOCATIONS[0]);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showSensors, setShowSensors] = useState(false);
  const [sensorTemp, setSensorTemp] = useState(36);
  const [sensorHumid, setSensorHumid] = useState(80);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get("/policies/templates").then((res) => {
      setPolicies(res.data);
      if (res.data.length) setPolicyId(res.data[0].id);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!file) return setPreviewUrl(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [loading]);

  const selectedPolicy = policies.find((p) => p.id === policyId);

  const pickFile = (f: File | null | undefined) => {
    if (!f || !f.type.startsWith("image/")) return;
    setFile(f);
    setResult(null);
    setError("");
  };

  const loadSample = async (s: (typeof SAMPLES)[number]) => {
    const blob = await (await fetch(s.file)).blob();
    pickFile(new File([blob], s.file.split("/").pop()!, { type: blob.type || "image/jpeg" }));
    const match = policies.find((p) => p.title === s.policy);
    if (match) setPolicyId(match.id);
    setLocation(s.location);
  };

  const runInspection = async () => {
    if (!file || !policyId) return;
    setLoading(true);
    setError("");
    setResult(null);
    const formData = new FormData();
    formData.append("image", file);
    formData.append("policy_id", policyId);
    formData.append("location", location);
    if (showSensors) {
      formData.append("sensor_temperature_c", String(sensorTemp));
      formData.append("sensor_humidity_pct", String(sensorHumid));
    }
    try {
      const res = await api.post("/inspections/audit", formData, { headers: { "Content-Type": "multipart/form-data" } });
      setResult(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Inspection failed. Check that the backend is reachable.");
    }
    setLoading(false);
  };

  const action = result ? actionKey(result.enforcement_action) : null;
  const verdict = action ? VERDICT[action] : null;
  const rules = selectedPolicy?.dynamic_rules || {};

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in">
      <div>
        <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
          <ScanEye className="text-blue-600" size={30} /> AI Safety Inspection
        </h2>
        <p className="text-slate-500 mt-1">
          Upload a CCTV frame or field photo. Gemini checks it against your safety policy, pinpoints every hazard, and escalates instantly.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ---------------- Input ---------------- */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-5 h-fit">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">1 · Safety policy</label>
            <select
              value={policyId}
              onChange={(e) => setPolicyId(e.target.value)}
              className="mt-1.5 w-full border border-slate-300 rounded-xl p-2.5 text-sm bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
            >
              {policies.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            {rules.required_ppe?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {rules.required_ppe.map((ppe: string) => (
                  <span key={ppe} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[11px] font-medium rounded-full border border-blue-100">{humanize(ppe)}</span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">2 · Location / camera</label>
            <div className="relative mt-1.5">
              <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                list="locations"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full border border-slate-300 rounded-xl p-2.5 pl-9 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
              />
              <datalist id="locations">{LOCATIONS.map((l) => <option key={l} value={l} />)}</datalist>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">3 · Photo</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0]); }}
              className={`mt-1.5 relative rounded-xl border-2 border-dashed cursor-pointer overflow-hidden transition-colors ${
                dragging ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:bg-slate-50"
              }`}
            >
              {previewUrl ? (
                <div className="relative">
                  <img src={previewUrl} alt="Selected" className="w-full max-h-56 object-cover" />
                  <span className="absolute bottom-2 right-2 text-[11px] bg-black/60 text-white px-2 py-0.5 rounded">Click to change</span>
                </div>
              ) : (
                <div className="p-8 flex flex-col items-center text-center">
                  <UploadCloud className="w-10 h-10 text-blue-500 mb-2" />
                  <p className="text-sm font-medium text-slate-700">Drop a photo here or click to browse</p>
                  <p className="text-xs text-slate-400 mt-1">JPG or PNG</p>
                </div>
              )}
              <input type="file" className="hidden" ref={fileInputRef} accept="image/*" onChange={(e) => pickFile(e.target.files?.[0])} />
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
              <ImageIcon size={14} /> Try a sample:
              {SAMPLES.map((s) => (
                <button key={s.file} onClick={() => loadSample(s)} className="px-2 py-1 rounded-lg border border-slate-200 hover:border-blue-400 hover:text-blue-600 transition-colors">
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl">
            <button onClick={() => setShowSensors(!showSensors)} className="w-full flex items-center justify-between p-3 text-sm text-slate-700">
              <span className="flex items-center gap-2"><Thermometer size={16} className={showSensors ? "text-amber-500" : "text-slate-400"} /> IoT sensor fusion {showSensors ? "(on)" : "(optional)"}</span>
              <ChevronDown size={16} className={`transition-transform ${showSensors ? "rotate-180" : ""}`} />
            </button>
            {showSensors && (
              <div className="grid grid-cols-2 gap-3 px-3 pb-3 fade-in">
                <label className="text-xs text-slate-600">Temperature (°C)
                  <input type="number" value={sensorTemp} onChange={(e) => setSensorTemp(Number(e.target.value))} className="mt-1 w-full border border-slate-300 rounded-lg p-2 text-sm" />
                </label>
                <label className="text-xs text-slate-600">Humidity (%)
                  <input type="number" value={sensorHumid} onChange={(e) => setSensorHumid(Number(e.target.value))} className="mt-1 w-full border border-slate-300 rounded-lg p-2 text-sm" />
                </label>
                <p className="col-span-2 text-[11px] text-slate-400">Combined with the image to detect heat-stress risk.</p>
              </div>
            )}
          </div>

          <button
            onClick={runInspection}
            disabled={loading || !file || !policyId}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold py-3 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            <ScanEye size={18} /> {loading ? `Analysing… ${elapsed}s` : "Run AI Inspection"}
          </button>
        </div>

        {/* ---------------- Result ---------------- */}
        <div className="lg:col-span-3 bg-slate-900 text-white p-5 rounded-2xl shadow-sm min-h-[560px]">
          {!result && !loading && !error && (
            <div className="h-full min-h-[520px] flex flex-col items-center justify-center text-center text-slate-400 gap-3">
              <ScanEye size={44} className="text-slate-600" />
              <p className="font-medium text-slate-300">No inspection yet</p>
              <p className="text-sm max-w-sm">Pick a policy and a photo (or a sample) and run the inspection. Hazards will be boxed directly on the image.</p>
            </div>
          )}

          {loading && (
            <div className="space-y-4">
              {previewUrl && (
                <div className="relative rounded-xl overflow-hidden border border-slate-700">
                  <img src={previewUrl} alt="" className="w-full opacity-60" />
                  <div className="scan-line absolute left-0 right-0 h-1 bg-blue-400 shadow-[0_0_24px_6px_rgba(96,165,250,0.6)]" />
                </div>
              )}
              <p className="text-sm text-slate-300 flex items-center gap-2"><Cpu size={16} className="animate-pulse text-blue-400" /> Gemini is inspecting PPE, unsafe acts, housekeeping and hygiene…</p>
            </div>
          )}

          {error && !loading && (
            <div className="p-4 bg-red-950/60 border border-red-800 rounded-xl text-sm text-red-200 space-y-1">
              <p className="font-bold">No verdict recorded</p>
              <p className="text-xs text-red-300">{error}</p>
              <p className="text-xs text-red-400">Fail-safe by design: nothing was stored and no action was taken. Please retry.</p>
            </div>
          )}

          {result && verdict && (
            <div className="space-y-4 fade-in">
              <div className={`${verdict.box} rounded-xl p-4 flex items-start gap-3`}>
                <verdict.icon size={28} className="shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-lg font-bold leading-tight">{verdict.title} · {result.severity}</p>
                  <p className="text-sm opacity-90">{verdict.note}</p>
                </div>
              </div>

              <p className="text-base font-medium text-slate-100">{result.summary_headline}</p>

              {previewUrl && <EvidenceViewer src={previewUrl} observations={result.observations || []} />}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <Fact label="Risk category" value={riskLabel(result)} />
                <Fact label="People detected" value={result.worker_count_detected ?? "–"} icon={<Users size={12} />} />
                <Fact label="Lighting" value={humanize(result.health_evaluation?.lighting_condition)} icon={<Sun size={12} />} />
                <Fact label="Ergonomics" value={humanize(result.health_evaluation?.ergonomics_status)} icon={<HeartPulse size={12} />} />
                <Fact label="Housekeeping (5S)" value={humanize(result.safety_perimeter_evaluation?.housekeeping_5s_status)} />
                <Fact label="Perimeter" value={humanize(result.safety_perimeter_evaluation?.barrier_and_apar_status)} icon={<ShieldCheck size={12} />} />
                <Fact label="Action" value={ACTION_LABEL[action!]} />
                <Fact label="Location" value={result.location || location} icon={<MapPin size={12} />} />
              </div>

              {result.recommendation && (
                <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 text-sm flex gap-2">
                  <Lightbulb size={16} className="text-amber-300 shrink-0 mt-0.5" />
                  <p className="text-slate-200">{result.recommendation}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-2 text-[11px] pt-1">
                {result.model_used && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-blue-950/70 border border-blue-800 text-blue-300">
                    <Cpu size={12} /> {result.model_used}{result.latency_ms ? ` · ${(result.latency_ms / 1000).toFixed(1)}s` : ""}
                  </span>
                )}
                <span className="px-2 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300">{result.data_retention_policy}</span>
                {result.status === "NON_COMPLIANT" && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-950/70 border border-amber-800 text-amber-300">
                    <BellRing size={12} /> {result.alerts_dispatched?.length ? `Alert sent via ${result.alerts_dispatched.join(" + ")}` : "No alert channel configured"}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="bg-slate-800/80 border border-slate-700 rounded-lg p-2">
      <p className="text-slate-400 flex items-center gap-1">{icon}{label}</p>
      <p className="font-semibold text-slate-100 mt-0.5 truncate">{value || "–"}</p>
    </div>
  );
}
