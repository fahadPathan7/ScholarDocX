/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17201d",
        moss: "#4f6f52",
        linen: "#f6f0e7",
        clay: "#a8643d",
        sea: "#2f6d7a"
      },
      boxShadow: {
        soft: "0 10px 30px rgba(23, 32, 29, 0.08)"
      }
    }
  },
  plugins: []
};

