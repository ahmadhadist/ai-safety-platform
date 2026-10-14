"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Radio, Play, Square, Camera, Film, Volume2, VolumeX, MapPin, ShieldCheck, OctagonX, AlertTriangle, Cpu, Clock, RotateCcw,
} from "lucide-react";
import { api } from "@/lib/api";
import { actionKey, riskLabel } from "@/lib/labels";

type Source = "camera" | "clip";
type LibraryItem = { name: string; title: string; kind: "image" | "video"; url: string };
type Box = { category: string; description: string; is_infraction: boolean; confidence: number; box_2d?: number[] | null };
type LogEntry = {
  at: Date; thumb: string; status: string; severity: string; action: string; headline: string;
  warning: string; risk: string; recorded: boolean; latency?: number;
};

const LANGUAGES = ["Bahasa Indonesia", "English", "Japanese", "Vietnamese", "Thai", "Malay", "Korean", "Hindi"];
const INTERVALS = [2, 5, 10];
const VOICE_COOLDOWN_MS = 20000;

const STATE = {
  idle: { label: "Not monitoring", box: "bg-slate-700", icon: Radio },
  NO_ACTION: { label: "All clear", box: "bg-emerald-600", icon: ShieldCheck },
  ISSUE_WARNING: { label: "Warning", box: "bg-amber-500", icon: AlertTriangle },
  STOP_WORK: { label: "STOP WORK", box: "bg-red-600 animate-pulse", icon: OctagonX },
};

// Short two-tone siren via WebAudio; plays instantly while the Gemini voice is being synthesised.
function playSiren(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  gain.gain.value = 0.08;
  [880, 660, 880, 660].forEach((f, i) => osc.frequency.setValueAtTime(f, ctx.currentTime + i * 0.22));
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.9);
}

