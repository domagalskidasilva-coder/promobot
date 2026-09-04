/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Marca: azul confiável para ação/significado. Semânticas usam paleta padrão do Tailwind.
        brand: {
          50: "#eff6ff",
          100: "#dbeafe",
          600: "#1d4ed8",
          700: "#1e40af",
          800: "#1e3a8a",
        },
        // Tokens legados mantidos apenas para compatibilidade (não usar em código novo).
        ink: { 950: "#0a0c10", 900: "#0f1216", 850: "#141821", 800: "#1a1f2a", 700: "#242b38", 600: "#364052", 500: "#4d5a70" },
        mut: "#8b94a7",
        accent: { DEFAULT: "#1d4ed8", soft: "#1e40af" },
        good: "#047857",
        warn: "#b45309",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.08)",
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
}
