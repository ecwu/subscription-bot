import { Middleware } from "grammy";
import { BotContext } from "../../types/context.js";

export const auth: Middleware<BotContext> = async (ctx, next) => {
  const adminUserId = ctx.env.ADMIN_USER_ID;
  const userId = ctx.from?.id;

  ctx.isAdmin = !!adminUserId && !!userId && String(userId) === adminUserId;

  await next();
};
