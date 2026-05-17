import { KVNamespace } from "@cloudflare/workers-types";
import { UserProfile } from "../models/user.js";
import { userProfile } from "../utils/kvKeys.js";

export interface UserRepository {
  get(userKey: string): Promise<UserProfile | null>;
  save(profile: UserProfile): Promise<void>;
  delete(userKey: string): Promise<void>;
}

export function createUserRepository(kv: KVNamespace): UserRepository {
  return {
    async get(userKey: string): Promise<UserProfile | null> {
      const key = userProfile(userKey);
      const data = await kv.get(key);
      return data ? JSON.parse(data) : null;
    },

    async save(profile: UserProfile): Promise<void> {
      const key = userProfile(profile.userKey);
      await kv.put(key, JSON.stringify(profile));
    },

    async delete(userKey: string): Promise<void> {
      const key = userProfile(userKey);
      await kv.delete(key);
    },
  };
}
