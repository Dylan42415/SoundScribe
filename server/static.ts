import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(process.cwd(), "dist", "public");
  const indexPath = path.resolve(distPath, "index.html");

  console.log(`[static] Resolving build directory at: ${distPath}`);
  if (!fs.existsSync(distPath)) {
    console.error(`[static] ERROR: Build directory not found! Checked: ${distPath}`);
    // List what IS in the dist folder to help debug
    const distParent = path.resolve(process.cwd(), "dist");
    if (fs.existsSync(distParent)) {
       console.log(`[static] Contents of 'dist':`, fs.readdirSync(distParent));
    }
    return;
  }

  app.use(express.static(distPath));

  // Fallback to index.html for SPA routing
  app.get("*", (req, res) => {
    // Only return 404 for missing files in the /assets folder
    if (req.path.startsWith("/assets/")) {
      console.log(`[static] Asset not found: ${req.path}`);
      res.status(404).end();
      return;
    }

    // Don't serve index.html for API calls
    if (req.path.startsWith("/api")) {
      res.status(404).json({ message: "API route not found" });
      return;
    }

    console.log(`[static] Serving index.html for SPA route: ${req.path}`);
    res.sendFile(indexPath);
  });
}
