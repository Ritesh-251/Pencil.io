import { logger } from "../infra/logger";

export class LockService {
  private static instance: LockService;
  private locks: Map<string, { expiresAt: number }> = new Map();

  private constructor() {
    // Periodically clean up expired locks
    setInterval(() => this.cleanup(), 60000);
  }

  static getInstance() {
    if (!LockService.instance) LockService.instance = new LockService();
    return LockService.instance;
  }

  async acquire(key: string, ttlMs: number): Promise<boolean> {
    const now = Date.now();
    const existing = this.locks.get(key);

    if (existing && existing.expiresAt > now) {
      return false;
    }

    this.locks.set(key, { expiresAt: now + ttlMs });
    return true;
  }

  release(key: string) {
    this.locks.delete(key);
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, lock] of this.locks.entries()) {
      if (lock.expiresAt < now) {
        this.locks.delete(key);
      }
    }
  }
}

export const lockService = LockService.getInstance();
