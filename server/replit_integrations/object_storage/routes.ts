import type { Express } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import {
  isLocalMode,
  ensureLocalUploadDir,
  generateLocalUploadSlot,
  getLocalFilePath,
  getLocalUploadPath,
} from "../../localUploadService";
import fs from "fs";
import path from "path";

export function registerObjectStorageRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  app.post("/api/uploads/request-url", async (req, res) => {
    try {
      const { name, size, contentType } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Missing required field: name" });
      }

      if (isLocalMode()) {
        ensureLocalUploadDir();
        const { uploadURL, objectPath } = generateLocalUploadSlot();
        return res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Local-mode PUT endpoint: receives the raw binary file and saves it to disk.
  app.put(
    "/api/uploads/local/:id",
    (req, res, next) => {
      // Parse as raw buffer for this route only
      let chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        (req as any).rawBinary = Buffer.concat(chunks);
        next();
      });
      req.on("error", next);
    },
    async (req: any, res) => {
      try {
        const { id } = req.params;
        if (!/^[0-9a-f-]{36}$/.test(id)) {
          return res.status(400).json({ error: "Invalid upload id" });
        }
        ensureLocalUploadDir();
        const dest = getLocalUploadPath(id);
        await fs.promises.writeFile(dest, req.rawBinary);
        res.status(200).json({ ok: true });
      } catch (error) {
        console.error("Error saving local upload:", error);
        res.status(500).json({ error: "Failed to save file" });
      }
    }
  );

  // Serve objects — local mode reads from disk, GCS mode streams from bucket.
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      if (isLocalMode()) {
        const localPath = getLocalFilePath(req.path);
        if (!fs.existsSync(localPath)) {
          return res.status(404).json({ error: "Object not found" });
        }
        return res.sendFile(localPath);
      }

      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });
}
