import { nameKey } from './user-name';

/** The page is served over plain HTTP from another host (e.g. the dev server opened on a phone). */
export class InsecureContextError extends Error {
  constructor() {
    super('Signing in with a password needs HTTPS (or localhost)');
    this.name = 'InsecureContextError';
  }
}

export const isPasswordHash = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

/**
 * SHA-256 (lowercase hex) of password + name key, for a cleaned name. Only this is sent and remembered,
 * never the password. It keeps a name from being reused by accident; it is not meant as real security.
 * Keep in sync with api/src/handler.ts (which accepts only this format).
 */
export async function passwordHash(name: string, password: string): Promise<string> {
  // Browsers offer crypto.subtle only over HTTPS or on localhost.
  if (!globalThis.crypto?.subtle) throw new InsecureContextError();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password + nameKey(name)));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
