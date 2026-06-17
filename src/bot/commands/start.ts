import { BotContext } from "../../types/context.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createLogger } from "../../utils/logger.js";
import { mainMenuReplyKeyboard } from "../keyboards/mainMenuKeyboard.js";

export async function startCommand(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  if (!ctx.userKey) {
    await ctx.reply(
      "欢迎使用订阅管理机器人。\n\n" +
        "我可以帮你记录周期性订阅、提醒下次扣款，并汇总每月支出。\n\n" +
        "请选择下面的操作开始。",
      { reply_markup: mainMenuReplyKeyboard() },
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
        "我可以帮你记录周期性订阅、提醒下次扣款，并汇总每月支出。\n\n" +
        "先添加第一个订阅；添加后可以在列表里查看、编辑、暂停或删除。\n\n" +
        "请使用底部快捷按钮选择操作。",
      {
        reply_markup: mainMenuReplyKeyboard(),
      },
    );
    logger.info("Start command: first-time welcome");
  } else {
    await ctx.reply(
      "欢迎回来。\n\n" +
        "请选择底部快捷按钮操作。按钮会保留，回到聊天时也可以直接点。",
      {
        reply_markup: mainMenuReplyKeyboard(),
      },
    );
    logger.info("Start command: returning user welcome", {
      subscriptionCount: existingIds.length,
    });
  }
}
