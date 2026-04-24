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



  // Serve all static files from dist/public (assets, favicon, etc.)
  app.use(express.static(distPath, {
    maxAge: "1d", // Default for non-hashed files
    setHeaders: (res, filePath) => {
      // Long-term cache for hashed assets
      if (filePath.includes(`${path.sep}assets${path.sep}`) || filePath.includes("/assets/")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }));

  // Catch-all: serve index.html for SPA navigation
  app.get("*", (req, res) => {
    // API requests should 404 if not handled by registerRoutes
    if (req.path.startsWith("/api")) {
      return res.status(404).json({ message: "Not found" });
    }

    // Asset requests that reached here means they weren't found in express.static
    if (req.path.startsWith("/assets")) {
      return res.status(404).send("Asset not found");
    }

    // Never cache index.html
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    try {
      res.sendFile(indexPath, (err) => {
        if (err && !res.headersSent) {
          console.error(`[static] Error sending index.html:`, err);
          res.status(500).send("Error reading application file");
        }
      });
    } catch (err) {
      console.error(`[static] Error serving index.html:`, err);
      if (!res.headersSent) {
        res.status(500).send("Internal server error");
      }
    }
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
  for (const candidate of getCandidatePaths()) {
    const indexHtml = path.join(candidate, "index.html");
    if (fs.existsSync(indexHtml)) {
      console.log(`[static] Found dist/public at: ${candidate}`);
      return candidate;
    }
  }
  return null;
}
