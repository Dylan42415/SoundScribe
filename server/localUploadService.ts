import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const LOCAL_UPLOAD_DIR = path.join(process.cwd(), 'local-uploads');

export function isLocalMode(): boolean {
  return !process.env.PRIVATE_OBJECT_DIR;
}

export function ensureLocalUploadDir(): void {
  if (!fs.existsSync(LOCAL_UPLOAD_DIR)) {
    fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
  }
}

export function getLocalUploadPath(id: string): string {
  return path.join(LOCAL_UPLOAD_DIR, id);
}

export function generateLocalUploadSlot(): { uploadURL: string; objectPath: string } {
  const id = randomUUID();
  return {
    uploadURL: `/api/uploads/local/${id}`,
    objectPath: `/objects/uploads/${id}`,
  };
}

export function getLocalFilePath(objectPath: string): string {
  const id = objectPath.split('/').pop()!;
  return getLocalUploadPath(id);
}

export async function localUploadBuffer(buffer: Buffer): Promise<string> {
  ensureLocalUploadDir();
  const id = randomUUID();
  const destPath = getLocalUploadPath(id);
  await fs.promises.writeFile(destPath, buffer);
  return `/objects/uploads/${id}`;
}
