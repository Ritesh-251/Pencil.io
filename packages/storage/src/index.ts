import { Storage } from "@google-cloud/storage";
import * as fs from "fs";
import * as path from "path";

export interface IStorageService {
  uploadFile(filePath: string, destination: string): Promise<string>;
  uploadBuffer(buffer: Buffer, destination: string): Promise<string>;
  getSignedUrl(destination: string): Promise<string>;
  getDownloadStream(destination: string): any;
}

export class LocalStorageService implements IStorageService {
  private uploadDir: string;

  constructor(baseDir?: string) {
    this.uploadDir = baseDir || path.resolve(process.cwd(), ".uploads");
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async uploadFile(filePath: string, destination: string): Promise<string> {
    const destPath = path.join(this.uploadDir, destination);
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    await fs.promises.copyFile(filePath, destPath);
    return `/upload/${destination}`;
  }

  async uploadBuffer(buffer: Buffer, destination: string): Promise<string> {
    const destPath = path.join(this.uploadDir, destination);
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    await fs.promises.writeFile(destPath, buffer);
    return `/upload/${destination}`;
  }

  async getSignedUrl(destination: string): Promise<string> {
    return `/upload/${destination}`;
  }

  getDownloadStream(destination: string) {
    return fs.createReadStream(path.join(this.uploadDir, destination));
  }
}

export class GCSStorageService implements IStorageService {
  private storage: Storage;
  private bucketName: string;

  constructor(keyFile?: string, bucketName?: string) {
    this.storage = new Storage({
      keyFilename: keyFile || process.env.GCP_KEY_FILE,
    });
    this.bucketName = bucketName || process.env.GCS_BUCKET_NAME || "mypencil-assets";
  }

  async uploadFile(filePath: string, destination: string): Promise<string> {
    await this.storage.bucket(this.bucketName).upload(filePath, {
      destination,
      resumable: false,
    });
    return `https://storage.googleapis.com/${this.bucketName}/${destination}`;
  }

  async uploadBuffer(buffer: Buffer, destination: string): Promise<string> {
    const file = this.storage.bucket(this.bucketName).file(destination);
    await file.save(buffer);
    return `https://storage.googleapis.com/${this.bucketName}/${destination}`;
  }

  async getSignedUrl(destination: string): Promise<string> {
    const [url] = await this.storage
      .bucket(this.bucketName)
      .file(destination)
      .getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + 15 * 60 * 1000,
      });
    return url;
  }

  getDownloadStream(destination: string) {
    return this.storage.bucket(this.bucketName).file(destination).createReadStream();
  }
}

export function createStorageService(): IStorageService {
  if (process.env.GCP_KEY_FILE || process.env.GCS_BUCKET_NAME) {
    return new GCSStorageService();
  }
  return new LocalStorageService();
}

export const storageService = createStorageService();
