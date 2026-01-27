/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./popup.tsx",
    "./options.tsx",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./lib/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  corePlugins: {
    preflight: false, // 禁用Tailwind的基础样式重置，避免与Plasmo冲突
  },
}
