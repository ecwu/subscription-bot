import { MiddlewareFn } from "grammy";
import { BotContext } from "../../types/context.js";

/**
 * Sequentialize middleware for grammY.
 * Ensures that updates sharing the same session key are processed sequentially,
 * preventing read-modify-write races on KV-backed session data.
 *
 * This is especially important for webhook-based deployments where two updates
 * from the same user may arrive concurrently and overwrite each other's
 * session state.
 */
export function sequentialize(
  getSessionKey: (ctx: BotContext) => Promise<string | undefined>,
): MiddlewareFn<BotContext> {
  const queues = new Map<string, Promise<unknown>>();

  return async (ctx, next) => {
    const key = await getSessionKey(ctx);
    if (key === undefined) {
      return next();
    }

    const previous = queues.get(key);
    const current = Promise.resolve(previous)
      .catch(() => undefined)
      .then(() => next())
      .finally(() => {
        if (queues.get(key) === current) {
          queues.delete(key);
        }
      });

    queues.set(key, current);
    return current;
  };
}
