import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = findDistPublic();

  if (!distPath) {
    console.error("[static] FATAL: Could not find dist/public directory!");
    console.error("[static] __dirname =", __dirname);
    console.error("[static] cwd =", process.cwd());

    // Add a debug endpoint so we can diagnose on Railway
    app.get("*", (_req, res) => {
      res.status(500).json({
        error: "Build directory not found",
        __dirname,
        cwd: process.cwd(),
        triedPaths: getCandidatePaths().map((p) => ({
          path: p,
          exists: fs.existsSync(p),
        })),
      });
    });
    return;
  }

  const indexPath = path.join(distPath, "index.html");

  console.log(`[static] Serving from: ${distPath}`);
  console.log(`[static] index.html exists: ${fs.existsSync(indexPath)}`);



  // Aggressive manual serving for production assets with full logging
  app.get("/assets/*", (req, res) => {
    const decodedPath = decodeURIComponent(req.path);
    const relativePath = decodedPath.startsWith("/") ? decodedPath.slice(1) : decodedPath;
    const filePath = path.join(distPath, relativePath);

    console.log(`[static] GET ${req.path} -> checking ${filePath}`);

    if (!fs.existsSync(filePath)) {
      console.error(`[static] ❌ MISSING: ${filePath}`);
      return res.status(404).send(`Asset not found on disk: ${relativePath}`);
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      console.warn(`[static] ⚠️ IS DIRECTORY: ${filePath}`);
      return res.status(404).send("Path is a directory");
    }

    // Set headers
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".ico": "image/x-icon",
      ".json": "application/json",
    };

    if (mimeTypes[ext]) {
      res.setHeader("Content-Type", mimeTypes[ext]);
    }

    res.sendFile(filePath, (err) => {
      if (err) {
        console.error(`[static] ❌ SEND ERROR ${filePath}:`, err);
        if (!res.headersSent) {
          res.status(500).send("Error serving file");
        }
      } else {
        console.log(`[static] ✅ SERVED: ${req.path}`);
      }
    });
  });

  // Catch-all: serve index.html for SPA navigation
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) {
      return res.status(404).json({ message: "Not found" });
    }

    // Never cache index.html
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    console.log(`[static] Catch-all serving index.html for: ${req.path}`);

    res.sendFile(indexPath, (err) => {
      if (err && !res.headersSent) {
        console.error(`[static] Error sending index.html:`, err);
        res.status(500).send("Error reading application file");
      }
    });
  });
}

function getCandidatePaths(): string[] {
  return [
    // 1. __dirname/public — works when index.cjs is in dist/
    path.resolve(__dirname, "public"),
    // 2. cwd/dist/public — works when cwd is project root
    path.resolve(process.cwd(), "dist", "public"),
    // 3. __dirname/../dist/public — works when __dirname is project root or server/
    path.resolve(__dirname, "..", "dist", "public"),
    // 4. cwd/public — works if cwd IS the dist folder
    path.resolve(process.cwd(), "public"),
  ];
}

function findDistPublic(): string | null {
  const candidates = getCandidatePaths();
  console.log(`[static] Checking ${candidates.length} candidates for dist/public...`);
  
  for (const candidate of candidates) {
    const indexHtml = path.join(candidate, "index.html");
    const exists = fs.existsSync(indexHtml);
    console.log(`[static]   - ${candidate}: ${exists ? "FOUND" : "NOT FOUND"}`);
    if (exists) {
      return candidate;
    }
  }
  return null;
}
