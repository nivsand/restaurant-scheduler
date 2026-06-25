import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Heebo"', '"Rubik"', "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fdecd3",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
          800: "#9a3412",
          900: "#7c2d12",
        },
        navy: {
          DEFAULT: "#3d2317",
          800: "#2c1810",
          700: "#5c3a28",
          600: "#7a5040",
        },
        cream: {
          50: "#fffbf5",
          100: "#fef7ed",
          200: "#fdecd3",
          300: "#fbd8a8",
        },
        warm: {
          50: "#fdf8f0",
          100: "#f5ebe0",
          200: "#e8d5c0",
        },
        brown: {
          400: "#a07862",
          500: "#8b6350",
          600: "#7a5040",
          700: "#5c3a28",
          800: "#3d2317",
          900: "#2c1810",
        },
        terracotta: {
          DEFAULT: "#c45d3e",
          light: "#e07855",
        },
        sage: {
          DEFAULT: "#6b8f71",
          light: "#8ab090",
        },
        kitchen: {
          50: "#fff7ed",
          100: "#ffedd5",
          400: "#fb923c",
          500: "#f97316",
        },
        floor: {
          50: "#ecfdf5",
          100: "#d1fae5",
          400: "#34d399",
          500: "#10b981",
        },
      },
      boxShadow: {
        warm: "0 1px 3px rgba(44,24,16,0.06)",
        "warm-md": "0 4px 12px rgba(44,24,16,0.08)",
        "warm-lg": "0 8px 30px rgba(44,24,16,0.1)",
      },
    },
  },
  plugins: [],
};

export default config;
