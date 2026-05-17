import { parseMasterKey } from "./masterKey.js";

/**
 * Derive a user-specific encryption key from the master key and a user key.
 * Uses HKDF-SHA-256.
 *
 * The masterKey must be a base64url-encoded 32-byte value (see parseMasterKey).
 */
export async function deriveUserKey(
  masterKey: string,
  userKey: string,
): Promise<string> {
  const keyData = parseMasterKey(masterKey);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HKDF" },
    false,
    ["deriveKey"],
  );

  const encoder = new TextEncoder();
  const derived = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("subscription-bot-salt"),
      info: encoder.encode(`user-key:${userKey}`),
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );

  const exported = (await crypto.subtle.exportKey(
    "raw",
    derived,
  )) as ArrayBuffer;
  return Buffer.from(new Uint8Array(exported)).toString("base64url");
}
