import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', // <-- הוסף את השורה הזו! מבטיח שהנתיבים לקבצי ה-JS וה-CSS יהיו יחסיים
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:5000',
      '/live-timing-data': 'http://localhost:5000',
      '/assign-driver': 'http://localhost:5000'
    }
  }
})