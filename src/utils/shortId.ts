/**
 * Extract a short display ID from a full subscription UUID.
 *
 * Returns the first 8 characters (hex), which provides
 * ~4 billion combinations and is easy to type.
 */
export function shortId(fullId: string): string {
  return fullId.slice(0, 8);
}
