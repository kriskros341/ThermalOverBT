/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  // Avoid Tailwind's base reset interfering with third-party editor CSS
  corePlugins: {
    preflight: false,
  },
}
