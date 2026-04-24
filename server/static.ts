import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(process.cwd(), "dist", "public");
  const indexPath = path.resolve(distPath, "index.html");

  if (!fs.existsSync(distPath)) {
    console.error(`[static] ERROR: Build directory not found at ${distPath}`);
    return;
  }

  // Serve static assets with a logger
  app.use((req, res, next) => {
    if (req.path.startsWith("/assets/")) {
       console.log(`[static] Requesting asset: ${req.path}`);
    }
    next();
  });

  app.use(express.static(distPath));

  // Fallback to index.html for SPA routing
  app.get("*", (req, res) => {
    if (res.headersSent) return;

    // Don't serve index.html for missing assets or API calls
    if (req.path.startsWith("/api") || req.path.includes(".")) {
      console.log(`[static] 404 for file/api: ${req.path}`);
      res.status(404).end();
      return;
    }

    console.log(`[static] Serving index.html for path: ${req.path}`);
    res.sendFile(indexPath, (err) => {
      if (err) {
        console.error(`[static] Error sending index.html:`, err);
        if (!res.headersSent) {
          res.status(500).send("Error loading application");
        }
      }
    });
  });
}
