"use client";
import { motion } from "framer-motion";
import clsx from "clsx";

/**
 * UI primitives aligned to the "cold storage" design system in globals.css.
 * Panels use .panel / .panel-raised; accents are CSS vars (var(--amber) etc.).
 */

export function Panel({ children, className, title, accent, right }: {
  children: React.ReactNode; className?: string; title?: string; accent?: string; right?: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={clsx("panel p-5 relative", className)}
    >
      {title && (
        <header className="flex items-center gap-2.5 mb-4">
          <span className="statusdot" style={{ background: accent || "var(--amber)" }} />
          <h2 className="eyebrow" style={{ color: "var(--ink-1)" }}>{title}</h2>
          {right && <div className="ml-auto">{right}</div>}
        </header>
      )}
      {children}
    </motion.section>
  );
}

export function Btn({ children, onClick, variant = "default", disabled, className, type }: {
  children: React.ReactNode; onClick?: () => void; variant?: "default" | "primary" | "danger" | "ghost"; disabled?: boolean; className?: string; type?: "button" | "submit";
}) {
  const base = "mono text-[11px] tracking-wide px-3.5 py-2 rounded-lg border transition-all duration-150 disabled:opacity-35 disabled:cursor-not-allowed active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
  const variants: Record<string, string> = {
    default: "border-[var(--line-2)] text-[var(--ink-0)] bg-[var(--bg-2)] hover:bg-[var(--line)] hover:border-[var(--ink-2)]",
    primary: "border-[var(--amber)] text-[var(--bg-0)] font-bold bg-[var(--amber)] hover:brightness-110 shadow-[0_0_24px_-8px_var(--amber)]",
    danger: "border-[rgba(240,86,58,0.4)] text-[var(--alert)] bg-[rgba(240,86,58,0.08)] hover:bg-[rgba(240,86,58,0.16)]",
    ghost: "border-transparent text-[var(--ink-1)] bg-transparent hover:bg-[var(--bg-2)] hover:text-[var(--ink-0)]",
  };
  return (
    <button type={type || "button"} onClick={onClick} disabled={disabled}
      className={clsx(base, variants[variant], className)} style={{ outlineColor: "var(--amber)" }}>
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props}
      className={clsx("w-full bg-[var(--bg-0)] border border-[var(--line)] rounded-lg px-3 py-2 text-sm mono text-[var(--ink-0)] outline-none transition-colors placeholder:text-[var(--ink-2)] focus:border-[var(--amber)] focus:ring-1 focus:ring-[var(--amber)]", props.className)} />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select {...props}
      className={clsx("w-full bg-[var(--bg-0)] border border-[var(--line)] rounded-lg px-3 py-2 text-sm mono text-[var(--ink-0)] outline-none focus:border-[var(--amber)]", props.className)}>
      {props.children}
    </select>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="eyebrow block mb-1.5">{label}</span>
      {children}
      {hint && <span className="mono text-[10px] mt-1 block" style={{ color: "var(--ink-2)" }}>{hint}</span>}
    </label>
  );
}

const dot: Record<string, string> = {
  confirmed: "var(--signal)", success: "var(--signal)", done: "var(--signal)",
  pending: "var(--ice)", failed: "var(--alert)", skipped: "var(--ink-2)",
};
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 mono text-[10px] uppercase" style={{ color: dot[status] || "var(--ink-2)" }}>
      <span className="statusdot" style={{ background: dot[status] || "var(--ink-2)" }} />
      {status}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("skeleton", className)} />;
}

export function Stat({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="panel-raised px-3 py-2.5">
      <div className="eyebrow">{label}</div>
      <div className="mono text-sm mt-1 truncate" style={{ color: color || "var(--ink-0)" }}>{value}</div>
    </div>
  );
}
