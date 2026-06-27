"use client";
import { motion } from "framer-motion";

export type SpeedMode = "slow_extra" | "slow" | "standard" | "fast" | "instant";

interface ModeInfo {
  key: SpeedMode;
  label: string;
  sub: string;
  // sweep angle on the gauge, -90 (left) .. +90 (right)
  angle: number;
  color: string;
}

const MODES: ModeInfo[] = [
  { key: "slow_extra", label: "Glacial", sub: "lowest fee", angle: -78, color: "#4DA6FF" },
  { key: "slow", label: "Slow", sub: "cheap", angle: -39, color: "#6CC2E0" },
  { key: "standard", label: "Standard", sub: "balanced", angle: 0, color: "#EAEEF5" },
  { key: "fast", label: "Fast", sub: "priority", angle: 39, color: "#F5A623" },
  { key: "instant", label: "Instant", sub: "max priority", angle: 78, color: "#F0563A" },
];

export interface GaugeEstimate {
  maxFeeGwei?: number;       // the ceiling (max fee per gas)
  expectedGwei?: number;     // what you'll likely actually pay (base + tip)
  expectedCostEth?: string;  // expected total in ETH
  maxCostEth?: string;       // worst-case total in ETH
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export default function GasGauge({
  value, onChange, estimate,
}: {
  value: SpeedMode;
  onChange: (m: SpeedMode) => void;
  estimate?: GaugeEstimate;
}) {
  const active = MODES.find((m) => m.key === value) ?? MODES[2];
  const cx = 130, cy = 120, r = 92;

  // Arc background path (semicircle from -90 to +90, drawn as top half)
  const start = polar(cx, cy, r, -90);
  const end = polar(cx, cy, r, 90);
  const arc = `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`;

  // Needle target
  const needle = polar(cx, cy, r - 14, active.angle);

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-1">
        <span className="eyebrow">Mint speed</span>
        <span className="eyebrow" style={{ color: active.color }}>{active.label}</span>
      </div>

      <div className="flex flex-col items-center">
        <svg viewBox="0 0 260 168" className="w-full max-w-[300px]" role="img" aria-label={`Gas gauge set to ${active.label}`}>
          <defs>
            <linearGradient id="gaugeArc" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4DA6FF" />
              <stop offset="50%" stopColor="#EAEEF5" />
              <stop offset="100%" stopColor="#F0563A" />
            </linearGradient>
          </defs>

          {/* faint full arc track */}
          <path d={arc} fill="none" stroke="#232A38" strokeWidth="14" strokeLinecap="round" />
          {/* colored arc */}
          <path d={arc} fill="none" stroke="url(#gaugeArc)" strokeWidth="3" strokeLinecap="round" opacity="0.85" />

          {/* tick marks at each mode */}
          {MODES.map((m) => {
            const a = polar(cx, cy, r + 10, m.angle);
            const b = polar(cx, cy, r + 2, m.angle);
            const on = m.key === value;
            return (
              <line key={m.key} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={on ? m.color : "#2E3749"} strokeWidth={on ? 3 : 1.5} strokeLinecap="round" />
            );
          })}

          {/* needle */}
          <motion.line
            x1={cx} y1={cy} x2={needle.x} y2={needle.y}
            stroke={active.color} strokeWidth="3" strokeLinecap="round"
            initial={false}
            animate={{ x2: needle.x, y2: needle.y }}
            transition={{ type: "spring", stiffness: 120, damping: 14 }}
          />
          <circle cx={cx} cy={cy} r="7" fill="#161B26" stroke={active.color} strokeWidth="2" />

          {/* center readout: expected gwei */}
          <text x={cx} y={cy + 34} textAnchor="middle" className="mono" fill="#EAEEF5" fontSize="22" fontWeight="700">
            {estimate?.expectedGwei != null ? estimate.expectedGwei.toFixed(1) : "—"}
          </text>
          <text x={cx} y={cy + 48} textAnchor="middle" className="mono" fill="#5C6678" fontSize="9" letterSpacing="2">
            GWEI EXPECTED
          </text>
        </svg>

        {/* mode buttons */}
        <div className="grid grid-cols-5 gap-1.5 w-full mt-3">
          {MODES.map((m) => {
            const on = m.key === value;
            return (
              <button key={m.key} onClick={() => onChange(m.key)}
                className="rounded-lg py-2 px-1 border transition-all text-center"
                style={{
                  borderColor: on ? m.color : "var(--line)",
                  background: on ? `${m.color}14` : "transparent",
                }}>
                <div className="mono text-[10px] font-bold" style={{ color: on ? m.color : "var(--ink-1)" }}>{m.label}</div>
                <div className="mono text-[8px] mt-0.5" style={{ color: "var(--ink-2)" }}>{m.sub}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* cost panel: expected vs max — the thing you asked for explicitly */}
      <div className="grid grid-cols-2 gap-2 mt-4">
        <div className="panel-raised p-3">
          <div className="eyebrow" style={{ color: "var(--signal)" }}>Likely cost</div>
          <div className="mono text-lg font-bold mt-1">{estimate?.expectedCostEth ?? "—"} <span className="text-xs" style={{ color: "var(--ink-2)" }}>ETH</span></div>
          <div className="mono text-[9px]" style={{ color: "var(--ink-2)" }}>{estimate?.expectedGwei != null ? `~${estimate.expectedGwei.toFixed(1)} gwei` : "estimate to see"}</div>
        </div>
        <div className="panel-raised p-3">
          <div className="eyebrow" style={{ color: "var(--alert)" }}>Max (worst case)</div>
          <div className="mono text-lg font-bold mt-1">{estimate?.maxCostEth ?? "—"} <span className="text-xs" style={{ color: "var(--ink-2)" }}>ETH</span></div>
          <div className="mono text-[9px]" style={{ color: "var(--ink-2)" }}>{estimate?.maxFeeGwei != null ? `cap ${estimate.maxFeeGwei.toFixed(1)} gwei` : "max fee cap"}</div>
        </div>
      </div>
    </div>
  );
}

export { MODES as SPEED_MODES };
