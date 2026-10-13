"use client";
import { useState } from "react";

export type GroundedObservation = {
  category: string;
  description: string;
  is_infraction: boolean;
  confidence: number;
  box_2d?: number[] | null;
};

// Gemini returns box_2d as [ymin, xmin, ymax, xmax] normalized to 0-1000, so boxes map to percentages directly.
export default function EvidenceViewer({ src, observations }: { src: string; observations: GroundedObservation[] }) {
  const [active, setActive] = useState<number | null>(null);
  const boxed = observations
    .map((obs, idx) => ({ obs, idx }))
    .filter(({ obs }) => Array.isArray(obs.box_2d) && obs.box_2d.length === 4);

  return (
    <div className="space-y-2">
      <div className="relative w-full overflow-hidden rounded-lg border border-slate-700 bg-black">
        <img src={src} alt="Inspection evidence" className="block w-full h-auto" />
        {boxed.map(({ obs, idx }, n) => {
          const [ymin, xmin, ymax, xmax] = obs.box_2d as number[];
          const color = obs.is_infraction ? "border-red-500" : "border-emerald-400";
          const chip = obs.is_infraction ? "bg-red-600" : "bg-emerald-600";
          const dim = active !== null && active !== idx;
          return (
            <div
              key={idx}
              onMouseEnter={() => setActive(idx)}
              onMouseLeave={() => setActive(null)}
              className={`absolute border-2 ${color} rounded-sm transition-opacity ${dim ? "opacity-25" : "opacity-100"}`}
              style={{
                top: `${ymin / 10}%`,
                left: `${xmin / 10}%`,
                height: `${(ymax - ymin) / 10}%`,
                width: `${(xmax - xmin) / 10}%`,
                boxShadow: obs.is_infraction ? "0 0 0 1px rgba(0,0,0,.4), 0 0 12px rgba(239,68,68,.6)" : undefined,
              }}
            >
              <span className={`absolute -top-5 left-0 ${chip} text-white text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap`}>
                #{n + 1} {obs.category} · {Math.round(obs.confidence * 100)}%
              </span>
            </div>
          );
        })}
      </div>
      {boxed.length > 0 && (
        <ol className="space-y-1 text-[11px]">
          {boxed.map(({ obs, idx }, n) => (
            <li
              key={idx}
              onMouseEnter={() => setActive(idx)}
              onMouseLeave={() => setActive(null)}
              className={`flex gap-2 p-1.5 rounded cursor-default ${active === idx ? "bg-slate-800" : ""}`}
            >
              <span className={`shrink-0 font-bold ${obs.is_infraction ? "text-red-400" : "text-emerald-400"}`}>#{n + 1}</span>
              <span className="text-slate-300">{obs.description}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
