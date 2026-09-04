/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#0a0c10", 900: "#0f1216", 850: "#141821", 800: "#1a1f2a", 700: "#242b38", 600: "#364052", 500: "#4d5a70" },
        mut: "#8b94a7",
        accent: { DEFAULT: "#f43f5e", soft: "#fb7185" },
        good: "#34d399",
        warn: "#fbbf24",
        violet: { glow: "#8b5cf6" },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      animation: {
        "shine": "shine 3s linear infinite",
        "float": "float 6s ease-in-out infinite",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        shine: { "0%": { backgroundPosition: "-200% center" }, "100%": { backgroundPosition: "200% center" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-8px)" } },
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
}
