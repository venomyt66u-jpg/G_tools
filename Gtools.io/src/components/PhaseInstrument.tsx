"use client";
import { useEffect, useRef, useState } from "react";

/**
 * SIGNATURE COMPONENT — the thing this app is remembered by.
 *
 * A mint is a *timing event*: phases open and close on a clock, and you fire into
 * a window. So the hero is a monitoring instrument — a horizontal time axis with
 * phase segments, a sweeping "now" playhead, and a live gas trace underneath,
 * styled like an oscilloscope / signal monitor. Everything is hand-built SVG.
 *
 * It is data-driven: pass real phases (with start/end unix seconds) and it lays
 * them out to scale on a window around "now". With no phases it shows an idle
 * sweep so the instrument always feels alive.
 */

export interface TimelinePhase {
  name: string;
  startTime: number | null; // unix seconds
  endTime: number | null;
  priceEth: string | null;
  requiresProof: boolean;
}

const PHASE_COLOR = (p: TimelinePhase, active: boolean) => {
  if (p.requiresProof) return active ? "var(--violet)" : "rgba(139,124,246,0.45)";
  return active ? "var(--amber)" : "rgba(245,166,35,0.4)";
};

export function PhaseInstrument({ phases, gasGwei }: { phases: TimelinePhase[]; gasGwei?: number | null }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const reduce = usePrefersReducedMotion();

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  // Build a time window. If we have dated phases, fit them with padding; else a
  // rolling 1-hour window centered on now.
  const dated = phases.filter((p) => p.startTime != null) as (TimelinePhase & { startTime: number })[];
  let windowStart: number, windowEnd: number;
  if (dated.length) {
    const starts = dated.map((p) => p.startTime);
    const ends = dated.map((p) => p.endTime ?? p.startTime + 3600);
    windowStart = Math.min(...starts, now) - 600;
    windowEnd = Math.max(...ends, now) + 600;
  } else {
    windowStart = now - 1800;
    windowEnd = now + 1800;
  }
  const span = Math.max(windowEnd - windowStart, 60);

  const W = 700, H = 200;
  const padL = 16, padR = 16, axisY = 120, trackH = 34;
  const innerW = W - padL - padR;
  const xOf = (t: number) => padL + ((t - windowStart) / span) * innerW;
  const nowX = xOf(now);

  // Gas trace points (synthetic-but-live ambient wave modulated by real gas value)
  const gas = gasGwei ?? null;
  const tracePts = buildTrace(W, padL, padR, now, gas, reduce);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" role="img"
      aria-label="Mint phase timeline and live gas">
      <defs>
        <linearGradient id="phaseFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.16" />
          <stop offset="100%" stopColor="white" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="gasGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--ice)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--ice)" stopOpacity="0" />
        </linearGradient>
        <filter id="soft"><feGaussianBlur stdDeviation="0.4" /></filter>
        <clipPath id="trackClip">
          <rect x={padL} y={axisY - trackH} width={innerW} height={trackH} rx="4" />
        </clipPath>
      </defs>

      {/* gauge-face baseline ticks */}
      {Array.from({ length: 29 }).map((_, i) => {
        const x = padL + (i / 28) * innerW;
        const major = i % 7 === 0;
        return <line key={i} x1={x} y1={axisY + 8} x2={x} y2={axisY + (major ? 18 : 13)}
          stroke="var(--line-2)" strokeWidth={major ? 1.2 : 0.8} />;
      })}
      <line x1={padL} y1={axisY + 8} x2={W - padR} y2={axisY + 8} stroke="var(--line)" strokeWidth="1" />

      {/* phase track background */}
      <rect x={padL} y={axisY - trackH} width={innerW} height={trackH} rx="4"
        fill="var(--bg-2)" stroke="var(--line)" />

      {/* phase segments */}
      <g clipPath="url(#trackClip)">
        {dated.map((p, i) => {
          const x0 = xOf(p.startTime);
          const x1 = xOf(p.endTime ?? p.startTime + 3600);
          const active = now >= p.startTime && now < (p.endTime ?? p.startTime + 3600);
          const w = Math.max(x1 - x0, 2);
          return (
            <g key={i}>
              <rect x={x0} y={axisY - trackH} width={w} height={trackH}
                fill={PHASE_COLOR(p, active)} opacity={active ? 0.9 : 0.5} />
              <rect x={x0} y={axisY - trackH} width={w} height={trackH} fill="url(#phaseFade)" />
              <line x1={x0} y1={axisY - trackH} x2={x0} y2={axisY} stroke="var(--bg-0)" strokeWidth="1" />
              {w > 46 && (
                <text x={x0 + 6} y={axisY - trackH + 14} fontSize="9.5" fontFamily="var(--font-mono)"
                  fill="var(--bg-0)" fontWeight="700" opacity="0.85">
                  {p.name.length > 14 ? p.name.slice(0, 13) + "…" : p.name}
                </text>
              )}
              {w > 46 && p.priceEth && (
                <text x={x0 + 6} y={axisY - 7} fontSize="9" fontFamily="var(--font-mono)"
                  fill="var(--bg-0)" opacity="0.7">{Number(p.priceEth).toFixed(3)}Ξ</text>
              )}
            </g>
          );
        })}
        {!dated.length && (
          <text x={W / 2} y={axisY - trackH / 2 + 3} textAnchor="middle" fontSize="10"
            fontFamily="var(--font-mono)" fill="var(--ink-2)">awaiting phase data — idle sweep</text>
        )}
      </g>

      {/* live gas trace */}
      <path d={tracePts.area} fill="url(#gasGrad)" />
      <path d={tracePts.line} fill="none" stroke="var(--ice)" strokeWidth="1.4"
        filter="url(#soft)" strokeLinejoin="round" strokeLinecap="round">
        {!reduce && <animate attributeName="opacity" values="0.85;1;0.85" dur="3s" repeatCount="indefinite" />}
      </path>

      {/* NOW playhead — the sweeping marker */}
      <g>
        <line x1={nowX} y1={axisY - trackH - 10} x2={nowX} y2={axisY + 20}
          stroke="var(--signal)" strokeWidth="1.5" />
        <path d={`M ${nowX - 5} ${axisY - trackH - 10} L ${nowX + 5} ${axisY - trackH - 10} L ${nowX} ${axisY - trackH - 3} Z`}
          fill="var(--signal)" />
        <circle cx={nowX} cy={axisY - trackH - 10} r="3" fill="var(--signal)">
          {!reduce && <animate attributeName="r" values="3;5;3" dur="1.4s" repeatCount="indefinite" />}
          {!reduce && <animate attributeName="opacity" values="1;0.4;1" dur="1.4s" repeatCount="indefinite" />}
        </circle>
        <text x={nowX} y={axisY - trackH - 16} textAnchor="middle" fontSize="8.5"
          fontFamily="var(--font-mono)" fill="var(--signal)" fontWeight="700">NOW</text>
      </g>

      {/* gas readout chip */}
      <g transform={`translate(${W - padR - 96}, 14)`}>
        <rect width="96" height="30" rx="6" fill="var(--bg-2)" stroke="var(--line)" />
        <circle cx="13" cy="15" r="3" fill="var(--ice)">
          {!reduce && <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />}
        </circle>
        <text x="24" y="12" fontSize="7" fontFamily="var(--font-mono)" fill="var(--ink-2)" letterSpacing="0.1em">GAS GWEI</text>
        <text x="24" y="24" fontSize="13" fontFamily="var(--font-mono)" fill="var(--ink-0)" fontWeight="700">
          {gas != null ? gas.toFixed(1) : "—.—"}
        </text>
      </g>
    </svg>
  );
}

function buildTrace(W: number, padL: number, padR: number, seed: number, gas: number | null, reduce: boolean) {
  const innerW = W - padL - padR;
  const baseY = 170;
  const amp = gas != null ? Math.min(2 + gas / 12, 16) : 6;
  const n = 60;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const x = padL + (i / n) * innerW;
    const phase = reduce ? 0 : (seed % 1000) / 160;
    const y = baseY - (Math.sin(i * 0.5 + phase) * amp * 0.5 + Math.sin(i * 0.17 + phase * 0.6) * amp * 0.5);
    pts.push([x, y]);
  }
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L ${padL + innerW} ${baseY + 14} L ${padL} ${baseY + 14} Z`;
  return { line, area };
}

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  const ref = useRef(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(m.matches); ref.current = m.matches;
    const h = () => setReduce(m.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);
  return reduce;
}
