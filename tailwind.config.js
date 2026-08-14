/** @type {import('tailwindcss').Config} */
module.exports = {
  // 扫描所有含 Tailwind 类名的源文件（类名必须是字面量才能被静态扫描生成）
  content: ['./index.html', './js/**/*.{js,vue}', './css/**/*.css'],
  theme: {
    extend: {}
  },
  plugins: []
};
