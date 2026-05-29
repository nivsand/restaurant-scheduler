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
          50: "#eef9ff",
          100: "#d9f0ff",
          200: "#bce4ff",
          300: "#8dd2ff",
          400: "#57b6ff",
          500: "#3091ff",
          600: "#1a71f5",
          700: "#155ae0",
          800: "#1849b5",
          900: "#1a418e",
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
    },
  },
  plugins: [],
};

export default config;
