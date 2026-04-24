import express, { Express } from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Use a safe way to get __dirname that works in both ESM and CJS
const getDirname = () => {
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return __dirname;
  }
};

/**
 * Robust static file server for production.
 * Handles path discovery across different deployment environments (Local, Docker, Railway).
 */
export function serveStatic(app: Express) {
  const distPath = findDistPublic();

  if (!distPath) {
    console.error("[static] FATAL: Could not find dist/public directory!");
    app.get("*", (_req, res) => {
      res.status(500).send("Application build artifacts not found. Please run build script.");
    });
    return;
  }

  const indexPath = path.join(distPath, "index.html");
  if (!fs.existsSync(indexPath)) {
    console.error(`[static] FATAL: index.html not found at ${indexPath}`);
  } else {
    console.log(`[static] Serving production assets from: ${distPath}`);
    console.log(`[static] Verified index.html at: ${indexPath}`);
  }

  // 1. Serve static files with optimized caching
  app.use(express.static(distPath, {
    maxAge: "1d",
    setHeaders: (res, filePath) => {
      // Long-term cache for hashed assets (Vite default)
      if (filePath.match(/[.-][a-z0-9]{8,}\.(js|css|png|jpg|jpeg|svg|webp|woff2?)$/i) || 
          filePath.includes("/assets/")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }));
}

/**
 * Searches for the dist/public directory in common locations.
 */
function findDistPublic(): string | null {
  const candidates = [
    // Standard relative paths
    path.resolve(process.cwd(), "dist", "public"),
    path.resolve(getDirname(), "public"),
    path.resolve(getDirname(), "..", "dist", "public"),
    // Fallback to project root public if dist is missing
    path.resolve(process.cwd(), "public"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "index.html"))) {
      return candidate;
    }
  }

  return null;
}
