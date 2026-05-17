/**
 * Deterministically hash a Telegram user ID into an opaque user key.
 * Uses HMAC-SHA-256.
 */
export async function hashUserId(
  telegramUserId: number,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(String(telegramUserId))
  );

  return Buffer.from(signature).toString("base64url");
}
