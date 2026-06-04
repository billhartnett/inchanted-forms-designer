import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  // Required for pdfjs-dist v4 + Vite 8 (Rolldown)
  optimizeDeps: {
    include: ["pdfjs-dist/build/pdf.worker.mjs"],
  },

  build: {
    // Optional: quiets the 500kb chunk warning
    chunkSizeWarningLimit: 1000,
  },
});
