import { BotContext } from "../../types/context.js";
import { createLogger } from "../../utils/logger.js";

export async function cancelCommand(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  if (!ctx.userKey) {
    await ctx.reply("Unable to identify user. Please try again.");
    logger.warn("Cancel command without userKey");
    return;
  }

  // Exit all active conversations for this chat.
  // This is safe to call even when no conversation is active.
  await ctx.conversation.exitAll();

  await ctx.reply("Cancelled.");
  logger.info("Cancel command executed, all conversations exited");
}
