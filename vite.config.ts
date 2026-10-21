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
      "@shared": path.resolve(__dirname, "src/shared"),
      "@features": path.resolve(__dirname, "src/features"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // W8 (J-04/J-05) : le bundle renderer dépassait le seuil d'alerte
    // (un seul chunk de 485 Ko) et le seuil masquait la dérive. Découpage
    // explicite des grossiers (vendor) + seuil de 600 Ko : une régression de
    // taille devient visible dans le build.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // Dépendance réellement utilisées par le renderer (une entrée
          // inexistante fait ÉCHOUER le build : pas de package fantôme).
          react: ["react", "react-dom"],
          vendor: ["zustand", "zod", "clsx", "tailwind-merge", "lucide-react"],
        },
      },
    },
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
