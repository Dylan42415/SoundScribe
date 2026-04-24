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

  // Log the assets directory contents for debugging
  const assetsDir = path.join(distPath, "assets");
  if (fs.existsSync(assetsDir)) {
    const files = fs.readdirSync(assetsDir);
    console.log(`[static] Assets (${files.length}): ${files.join(", ")}`);
  } else {
    console.warn(
      `[static] WARNING: assets directory not found at ${assetsDir}`,
    );
  }

  // Debug endpoint (remove after confirmed working)
  app.get("/debug-static", (_req, res) => {
    const assets = fs.existsSync(assetsDir)
      ? fs.readdirSync(assetsDir)
      : [];
    res.json({
      distPath,
      indexExists: fs.existsSync(indexPath),
      assets,
      __dirname,
      cwd: process.cwd(),
    });
  });

  // Robust manual static file server to bypass any express.static / esbuild mangling issues
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    
    // Don't intercept API routes
    if (req.path.startsWith("/api")) return next();
    
    // Don't intercept root, let the catch-all handle index.html
    if (req.path === "/") return next();

    try {
      const decodedPath = decodeURIComponent(req.path);
      // Remove leading slash to join correctly with distPath
      const relativePath = decodedPath.startsWith('/') ? decodedPath.slice(1) : decodedPath;
      const filePath = path.join(distPath, relativePath);

      if (!fs.existsSync(filePath)) {
        return next();
      }

      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        return next();
      }

      // Add long cache for hashed assets in /assets/
      if (req.path.startsWith("/assets/")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }

      // Set MIME types manually to avoid any "Refused to apply style" errors
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

      // Stream the file
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } catch (err) {
      console.error(`[static] Error serving static file ${req.path}:`, err);
      next();
    }
  });

  // Catch-all: serve index.html ONLY for navigation requests (not assets/api)
  app.get("*", (req, res) => {
    // If the path looks like a file request (has extension), return 404
    if (req.path.includes(".")) {
      console.warn(`[static] 404 for file: ${req.path}`);
      return res.status(404).send("Not found");
    }

    // Don't catch API routes
    if (req.path.startsWith("/api")) {
      return res.status(404).json({ message: "Not found" });
    }

    // Never cache index.html — it contains hashed asset references that change per build
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    try {
      const html = fs.readFileSync(indexPath, "utf-8");
      res.send(html);
    } catch (err) {
      console.error(`[static] Error reading index.html:`, err);
      if (!res.headersSent) {
        res.status(500).send("Error reading application file");
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
