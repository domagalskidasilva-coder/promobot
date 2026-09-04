/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/web/templates/**/*.html",
    "./app/web/static/app.js",
    "./api/**/*.py",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0e1013",
          900: "#15181e",
          850: "#191d24",
          800: "#1f242e",
          700: "#272c36",
          600: "#3d4450",
        },
        mut: "#8b92a0",
        accent: {
          DEFAULT: "#ef4444",
          light: "#f87171",
        },
      },
      boxShadow: {
        float: "0 2px 10px rgba(0,0,0,.45)",
      },
    },
  },
  plugins: [],
};
