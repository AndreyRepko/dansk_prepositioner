/**
 * A name is 1–30 letters (any script), digits, spaces and . _ ' -, starting with a letter or digit.
 * Keep in sync with api/src/names.ts (the API rejects anything else).
 */
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._'-]{0,29}$/u;

export const MAX_NAME_LENGTH = 30;

/** Display form of a name: NFC, trimmed, inner whitespace collapsed; null when not allowed. */
export function cleanName(raw: string): string | null {
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  return NAME.test(name) ? name : null;
}

/** Names are case-insensitive: "andrii" and "Andrii" share progress. */
export function nameKey(name: string): string {
  return name.toLowerCase();
}
