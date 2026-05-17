/**
 * Parse and validate the master encryption key.
 *
 * The key must be a base64url-encoded 32-byte (256-bit) value.
 * Example generation:
 *   node -e "console.log(Buffer.from(crypto.randomBytes(32)).toString('base64url'))"
 */
export function parseMasterKey(key: string): Uint8Array {
  let decoded: Buffer;
  try {
    decoded = Buffer.from(key, "base64url");
  } catch {
    throw new Error(
      "ENCRYPTION_KEY must be a base64url-encoded string. " +
        "Generate one with: node -e \"console.log(Buffer.from(crypto.randomBytes(32)).toString('base64url'))\"",
    );
  }

  if (decoded.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must decode to exactly 32 bytes (256 bits), got ${decoded.length} bytes.`,
    );
  }

  return new Uint8Array(decoded);
}
