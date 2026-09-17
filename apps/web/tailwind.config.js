/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#090B0F",
        surface: "#12141C",
        surfaceHover: "#1A1E29",
        borderSubtle: "#242B3B",
        brand: "#6366F1",
        brandHover: "#4F46E5",
        statusHealthy: "#10B981",
        statusCooldown: "#F59E0B",
        statusDanger: "#EF4444",
        tierLow: "#06B6D4",
        tierMedium: "#3B82F6",
        tierHigh: "#8B5CF6",
        tierXHigh: "#EC4899",
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'Fira Code'", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
