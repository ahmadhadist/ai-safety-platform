"use client";
import { useEffect, useRef, useState } from "react";
import {
  UploadCloud, CheckCircle2, OctagonX, AlertTriangle, ScanEye, HeartPulse, Sun, ShieldCheck, Cpu, BellRing,
  MapPin, Thermometer, ChevronDown, Image as ImageIcon, Lightbulb, Users, Sparkles, Video, EyeOff, Library, Save, Check,
} from "lucide-react";
import { api } from "@/lib/api";
import EvidenceViewer from "@/components/EvidenceViewer";
import { ACTION_LABEL, actionKey, humanize, riskLabel } from "@/lib/labels";

type Policy = { id: string; title: string; permit_type: string; dynamic_rules: any };

type Mode = "photo" | "video";
const AUTO = "auto";

const SAMPLES: Record<Mode, { file: string; label: string; location: string }[]> = {
  photo: [
    { file: "/samples/demo_violation_welding.jpg", label: "Hot work", location: "Welding Bay A" },
    { file: "/samples/ladder_no_harness.jpg", label: "Ladder", location: "Building C - Level 2" },
    { file: "/samples/electrical_panel.jpg", label: "Electrical", location: "Substation B" },
    { file: "/samples/welding_full_ppe.jpg", label: "Safe welder", location: "Welding Bay A" },
  ],
  video: [
    { file: "/samples/cctv_warehouse_forklift.mp4", label: "Forklift aisle", location: "Warehouse Dock 2" },
    { file: "/samples/cctv_scaffold_edge.mp4", label: "Scaffold edge", location: "Scaffold Zone - Unit 4" },
  ],
};

type LibraryItem = { name: string; title: string; kind: "image" | "video"; url: string; size: number };

// Suggested location for the seeded demo media (matched on file-name prefix).
const LOCATION_HINTS: [RegExp, string][] = [
  [/forklift|warehouse/i, "Warehouse Dock 2"],
  [/scaffold|ladder|height/i, "Scaffold Zone - Unit 4"],
  [/electric|panel/i, "Substation B"],
  [/weld|hot.?work|grind/i, "Welding Bay A"],
];

const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const LOCATIONS = ["Welding Bay A", "Scaffold Zone - Unit 4", "Assembly Line 1", "Warehouse Dock 2", "Substation B", "Tank Farm - T3"];

const VERDICT = {
  STOP_WORK: { title: "Stop Work Order", note: "Imminent danger detected. Work must stop until the hazard is corrected.", box: "bg-red-600", icon: OctagonX },
  ISSUE_WARNING: { title: "Warning Issued", note: "Violation found. Supervisor notified for correction and coaching.", box: "bg-amber-500", icon: AlertTriangle },
  NO_ACTION: { title: "Compliant", note: "No hazards found. Photo auto-purged to protect worker privacy.", box: "bg-emerald-600", icon: CheckCircle2 },
};

