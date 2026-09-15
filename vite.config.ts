import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Veloria PoS — renderer build.
// Output is static files consumed by Electron (dist/). No SSR, no server.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@domain": path.resolve(__dirname, "src/domain"),
      "@app": path.resolve(__dirname, "src/application"),
      "@ports": path.resolve(__dirname, "src/ports"),
      "@infra": path.resolve(__dirname, "src/infrastructure"),
      "@shared": path.resolve(__dirname, "src/shared"),
      "@features": path.resolve(__dirname, "src/features"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