export default function LiveMonitorPage() {
  const [source, setSource] = useState<Source>("clip");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [clips, setClips] = useState<LibraryItem[]>([]);
  const [clipName, setClipName] = useState("");
  const [location, setLocation] = useState("Live Camera 1");
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [interval, setIntervalS] = useState(5);
  const [voiceOn, setVoiceOn] = useState(true);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [last, setLast] = useState<any>(null);
  const [lastAt, setLastAt] = useState<Date | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState({ frames: 0, violations: 0, totalMs: 0 });
  const [speaking, setSpeaking] = useState(false);
  const [now, setNow] = useState(Date.now());

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runningRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastVoiceRef = useRef<{ at: number; key: string }>({ at: 0, key: "" });
  const clipUrlRef = useRef<string | null>(null);
  // The monitoring loop is long-lived; read settings through a ref so changes apply on the next frame.
  const settingsRef = useRef({ interval, language, location, voiceOn });
  settingsRef.current = { interval, language, location, voiceOn };

  useEffect(() => {
    api.get("/media/library").then((res) => {
      const vids = res.data.filter((i: LibraryItem) => i.kind === "video");
      setClips(vids);
      if (vids.length) setClipName(vids[0].name);
    }).catch(() => {});
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(t); stopEverything(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listCameras = async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    const cams = all.filter((d) => d.kind === "videoinput");
    setDevices(cams);
    if (!deviceId && cams[0]) setDeviceId(cams[0].deviceId);
  };

  const stopEverything = () => {
    runningRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (clipUrlRef.current) { URL.revokeObjectURL(clipUrlRef.current); clipUrlRef.current = null; }
  };

  const startSource = async () => {
    const video = videoRef.current!;
    if (source === "camera") {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1280 } } : { facingMode: "environment", width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      video.srcObject = stream;
      listCameras();
    } else {
      const clip = clips.find((c) => c.name === clipName);
      if (!clip) throw new Error("Add a video to the demo library first.");
      // Fetch as a same-origin blob so frames can be drawn to the canvas without CORS tainting.
      const blob = await (await fetch(clip.url)).blob();
      clipUrlRef.current = URL.createObjectURL(blob);
      video.srcObject = null;
      video.src = clipUrlRef.current;
      video.loop = true;
    }
    video.muted = true;
    await video.play();
  };

  const captureFrame = (): Promise<{ blob: Blob; thumb: string } | null> => {
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return Promise.resolve(null);
    const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    const thumb = canvas.toDataURL("image/jpeg", 0.5);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b ? { blob: b, thumb } : null), "image/jpeg", 0.8));
  };

  const speak = useCallback(async (text: string, critical: boolean, force = false) => {
    const { voiceOn: on, language: lang } = settingsRef.current;
    if ((!on && !force) || !text) return;
    const key = text.slice(0, 40);
    if (Date.now() - lastVoiceRef.current.at < VOICE_COOLDOWN_MS) return;
    lastVoiceRef.current = { at: Date.now(), key };
    const ctx = audioCtxRef.current;
    if (ctx && critical) playSiren(ctx);
    try {
      setSpeaking(true);
      const res = await api.post("/voice/warning", { text, language: lang }, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); setSpeaking(false); };
      await audio.play();
    } catch {
      setSpeaking(false);
    }
  }, []);

  const replay = async (text: string) => {
    lastVoiceRef.current = { at: 0, key: "" };
    await speak(text, false, true);
  };

  const loop = async () => {
    while (runningRef.current) {
      const frame = await captureFrame();
      if (frame) {
        setBusy(true);
        const form = new FormData();
        form.append("image", frame.blob, "frame.jpg");
        form.append("policy_id", "auto");
        form.append("location", settingsRef.current.location);
        form.append("mode", "live");
        form.append("voice_language", settingsRef.current.language);
        try {
          const started = performance.now();
          const res = await api.post("/inspections/audit", form, { headers: { "Content-Type": "multipart/form-data" } });
          const r = res.data;
          const ms = Math.round(performance.now() - started);
          setLast(r);
          setLastAt(new Date());
          setError("");
          const bad = r.status === "NON_COMPLIANT";
          setStats((s) => ({ frames: s.frames + 1, violations: s.violations + (bad ? 1 : 0), totalMs: s.totalMs + ms }));
          if (bad) {
            setLog((l) => [{
              at: new Date(), thumb: frame.thumb, status: r.status, severity: r.severity, action: r.enforcement_action,
              headline: r.summary_headline, warning: r.spoken_warning, risk: riskLabel(r), recorded: !r.live_deduplicated, latency: ms,
            }, ...l].slice(0, 30));
            speak(r.spoken_warning, actionKey(r.enforcement_action) === "STOP_WORK");
          }
        } catch (e: any) {
          setError(e?.response?.data?.detail || "Frame skipped: AI temporarily unavailable.");
        }
        setBusy(false);
      }
      await new Promise((r) => setTimeout(r, settingsRef.current.interval * 1000));
    }
  };

  const start = async () => {
    setError("");
    try {
      // Unlock audio playback inside the click gesture (browsers block autoplay otherwise).
      audioCtxRef.current = audioCtxRef.current || new AudioContext();
      await audioCtxRef.current.resume();
      await startSource();
      runningRef.current = true;
      setRunning(true);
      setLast(null);
      loop();
    } catch (e: any) {
      setError(e?.message || "Could not start the video source. Allow camera access and try again.");
      stopEverything();
    }
  };

  const stop = () => {
    stopEverything();
    setRunning(false);
    setBusy(false);
    if (videoRef.current) { videoRef.current.pause(); }
  };

  const action = last ? actionKey(last.enforcement_action) : null;
  const state = running ? (action ? STATE[action] : STATE.idle) : STATE.idle;
  const boxes: Box[] = (last?.observations || []).filter((o: Box) => Array.isArray(o.box_2d) && o.box_2d.length === 4);
  const age = lastAt ? Math.round((now - lastAt.getTime()) / 1000) : null;

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in">
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Radio className="text-red-500" size={30} /> Live Monitor
          </h2>
          <p className="text-slate-500 mt-1">
            Continuous AI watch over a camera. Hazards are boxed in real time and announced on the site loudspeaker in the workers&apos; language.
          </p>
        </div>
        {!running ? (
          <button onClick={start} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-xl font-semibold shadow-sm transition-colors">
            <Play size={18} /> Start monitoring
          </button>
        ) : (
          <button onClick={stop} className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-3 rounded-xl font-semibold shadow-sm transition-colors">
            <Square size={16} /> Stop
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ---------- Feed ---------- */}
        <div className="lg:col-span-2 space-y-3">
          <div className={`${state.box} text-white rounded-xl px-4 py-3 flex items-center justify-between transition-colors`}>
            <span className="flex items-center gap-2 text-lg font-bold"><state.icon size={22} /> {state.label}{last && running && action !== "NO_ACTION" ? ` · ${last.severity}` : ""}</span>
            <span className="text-xs opacity-90 flex items-center gap-3">
              {busy && <span className="flex items-center gap-1"><Cpu size={13} className="animate-pulse" /> analysing…</span>}
              {speaking && <span className="flex items-center gap-1"><Volume2 size={13} className="animate-pulse" /> announcing</span>}
              {age !== null && running && <span className="flex items-center gap-1"><Clock size={13} /> {age}s ago</span>}
            </span>
          </div>

          <div className="relative rounded-xl overflow-hidden bg-black border border-slate-800 aspect-video">
            <video ref={videoRef} className="w-full h-full object-contain" playsInline muted />
            {!running && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Radio size={40} className="text-slate-600" />
                <p className="text-sm">Choose a source and press <b className="text-slate-200">Start monitoring</b></p>
              </div>
            )}
            {running && boxes.map((o, i) => {
              const [ymin, xmin, ymax, xmax] = o.box_2d as number[];
              // Stack labels of boxes that start at nearly the same corner so they don't overprint each other.
              const stack = boxes.slice(0, i).filter((p) => Math.abs(p.box_2d![0] - ymin) < 40 && Math.abs(p.box_2d![1] - xmin) < 120).length;
              return (
                <div key={i} className={`absolute border-2 rounded-sm transition-all duration-500 ${o.is_infraction ? "border-red-500" : "border-emerald-400"}`}
                  style={{ top: `${ymin / 10}%`, left: `${xmin / 10}%`, height: `${(ymax - ymin) / 10}%`, width: `${(xmax - xmin) / 10}%` }}>
                  <span style={{ top: -20 - stack * 18 }} className={`absolute left-0 text-[10px] font-bold px-1.5 py-0.5 rounded text-white whitespace-nowrap ${o.is_infraction ? "bg-red-600" : "bg-emerald-600"}`}>
                    {o.category}
                  </span>
                </div>
              );
            })}
            {running && (
              <span className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 text-white text-xs font-semibold px-2 py-1 rounded">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> LIVE · {location}
              </span>
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {last?.spoken_warning && running && action !== "NO_ACTION" && (
            <div className="p-3 rounded-xl bg-slate-900 text-white text-sm flex items-start gap-2">
              <Volume2 size={16} className="text-amber-300 shrink-0 mt-0.5" />
              <span><span className="text-slate-400">Loudspeaker ({language}):</span> “{last.spoken_warning}”</span>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Frames analysed" value={stats.frames} />
            <Stat label="Frames with violations" value={stats.violations} />
            <Stat label="Avg. response" value={stats.frames ? `${(stats.totalMs / stats.frames / 1000).toFixed(1)} s` : "–"} />
          </div>
        </div>

        {/* ---------- Controls + log ---------- */}
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl">
              {(["clip", "camera"] as Source[]).map((s) => (
                <button key={s} disabled={running} onClick={() => { setSource(s); if (s === "camera") listCameras().catch(() => {}); }}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium disabled:opacity-60 ${source === s ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>
                  {s === "camera" ? <Camera size={15} /> : <Film size={15} />} {s === "camera" ? "Camera" : "Demo clip"}
                </button>
              ))}
            </div>

            {source === "clip" ? (
              <Field label="Simulated camera feed (from demo library)">
                <select disabled={running} value={clipName} onChange={(e) => setClipName(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white">
                  {clips.length === 0 && <option>No videos in the library</option>}
                  {clips.map((c) => <option key={c.name} value={c.name}>{c.title}</option>)}
                </select>
              </Field>
            ) : (
              <Field label="Camera">
                <select disabled={running} value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white">
                  {devices.length === 0 && <option value="">Default camera (allow access on start)</option>}
                  {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
                </select>
              </Field>
            )}

            <Field label="Location / camera name">
              <div className="relative">
                <MapPin size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input disabled={running} value={location} onChange={(e) => setLocation(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 pl-8 text-sm" />
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Voice language">
                <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white">
                  {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
                </select>
              </Field>
              <Field label="Check every">
                <select value={interval} onChange={(e) => setIntervalS(Number(e.target.value))} className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white">
                  {INTERVALS.map((s) => <option key={s} value={s}>{s} s</option>)}
                </select>
              </Field>
            </div>

            <button onClick={() => setVoiceOn(!voiceOn)} className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm border ${voiceOn ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-500"}`}>
              {voiceOn ? <Volume2 size={16} /> : <VolumeX size={16} />} Loudspeaker warnings {voiceOn ? "on" : "off"}
            </button>
            <p className="text-[11px] text-slate-400">Safe frames are never stored. A repeated hazard at the same spot is recorded and escalated once per minute.</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-semibold text-slate-900 mb-3 text-sm">Detections</h3>
            {log.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">No hazards detected yet.</p>}
            <ul className="space-y-2 max-h-[420px] overflow-y-auto">
              {log.map((e, i) => {
                const a = actionKey(e.action);
                return (
                  <li key={i} className="flex gap-2 items-start fade-in">
                    <img src={e.thumb} alt="" className="w-16 h-10 object-cover rounded border border-slate-200 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-800 line-clamp-2">{e.headline}</p>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <span className={a === "STOP_WORK" ? "text-red-600 font-semibold" : "text-amber-600 font-semibold"}>{e.severity}</span>
                        · {e.risk} · {e.at.toLocaleTimeString()} {e.recorded ? "· recorded" : "· repeat"}
                      </p>
                    </div>
                    {e.warning && (
                      <button onClick={() => replay(e.warning)} title="Replay announcement" className="p-1 text-slate-400 hover:text-blue-600 shrink-0">
                        <RotateCcw size={14} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3">
      <p className="text-xl font-bold text-slate-900 tabular-nums">{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}
