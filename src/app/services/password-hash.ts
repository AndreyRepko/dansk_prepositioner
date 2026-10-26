import { nameKey } from './user-name';

export const isPasswordHash = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

/**
 * SHA-256 (lowercase hex) of password + name key, for a cleaned name. Only this is sent and remembered,
 * never the password. It keeps a name from being reused by accident; it is not meant as real security.
 * Keep in sync with api/src/handler.ts (which accepts only this format).
 */
export async function passwordHash(name: string, password: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password + nameKey(name)));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
