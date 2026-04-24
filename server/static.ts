import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const possiblePaths = [
    path.resolve(process.cwd(), "dist", "public"),
    path.resolve(process.cwd(), "public"),
    path.resolve(__dirname, "..", "dist", "public"),
    path.resolve(__dirname, "public")
  ];

  let distPath = "";
  for (const p of possiblePaths) {
    if (fs.existsSync(p) && fs.existsSync(path.resolve(p, "index.html"))) {
      distPath = p;
      break;
    }
  }

  if (!distPath) {
    console.error("[static] CRITICAL ERROR: Build directory not found!");
    console.log("[static] Checked paths:", possiblePaths);
    return;
  }

  console.log(`[static] Serving assets from: ${distPath}`);
  const indexPath = path.resolve(distPath, "index.html");

  app.use(express.static(distPath));

  app.get("*", (req, res) => {
    if (req.path.startsWith("/assets/")) {
      res.status(404).send("Asset not found");
      return;
    }

    if (req.path.startsWith("/api")) {
      res.status(404).json({ message: "API route not found" });
      return;
    }

    res.sendFile(indexPath);
  });
}
