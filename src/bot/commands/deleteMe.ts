import { BotContext } from "../../types/context.js";
import { privacyDeleteKeyboard } from "../keyboards/privacyDeleteKeyboard.js";
import { createLogger } from "../../utils/logger.js";

export async function deleteMeCommand(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  if (!ctx.userKey) {
    await ctx.reply("无法识别用户，请稍后再试。");
    logger.warn("Delete me command without userKey");
    return;
  }

  await ctx.reply("这会永久删除你保存的全部订阅数据。确定继续吗？", {
    reply_markup: privacyDeleteKeyboard(),
  });

  logger.info("Delete me confirmation requested");
}
