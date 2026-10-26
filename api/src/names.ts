/**
 * A name is 1–30 letters (any script), digits, spaces and . _ ' -, starting with a letter or digit.
 * Keep in sync with src/app/services/user-name.ts.
 */
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._'-]{0,29}$/u;

/** Display form of a name: NFC, trimmed, inner whitespace collapsed; null when not allowed. */
export function cleanName(raw: string): string | null {
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  return NAME.test(name) ? name : null;
}

/** Storage key for a cleaned name: names are case-insensitive. */
export function nameKey(name: string): string {
  return name.toLowerCase();
}
