import { BotContext } from "../../types/context.js";
import { createLogger } from "../../utils/logger.js";

export async function settingsCommand(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  if (!ctx.userKey) {
    await ctx.reply("无法识别用户，请稍后再试。");
    logger.warn("Settings command without userKey");
    return;
  }

  await ctx.conversation.enter("settings");
}
