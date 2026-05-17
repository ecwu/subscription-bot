import { Middleware } from "grammy";
import { BotContext } from "../../types/context.js";
import { Env } from "../../types/env.js";
import { createLogger } from "../../utils/logger.js";
import { hashUserId } from "../../crypto/userHash.js";
import { createUserRepository } from "../../repositories/userRepository.js";

export function requestContext(env: Env): Middleware<BotContext> {
  return async (ctx, next) => {
    ctx.env = env;
    ctx.requestId = crypto.randomUUID();

    const logger = createLogger(ctx.requestId);
    logger.info("Processing update", {
      updateId: ctx.update.update_id,
    });

    let hashError: string | undefined;
    if (ctx.from?.id) {
      try {
        ctx.userKey = await hashUserId(ctx.from.id, env.USER_HASH_SECRET);
      } catch (err) {
        hashError = err instanceof Error ? err.message : String(err);
        // Leave userKey undefined so handlers can reject gracefully
      }
    }
    // If ctx.from is missing, userKey remains undefined.
    // Command handlers and auth middleware should handle this gracefully.

    // Safe diagnostic: booleans only, no raw IDs, secrets, or userKey value
    logger.info("request_context_user_key", {
      hasFrom: !!ctx.from,
      hasUserHashSecret: !!env.USER_HASH_SECRET,
      hasUserKey: !!ctx.userKey,
      hashError,
    });

    // Upsert user profile when we have both userKey and chat id.
    // Do not break updates without chat id (e.g., channel posts, inline queries).
    if (ctx.userKey && ctx.chat?.id) {
      try {
        const userRepo = createUserRepository(env.SUBSCRIPTION_KV);
        await userRepo.upsertUserProfile(
          ctx.userKey,
          ctx.chat.id,
          env.ENCRYPTION_KEY,
        );
        logger.info("User profile upserted");
      } catch (err) {
        logger.warn("Failed to upsert user profile", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await next();
  };
}
