import { Response } from "express";
import { randomUUID } from "crypto";
import { supabase } from "../supabase";
import fs from "fs";

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  private bucketName = "recordings";

  constructor() {}

  async downloadObject(objectId: string, res: Response) {
    const { data: { publicUrl } } = supabase.storage.from(this.bucketName).getPublicUrl(objectId);
    res.redirect(publicUrl);
  }

  async uploadBuffer(buffer: Buffer, contentType: string = 'audio/mpeg'): Promise<string> {
    const objectId = randomUUID() + ".mp3";
    const { data, error } = await supabase.storage
      .from(this.bucketName)
      .upload(objectId, buffer, { contentType, upsert: true });

    if (error) {
      console.error("Supabase storage upload error:", error);
      throw error;
    }
    return objectId;
  }

  async downloadObjectEntityTo(objectId: string, destination: string): Promise<void> {
    // If it's a legacy URL (/objects/uploads/...), strip it
    if (objectId.startsWith("/objects/uploads/")) {
      objectId = objectId.slice(17);
    } else if (objectId.startsWith("/objects/")) {
      objectId = objectId.slice(9);
    }

    const { data, error } = await supabase.storage.from(this.bucketName).download(objectId);
    if (error || !data) {
      throw new ObjectNotFoundError();
    }
    const arrayBuffer = await data.arrayBuffer();
    await fs.promises.writeFile(destination, Buffer.from(arrayBuffer));
  }
  
  async getObjectEntityUploadURL(): Promise<string> {
    const objectId = randomUUID() + ".mp3";
    const { data, error } = await supabase.storage.from(this.bucketName).createSignedUploadUrl(objectId);
    if (error || !data) throw error;
    return data.signedUrl;
  }

  normalizeObjectEntityPath(uploadURL: string): string {
    try {
      const url = new URL(uploadURL);
      const parts = url.pathname.split('/');
      const signIndex = parts.indexOf('sign');
      if (signIndex !== -1 && parts.length > signIndex + 2) {
        return parts.slice(signIndex + 2).join('/');
      }
    } catch (e) {}
    return uploadURL; 
  }

  async getObjectEntityFile(objectPath: string): Promise<string> {
    if (objectPath.startsWith("/objects/uploads/")) {
      return objectPath.slice(17); 
    }
    if (objectPath.startsWith("/objects/")) {
      return objectPath.slice(9); 
    }
    return objectPath;
  }
}
