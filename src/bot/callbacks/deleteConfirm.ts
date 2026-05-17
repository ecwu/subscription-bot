import { BotContext } from "../../types/context.js";
import { createSubscriptionService } from "../../services/subscriptionService.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createReminderRepository } from "../../repositories/reminderRepository.js";
import { createLogger } from "../../utils/logger.js";
import { parseDeleteCallbackData } from "../../utils/callbackParser.js";

async function safeAnswerCallbackQuery(
  ctx: BotContext,
  text?: string,
): Promise<void> {
  try {
    await ctx.answerCallbackQuery(text);
  } catch {
    // Ignore if answering fails
  }
}

async function safeEditMessageText(
  ctx: BotContext,
  text: string,
): Promise<void> {
  try {
    await ctx.editMessageText(text);
  } catch {
    // Message may have been deleted or already edited
  }
}

export async function deleteConfirmCallback(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  try {
    if (!ctx.userKey) {
      await safeAnswerCallbackQuery(ctx, "无法识别用户。");
      await safeEditMessageText(ctx, "无法识别用户。");
      logger.warn("Delete confirm callback without userKey");
      return;
    }

    const parsed = parseDeleteCallbackData(ctx.callbackQuery?.data ?? "");
    if (!parsed) {
      await safeAnswerCallbackQuery(ctx, "按钮数据无效。");
      return;
    }

    const repo = createSubscriptionRepository(ctx.env.SUBSCRIPTION_KV);
    const reminderRepo = createReminderRepository(ctx.env.SUBSCRIPTION_KV);
    const service = createSubscriptionService(repo, reminderRepo);

    // Verify it still exists before deleting (idempotency: if already gone, report safely)
    const sub = await service.get(
      ctx.userKey,
      parsed.subId,
      ctx.env.ENCRYPTION_KEY,
    );
    if (!sub) {
      await safeAnswerCallbackQuery(ctx, "已经删除。");
      await safeEditMessageText(ctx, "没有找到这个订阅，或它已被删除。");
      return;
    }

    await service.remove(ctx.userKey, parsed.subId);

    logger.info("Subscription deleted", {
      subId: parsed.subId,
      // Do not log subscription name
    });

    await safeAnswerCallbackQuery(ctx, "已删除。");
    await safeEditMessageText(ctx, `“${sub.name}”已删除。`);
  } catch (error) {
    logger.error("Error in deleteConfirmCallback", {
      error: error instanceof Error ? error.message : String(error),
    });
    await safeAnswerCallbackQuery(ctx, "操作失败，请稍后再试。");
  }
}

export async function deleteCancelCallback(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  try {
    if (!ctx.userKey) {
      await safeAnswerCallbackQuery(ctx, "无法识别用户。");
      await safeEditMessageText(ctx, "无法识别用户。");
      logger.warn("Delete cancel callback without userKey");
      return;
    }

    logger.info("Delete cancelled");

    await safeAnswerCallbackQuery(ctx, "已取消。");
    await safeEditMessageText(ctx, "已取消删除。");
  } catch (error) {
    logger.error("Error in deleteCancelCallback", {
      error: error instanceof Error ? error.message : String(error),
    });
    await safeAnswerCallbackQuery(ctx, "操作失败，请稍后再试。");
  }
}
