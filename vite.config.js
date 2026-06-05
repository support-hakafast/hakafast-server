import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000, // ה-Frontend ירוץ על פורט 3000 בפיתוח
    proxy: {
      // מנתב את כל קריאות ה-API לשרת ה-Node.js הקיים שלך (בהנחה שהוא רץ על 5000)
      '/api': 'http://localhost:5000',
      '/assign-driver': 'http://localhost:5000'
    }
  }
})