export default function SandboxPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [mode, setMode] = useState<Mode>("photo");
  const [policyId, setPolicyId] = useState(AUTO);
  const [location, setLocation] = useState(LOCATIONS[0]);
  const [file, setFile] = useState<File | null>(null);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [libraryItem, setLibraryItem] = useState<LibraryItem | null>(null);
  const [savingToLibrary, setSavingToLibrary] = useState(false);
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
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    api.get("/policies/templates").then((res) => {
      setPolicies(res.data);
    }).catch(console.error);
    loadLibrary();
  }, []);

  const loadLibrary = () => api.get("/media/library").then((res) => setLibrary(res.data)).catch(() => setLibrary([]));

  useEffect(() => {
    if (!file) return setPreviewUrl(libraryItem ? libraryItem.url : null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, libraryItem]);

  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [loading]);

  const selectedPolicy = policies.find((p) => p.id === policyId);

  const switchMode = (m: Mode) => {
    setMode(m);
    setFile(null);
    setLibraryItem(null);
    setResult(null);
    setError("");
  };

  const pickFile = (f: File | null | undefined) => {
    if (!f || !(mode === "photo" ? /^image\//.test(f.type) : /^video\/|\.(mp4|mov|webm)$/i.test(f.type || f.name))) return;
    setFile(f);
    setLibraryItem(null);
    setResult(null);
    setError("");
  };

  const selectLibraryItem = (item: LibraryItem) => {
    setFile(null);
    setLibraryItem(item);
    setResult(null);
    setError("");
    setPolicyId(AUTO);
    const hint = LOCATION_HINTS.find(([re]) => re.test(item.name));
    if (hint) setLocation(hint[1]);
  };

  const saveToLibrary = async () => {
    if (!file) return;
    setSavingToLibrary(true);
    const form = new FormData();
    form.append("file", file);
    try {
      await api.post("/media/library", form, { headers: { "Content-Type": "multipart/form-data" } });
      await loadLibrary();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Could not save to the library.");
    }
    setSavingToLibrary(false);
  };

  const loadSample = async (s: { file: string; location: string }) => {
    const blob = await (await fetch(s.file)).blob();
    pickFile(new File([blob], s.file.split("/").pop()!, { type: blob.type || (mode === "photo" ? "image/jpeg" : "video/mp4") }));
    setPolicyId(AUTO);
    setLocation(s.location);
  };

  const runInspection = async () => {
    if (!file && !libraryItem) return;
    setLoading(true);
    setError("");
    setResult(null);
    const formData = new FormData();
    if (libraryItem) formData.append("library_object", libraryItem.name);
    else if (file) formData.append(mode === "photo" ? "image" : "video", file);
    formData.append("policy_id", policyId);
    formData.append("location", location);
    if (mode === "photo" && showSensors) {
      formData.append("sensor_temperature_c", String(sensorTemp));
      formData.append("sensor_humidity_pct", String(sensorHumid));
    }
    try {
      const res = await api.post(mode === "photo" ? "/inspections/audit" : "/inspections/video", formData, { headers: { "Content-Type": "multipart/form-data" } });
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
          Upload a field photo or a CCTV clip. Gemini recognises the work, applies the right safety policy, pinpoints every hazard and escalates instantly.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ---------------- Input ---------------- */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-5 h-fit">
          <div>
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl mb-4">
              {(["photo", "video"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className={`flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${mode === m ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
                >
                  {m === "photo" ? <ImageIcon size={16} /> : <Video size={16} />} {m === "photo" ? "Photo" : "CCTV video"}
                </button>
              ))}
            </div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">1 · Safety policy</label>
            <select
              value={policyId}
              onChange={(e) => setPolicyId(e.target.value)}
              className="mt-1.5 w-full border border-slate-300 rounded-xl p-2.5 text-sm bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
            >
              <option value={AUTO}>✨ Auto-detect from the scene (recommended)</option>
              {policies.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            {policyId === AUTO && (
              <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1"><Sparkles size={12} className="text-violet-500" /> Gemini identifies the activity and picks the matching policy.</p>
            )}
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
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">3 · {mode === "photo" ? "Photo" : "CCTV clip (max 25 MB)"}</label>
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
                  {mode === "photo"
                    ? <img src={previewUrl} alt="Selected" className="w-full max-h-56 object-cover" />
                    : <video src={previewUrl} className="w-full max-h-56 object-cover" muted />}
                  <span className="absolute bottom-2 right-2 text-[11px] bg-black/60 text-white px-2 py-0.5 rounded">Click to change</span>
                </div>
              ) : (
                <div className="p-8 flex flex-col items-center text-center">
                  <UploadCloud className="w-10 h-10 text-blue-500 mb-2" />
                  <p className="text-sm font-medium text-slate-700">Drop a {mode === "photo" ? "photo" : "video clip"} here or click to browse</p>
                  <p className="text-xs text-slate-400 mt-1">{mode === "photo" ? "JPG or PNG" : "MP4, MOV or WebM · 10-60 s works best"}</p>
                </div>
              )}
              <input type="file" className="hidden" ref={fileInputRef} accept={mode === "photo" ? "image/*" : "video/*"} onChange={(e) => pickFile(e.target.files?.[0])} />
            </div>
            {file && (
              <button
                onClick={saveToLibrary}
                disabled={savingToLibrary}
                className="mt-2 text-xs flex items-center gap-1.5 text-slate-500 hover:text-blue-600 disabled:opacity-50"
              >
                <Save size={13} /> {savingToLibrary ? "Saving…" : "Save this file to the demo library"}
              </button>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Library size={13} /> Demo library <span className="normal-case font-normal text-slate-400">· stored in Cloud Storage</span>
            </label>
            {library.filter((i) => i.kind === (mode === "photo" ? "image" : "video")).length > 0 ? (
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {library.filter((i) => i.kind === (mode === "photo" ? "image" : "video")).map((item) => {
                  const active = libraryItem?.name === item.name;
                  return (
                    <button
                      key={item.name}
                      onClick={() => selectLibraryItem(item)}
                      title={item.title}
                      className={`relative rounded-lg overflow-hidden border-2 text-left transition-all ${active ? "border-blue-500 ring-2 ring-blue-100" : "border-transparent hover:border-slate-300"}`}
                    >
                      {item.kind === "image"
                        ? <img src={item.url} alt={item.title} className="w-full h-16 object-cover" loading="lazy" />
                        : <video src={`${item.url}#t=1`} className="w-full h-16 object-cover bg-black" preload="metadata" muted />}
                      {active && <span className="absolute top-1 right-1 bg-blue-600 text-white rounded-full p-0.5"><Check size={10} /></span>}
                      <span className="block text-[10px] text-slate-600 truncate px-1 py-0.5 bg-white">{item.title}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-500">
                <ImageIcon size={14} /> Try a sample:
                {SAMPLES[mode].map((s) => (
                  <button key={s.file} onClick={() => loadSample(s)} className="px-2 py-1 rounded-lg border border-slate-200 hover:border-blue-400 hover:text-blue-600 transition-colors">
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {mode === "photo" && <div className="border border-slate-200 rounded-xl">
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
          </div>}

          <button
            onClick={runInspection}
            disabled={loading || (!file && !libraryItem)}
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
                  {mode === "photo" ? <img src={previewUrl} alt="" className="w-full opacity-60" /> : <video src={previewUrl} className="w-full opacity-60" muted autoPlay loop />}
                  <div className="scan-line absolute left-0 right-0 h-1 bg-blue-400 shadow-[0_0_24px_6px_rgba(96,165,250,0.6)]" />
                </div>
              )}
              <p className="text-sm text-slate-300 flex items-center gap-2"><Cpu size={16} className="animate-pulse text-blue-400" /> {mode === "photo" ? "Gemini is inspecting PPE, unsafe acts, housekeeping and hygiene…" : "Gemini is watching the clip and building a violation timeline…"}</p>
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
              <p className="text-xs text-slate-400 -mt-2 flex flex-wrap items-center gap-1.5">
                {result.policy_auto_detected && <Sparkles size={12} className="text-violet-400" />}
                Activity: <span className="text-slate-200">{result.detected_activity}</span> · Policy {result.policy_auto_detected ? "auto-selected" : "applied"}: <span className="text-slate-200">{result.policy_title}</span>
              </p>

              {mode === "photo" && previewUrl && <EvidenceViewer src={previewUrl} observations={result.observations || []} />}

              {mode === "video" && previewUrl && (
                <div className="space-y-2">
                  <video ref={videoRef} src={previewUrl} controls className="w-full rounded-xl border border-slate-700 bg-black" />
                  <div className="relative h-2 rounded-full bg-slate-700">
                    {(result.events || []).map((e: any, i: number) => {
                      const dur = videoRef.current?.duration || Math.max(...result.events.map((x: any) => x.end_seconds), 1);
                      return (
                        <button
                          key={i}
                          title={e.description}
                          onClick={() => { if (videoRef.current) { videoRef.current.currentTime = e.start_seconds; videoRef.current.play(); } }}
                          className={`absolute top-0 h-2 rounded-full ${e.severity === "CRITICAL" ? "bg-red-500" : e.severity === "MEDIUM" ? "bg-amber-400" : "bg-yellow-300"}`}
                          style={{ left: `${(e.start_seconds / dur) * 100}%`, width: `${Math.max(2, ((e.end_seconds - e.start_seconds) / dur) * 100)}%` }}
                        />
                      );
                    })}
                  </div>
                  <ol className="space-y-1">
                    {(result.events || []).map((e: any, i: number) => (
                      <li key={i}>
                        <button
                          onClick={() => { if (videoRef.current) { videoRef.current.currentTime = e.start_seconds; videoRef.current.play(); } }}
                          className="w-full text-left flex gap-3 p-2 rounded-lg hover:bg-slate-800 text-xs"
                        >
                          <span className="font-mono text-blue-300 shrink-0">{fmtTime(e.start_seconds)}–{fmtTime(e.end_seconds)}</span>
                          <span className={`shrink-0 font-semibold ${e.severity === "CRITICAL" ? "text-red-400" : "text-amber-300"}`}>{e.severity}</span>
                          <span className="text-slate-300">{e.description}</span>
                        </button>
                      </li>
                    ))}
                    {!result.events?.length && <li className="text-xs text-slate-400 p-2">No violations found in this clip.</li>}
                  </ol>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <Fact label="Risk category" value={riskLabel(result)} />
                <Fact label="People detected" value={result.worker_count_detected ?? result.max_workers_visible ?? "–"} icon={<Users size={12} />} />
                {mode === "photo" ? (
                  <>
                    <Fact label="Lighting" value={humanize(result.health_evaluation?.lighting_condition)} icon={<Sun size={12} />} />
                    <Fact label="Ergonomics" value={humanize(result.health_evaluation?.ergonomics_status)} icon={<HeartPulse size={12} />} />
                    <Fact label="Housekeeping (5S)" value={humanize(result.safety_perimeter_evaluation?.housekeeping_5s_status)} />
                    <Fact label="Perimeter" value={humanize(result.safety_perimeter_evaluation?.barrier_and_apar_status)} icon={<ShieldCheck size={12} />} />
                  </>
                ) : (
                  <>
                    <Fact label="Violations in clip" value={result.events?.length ?? 0} />
                    <Fact label="First violation at" value={result.events?.length ? fmtTime(result.events[0].start_seconds) : "–"} />
                    <Fact label="Severity" value={result.severity} />
                    <Fact label="Policy" value={result.policy_title} />
                  </>
                )}
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
                {result.data_retention_policy && <span className="px-2 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300">{result.data_retention_policy}</span>}
                {result.faces_blurred > 0 && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-violet-950/70 border border-violet-800 text-violet-300">
                    <EyeOff size={12} /> {result.faces_blurred} face{result.faces_blurred > 1 ? "s" : ""} blurred in stored evidence
                  </span>
                )}
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
