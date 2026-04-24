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
  console.log(`[static] Serving production assets from: ${distPath}`);

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

  // 2. Catch-all: serve index.html for SPA navigation (Wouter/React Router)
  app.get("*", (req, res, next) => {
    // If it's an API route that reached here, it's a genuine 404 for the API
    if (req.path.startsWith("/api/")) {
      return res.status(404).json({ 
        error: "Not Found", 
        message: `API endpoint ${req.path} does not exist.` 
      });
    }

    // Security & Caching for index.html (never cache the entry point)
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    res.sendFile(indexPath, (err) => {
      if (err && !res.headersSent) {
        console.error(`[static] Error sending index.html:`, err);
        res.status(500).send("Error loading application");
      }
    });
  });
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
