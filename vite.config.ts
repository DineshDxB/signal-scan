import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/signal-scan/',
  build: { outDir: 'dist', sourcemap: false },
  define: {
    'process.env': {}
  }
})
