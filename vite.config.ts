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
      "@": path.resolve(import.meta.dirname, "src"),
      "@domain": path.resolve(import.meta.dirname, "src/domain"),
      "@shared": path.resolve(import.meta.dirname, "src/shared"),
      "@features": path.resolve(import.meta.dirname, "src/features"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // W8 (J-04/J-05) : le bundle renderer dépassait le seuil d'alerte
    // (un seul chunk de 485 Ko) et le seuil masquait la dérive. Découpage
    // explicite des grossiers (vendor) + seuil de 600 Ko : une régression de
    // taille devient visible dans le build.
    // Vite 8/Rolldown : `manualChunks` objet n'existe plus, remplacé par
    // `codeSplitting.groups` (les groupes sont prioritaires, react d'abord).
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react",
              test: /node_modules[\\/](react|react-dom)[\\/]/,
              includeDependenciesRecursively: true,
              priority: 2,
            },
            {
              name: "vendor",
              test: /node_modules[\\/](zustand|zod|clsx|tailwind-merge|lucide-react)[\\/]/,
              includeDependenciesRecursively: true,
              priority: 1,
            },
          ],
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
