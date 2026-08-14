/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#FFF7F0',
        foreground: '#1F1F1F',
        card: '#FFFFFF',
        'card-border': '#F2E7DE',
        primary: '#FB6511',
        success: '#16A34A',
        warning: '#F59E0B',
        danger: '#E5483D',
        muted: '#7A6C61',
      },
    },
  },
  plugins: [],
}
