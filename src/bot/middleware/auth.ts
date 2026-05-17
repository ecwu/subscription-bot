import { Middleware } from "grammy";
import { BotContext } from "../../types/context.js";

export const auth: Middleware<BotContext> = async (ctx, next) => {
  const adminUserId = ctx.env.ADMIN_USER_ID;

  if (!adminUserId) {
    // No admin configured, allow all for development
    await next();
    return;
  }

  const userId = ctx.from?.id;
  if (!userId || String(userId) !== adminUserId) {
    await ctx.reply("Unauthorized.");
    return;
  }

  await next();
};
