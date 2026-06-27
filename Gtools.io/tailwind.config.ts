import type { Config } from "tailwindcss";

// Semantic color names mapped to the "cold storage" CSS-variable palette in
// globals.css. Existing utility classes (text-acid, text-cyan, text-ember…)
// now resolve to the cohesive new palette automatically.
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        ink: {
          DEFAULT: "var(--ink-0)",
          0: "var(--ink-0)",
          1: "var(--ink-1)",
          2: "var(--ink-2)",
        },
        bg: {
          0: "var(--bg-0)",
          1: "var(--bg-1)",
          2: "var(--bg-2)",
        },
        line: { DEFAULT: "var(--line)", 2: "var(--line-2)" },
        // legacy semantic aliases → new palette
        acid: "var(--amber)",      // primary action / heat (was acid-green)
        cyan: "var(--ice)",        // info / chain / links
        ember: "var(--alert)",     // errors / danger
        amber: "var(--amber)",
        ice: "var(--ice)",
        signal: "var(--signal)",
        alert: "var(--alert)",
        violet: "var(--violet)",
      },
    },
  },
  plugins: [],
} satisfies Config;
