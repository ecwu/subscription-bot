import { BotContext } from "../../types/context.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createLogger } from "../../utils/logger.js";

export async function startCommand(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  if (!ctx.userKey) {
    await ctx.reply(
      "欢迎使用订阅管理机器人。\n\n" +
        "我可以帮你记录各种周期性订阅，提醒下次扣款日期，并汇总每月支出。\n\n" +
        "开始使用：\n" +
        "• /add — 添加第一个订阅\n" +
        "• /help — 查看全部命令\n" +
        "• /report — 查看月度支出概览",
    );
    logger.info("Start command without userKey");
    return;
  }

  const repo = createSubscriptionRepository(ctx.env.SUBSCRIPTION_KV);
  const existingIds = await repo.listIds(ctx.userKey);
  const isFirstTime = existingIds.length === 0;

  if (isFirstTime) {
    await ctx.reply(
      "欢迎使用订阅管理机器人。\n\n" +
        "我可以帮你记录各种周期性订阅，提醒下次扣款日期，并汇总每月支出。\n\n" +
        "*快速开始：*\n" +
        "1️⃣ 发送 /add 逐步添加订阅\n" +
        "   也可以用一行命令：`/add Netflix 12.99 CNY monthly 2026-06-01`\n\n" +
        "2️⃣ 发送 /list 查看全部订阅\n\n" +
        "3️⃣ 发送 /report 查看月度支出\n\n" +
        "需要帮助时，随时发送 /help。",
      { parse_mode: "Markdown" },
    );
    logger.info("Start command: first-time welcome");
  } else {
    await ctx.reply(
      "欢迎回来。\n\n" +
        "常用操作：\n" +
        "• /add — 添加新订阅\n" +
        "• /list — 查看订阅列表\n" +
        "• /report — 查看支出概览\n" +
        "• /help — 查看全部命令",
    );
    logger.info("Start command: returning user welcome", {
      subscriptionCount: existingIds.length,
    });
  }
}
