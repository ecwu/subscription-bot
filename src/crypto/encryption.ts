import { parseMasterKey } from "./masterKey.js";

const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12;

/**
 * Import a base64url-encoded 32-byte AES key for AES-GCM.
 */
async function importKey(rawKey: string): Promise<CryptoKey> {
  const keyData = parseMasterKey(rawKey);
  return crypto.subtle.importKey("raw", keyData, { name: ALGORITHM }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export interface EncryptedPayload {
  iv: string;
  ciphertext: string;
}

export async function encrypt(
  plaintext: string,
  key: string,
): Promise<EncryptedPayload> {
  const cryptoKey = await importKey(key);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoder = new TextEncoder();
  const encoded = encoder.encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    cryptoKey,
    encoded,
  );

  return {
    iv: Buffer.from(iv).toString("base64url"),
    ciphertext: Buffer.from(ciphertext).toString("base64url"),
  };
}

export async function decrypt(
  payload: EncryptedPayload,
  key: string,
): Promise<string> {
  const cryptoKey = await importKey(key);
  const iv = Buffer.from(payload.iv, "base64url");
  const ciphertext = Buffer.from(payload.ciphertext, "base64url");

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    cryptoKey,
    ciphertext,
  );

  return new TextDecoder().decode(decrypted);
}

export function serializeEncryptedPayload(payload: EncryptedPayload): string {
  return `${payload.iv}.${payload.ciphertext}`;
}

export function parseEncryptedPayload(serialized: string): EncryptedPayload {
  const [iv, ciphertext] = serialized.split(".");
  if (!iv || !ciphertext) {
    throw new Error("Invalid encrypted payload format");
  }
  return { iv, ciphertext };
}
