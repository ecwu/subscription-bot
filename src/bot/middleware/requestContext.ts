import { Middleware } from "grammy";
import { BotContext } from "../../types/context.js";
import { Env } from "../../types/env.js";
import { createLogger } from "../../utils/logger.js";
import { hashUserId } from "../../crypto/userHash.js";
import { createUserRepository } from "../../repositories/userRepository.js";

const PROFILE_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

function isStartCommand(ctx: BotContext): boolean {
  return ctx.message?.text?.split(/\s+/, 1)[0]?.split("@", 1)[0] === "/start";
}

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

    const userRepo = createUserRepository(env.SUBSCRIPTION_KV);
    const startCommand = isStartCommand(ctx);
    let deleted = false;
    let deletionCheckFailed = false;

    if (ctx.userKey) {
      try {
        deleted = await userRepo.isUserDeleted(ctx.userKey);
      } catch (err) {
        deletionCheckFailed = true;
        logger.warn("Failed to check deleted user marker", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if ((deleted || deletionCheckFailed) && !startCommand) {
      ctx.userKey = undefined;
    }

    // Upsert user profile when we have both userKey and chat id, but avoid
    // rewriting encrypted profile data on every update.
    // Do not break updates without chat id (e.g., channel posts, inline queries).
    // Deleted users must explicitly reactivate with /start before profiles are recreated.
    if (ctx.userKey && ctx.chat?.id && !deleted && !deletionCheckFailed) {
      try {
        const profile = await userRepo.getUserProfile(
          ctx.userKey,
          env.ENCRYPTION_KEY,
        );
        const lastSeenAt = profile ? Date.parse(profile.lastSeenAt) : NaN;
        const shouldWriteProfile =
          !profile ||
          profile.chatId !== ctx.chat.id ||
          Number.isNaN(lastSeenAt) ||
          Date.now() - lastSeenAt >= PROFILE_REFRESH_INTERVAL_MS;

        if (shouldWriteProfile) {
          await userRepo.upsertUserProfile(
            ctx.userKey,
            ctx.chat.id,
            env.ENCRYPTION_KEY,
          );
          logger.info("User profile upserted");
        }
      } catch (err) {
        logger.warn("Failed to upsert user profile", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await next();
  };
}
