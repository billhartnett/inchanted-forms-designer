import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared/dist'),
      '@shared/acord': path.resolve(__dirname, '../shared/dist/acord'),
      '@shared/types': path.resolve(__dirname, '../shared/dist/types'),
      '@shared/quality': path.resolve(__dirname, '../shared/dist/quality'),
      '@shared/extraction': path.resolve(__dirname, '../shared/dist/extraction'),
    },
  },
})
