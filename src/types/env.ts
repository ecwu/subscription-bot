export interface Env {
  BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ENCRYPTION_KEY: string;
  USER_HASH_SECRET: string;
  ADMIN_USER_ID?: string;
  SUBSCRIPTION_KV: KVNamespace;
  APP_ENV?: string;
}
