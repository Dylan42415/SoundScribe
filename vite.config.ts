import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist", "public"),
    emptyOutDir: true,
    target: "es2020", // Use a more stable target for better compatibility
    cssTarget: "error", // Ensure CSS is also handled strictly
  },
  define: {
    "process.env": {},
    "global": "globalThis", 
  },
  optimizeDeps: {
    exclude: ["@shared"], // Don't try to pre-bundle the shared folder
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
