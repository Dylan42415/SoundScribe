import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(process.cwd(), "dist", "public");
  const indexPath = path.resolve(distPath, "index.html");

  console.log(`[static] Serving from: ${distPath}`);

  app.use(express.static(distPath));

  app.get("*", (req, res) => {
    // Return 404 for missing assets/files
    if (req.path.includes(".") || req.path.startsWith("/api")) {
      res.status(404).end();
      return;
    }

    res.sendFile(indexPath);
  });
}
