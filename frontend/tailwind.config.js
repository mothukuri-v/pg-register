/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#101E17",
          800: "#182D22",
          700: "#22402F",
          600: "#2E533F",
        },
        paper: {
          DEFAULT: "#F4EFDD",
          dark: "#EAE2C6",
          line: "#D8CDA4",
        },
        brass: {
          DEFAULT: "#C89B3C",
          light: "#E3C371",
          dark: "#8F6B24",
        },
        rust: {
          DEFAULT: "#B24A3C",
          light: "#E2A69B",
        },
        sage: {
          DEFAULT: "#3F6F52",
          light: "#9FC2A9",
        },
      },
      fontFamily: {
        display: ["'Fraunces'", "serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      backgroundImage: {
        "ruled-paper":
          "repeating-linear-gradient(to bottom, transparent, transparent 43px, #D8CDA4 44px)",
      },
    },
  },
  plugins: [],
};
