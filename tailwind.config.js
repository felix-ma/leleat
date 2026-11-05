/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#f7f4ed',
        card: '#fffdf9',
        ink: {
          DEFAULT: '#292621',
          muted: '#726d64',
          faint: '#9b958b',
        },
        leaf: {
          50: '#eff6f0',
          100: '#dfecdf',
          200: '#c5ddc8',
          500: '#527b5c',
          600: '#3f684d',
          700: '#32533e',
          800: '#294331',
        },
        berry: {
          50: '#fcf0ef',
          100: '#f7dedc',
          200: '#efc4c0',
          500: '#b4463f',
          600: '#9c3832',
          700: '#7e2d28',
        },
        honey: {
          50: '#fbf5e8',
          100: '#f6e9ca',
          200: '#ecd9a8',
          600: '#966f25',
          700: '#79591e',
        },
      },
      fontFamily: {
        sans: [
          '"Noto Sans SC"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'system-ui',
          'sans-serif',
        ],
        display: [
          '"Noto Serif SC"',
          '"Songti SC"',
          '"STSong"',
          '"SimSun"',
          'serif',
        ],
      },
      boxShadow: {
        card: '0 1px 2px rgba(41, 38, 33, 0.04), 0 18px 45px -30px rgba(41, 38, 33, 0.28)',
        lift: '0 16px 36px -22px rgba(41, 38, 33, 0.42)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}
