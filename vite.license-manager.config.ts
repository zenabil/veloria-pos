import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Veloria License Manager — renderer vendor (bundle séparé, jamais dans POS).
export default defineConfig({
  root: path.resolve(__dirname, "license-manager/renderer"),
  plugins: [react(), tailwindcss()],
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "dist-license-manager-renderer"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    sourcemap: false,
  },
  server: {
    port: 5174,
    strictPort: true,
  },
});
