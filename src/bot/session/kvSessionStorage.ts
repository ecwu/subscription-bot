import { StorageAdapter } from "grammy";
import {
  encrypt,
  decrypt,
  serializeEncryptedPayload,
  parseEncryptedPayload,
} from "../../crypto/encryption.js";
import { deriveUserKey } from "../../crypto/keyDerivation.js";
import { SessionData } from "../../types/context.js";

const SESSION_PREFIX = "session:";
const SESSION_TTL = 3600;

export class KvSessionStorage implements StorageAdapter<SessionData> {
  constructor(
    private kv: KVNamespace,
    private masterKey: string,
  ) {}

  private buildKey(key: string): string {
    return `${SESSION_PREFIX}${key}`;
  }

  async read(key: string): Promise<SessionData | undefined> {
    const stored = await this.kv.get(this.buildKey(key));
    if (!stored) {
      return undefined;
    }

    try {
      const payload = parseEncryptedPayload(stored);
      const userKey = await deriveUserKey(this.masterKey, key);
      const decrypted = await decrypt(payload, userKey);
      return JSON.parse(decrypted) as SessionData;
    } catch {
      return undefined;
    }
  }

  async write(key: string, value: SessionData): Promise<void> {
    const serialized = JSON.stringify(value);
    const userKey = await deriveUserKey(this.masterKey, key);
    const encrypted = await encrypt(serialized, userKey);
    const payload = serializeEncryptedPayload(encrypted);
    await this.kv.put(this.buildKey(key), payload, {
      expirationTtl: SESSION_TTL,
    });
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(this.buildKey(key));
  }
}
