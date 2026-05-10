/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // 品牌色延伸（可根據設計規範調整）
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
      },
    },
  },
  plugins: [],
  // 與 Ant Design Vue 共存：避免 preflight 重置影響 AntD 樣式
  corePlugins: {
    preflight: false,
  },
}
