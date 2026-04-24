import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // Use __dirname so this works correctly in the compiled bundle (dist/index.cjs)
  // In the bundle, __dirname = dist/, so "public" = dist/public/
  const distPath = path.resolve(__dirname, "public");

  if (!fs.existsSync(distPath)) {
    // Fallback: try cwd-based path (dev or alternative layouts)
    const cwdPath = path.resolve(process.cwd(), "dist", "public");
    if (fs.existsSync(cwdPath)) {
      return serveFromPath(app, cwdPath);
    }
    throw new Error(
      `Could not find the build directory at ${distPath} or ${cwdPath}. Make sure to build the client first.`,
    );
  }

  serveFromPath(app, distPath);
}

function serveFromPath(app: Express, distPath: string) {
  const indexPath = path.resolve(distPath, "index.html");

  console.log(`[static] Serving from: ${distPath}`);
  console.log(`[static] index.html exists: ${fs.existsSync(indexPath)}`);

  // Log the assets directory contents for debugging on first deploy
  const assetsDir = path.resolve(distPath, "assets");
  if (fs.existsSync(assetsDir)) {
    const files = fs.readdirSync(assetsDir);
    console.log(`[static] Assets (${files.length}): ${files.join(", ")}`);
  } else {
    console.warn(`[static] WARNING: assets directory not found at ${assetsDir}`);
  }

  // Serve static files with proper cache headers for hashed assets
  app.use(
    express.static(distPath, {
      maxAge: "1y", // Hashed filenames are safe to cache aggressively
      immutable: true,
      index: false, // Don't auto-serve index.html for directory requests
    }),
  );

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

    res.sendFile(indexPath);
  });
}
