import { BotContext } from "../../types/context.js";
import { createSubscriptionService } from "../../services/subscriptionService.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createReminderRepository } from "../../repositories/reminderRepository.js";
import { confirmationKeyboard } from "../keyboards/confirmationKeyboard.js";
import { editMenuKeyboard } from "../keyboards/editMenuKeyboard.js";
import { createLogger } from "../../utils/logger.js";
import { parseSubCallbackData } from "../../utils/callbackParser.js";
import { InlineKeyboard } from "grammy";

async function safeAnswerCallbackQuery(
  ctx: BotContext,
  text?: string
): Promise<void> {
  try {
    await ctx.answerCallbackQuery(text);
  } catch {
    // Ignore if answering fails (e.g., query too old)
  }
}

async function safeEditMessageText(
  ctx: BotContext,
  text: string,
  options?: { reply_markup?: InlineKeyboard }
): Promise<void> {
  try {
    await ctx.editMessageText(text, options);
  } catch {
    // Message may have been deleted or already edited
  }
}

export async function subViewCallback(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  try {
    if (!ctx.userKey) {
      await safeAnswerCallbackQuery(ctx, "Unable to identify user.");
      return;
    }

    const parsed = parseSubCallbackData(ctx.callbackQuery?.data ?? "");
    if (!parsed) {
      await safeAnswerCallbackQuery(ctx, "Invalid callback data.");
      return;
    }

    const repo = createSubscriptionRepository(ctx.env.SUBSCRIPTION_KV);
    const reminderRepo = createReminderRepository(ctx.env.SUBSCRIPTION_KV);
    const service = createSubscriptionService(repo, reminderRepo);
    const sub = await service.get(ctx.userKey, parsed.subId, ctx.env.ENCRYPTION_KEY);

    if (!sub) {
      await safeAnswerCallbackQuery(ctx, "Subscription not found.");
      await safeEditMessageText(
        ctx,
        "Subscription not found or already deleted."
      );
      return;
    }

    const lines: string[] = [`${sub.name}`];
    if (sub.price !== undefined) {
      lines.push(`Price: ${sub.price} ${sub.currency ?? ""}`.trim());
    }
    lines.push(`Cycle: ${sub.billingCycle}`);
    lines.push(`Next billing: ${sub.nextBillingDate}`);
    if (sub.category) lines.push(`Category: ${sub.category}`);
    if (sub.note) lines.push(`Note: ${sub.note}`);

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, lines.join("\n"));

    logger.info("Viewed subscription via callback", { subId: parsed.subId });
  } catch (error) {
    logger.error("Error in subViewCallback", {
      error: error instanceof Error ? error.message : String(error),
    });
    await safeAnswerCallbackQuery(ctx, "Something went wrong.");
  }
}

export async function subEditCallback(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  try {
    if (!ctx.userKey) {
      await safeAnswerCallbackQuery(ctx, "Unable to identify user.");
      return;
    }

    const parsed = parseSubCallbackData(ctx.callbackQuery?.data ?? "");
    if (!parsed) {
      await safeAnswerCallbackQuery(ctx, "Invalid callback data.");
      return;
    }

    const repo = createSubscriptionRepository(ctx.env.SUBSCRIPTION_KV);
    const reminderRepo = createReminderRepository(ctx.env.SUBSCRIPTION_KV);
    const service = createSubscriptionService(repo, reminderRepo);
    const sub = await service.get(ctx.userKey, parsed.subId, ctx.env.ENCRYPTION_KEY);

    if (!sub) {
      await safeAnswerCallbackQuery(ctx, "Subscription not found.");
      await safeEditMessageText(
        ctx,
        "Subscription not found or already deleted."
      );
      return;
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(
      ctx,
      `What do you want to edit for "${sub.name}"?`,
      { reply_markup: editMenuKeyboard(parsed.subId) }
    );

    logger.info("Edit menu opened via callback", { subId: parsed.subId });
  } catch (error) {
    logger.error("Error in subEditCallback", {
      error: error instanceof Error ? error.message : String(error),
    });
    await safeAnswerCallbackQuery(ctx, "Something went wrong.");
  }
}

export async function subDeleteCallback(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  try {
    if (!ctx.userKey) {
      await safeAnswerCallbackQuery(ctx, "Unable to identify user.");
      return;
    }

    const parsed = parseSubCallbackData(ctx.callbackQuery?.data ?? "");
    if (!parsed) {
      await safeAnswerCallbackQuery(ctx, "Invalid callback data.");
      return;
    }

    const repo = createSubscriptionRepository(ctx.env.SUBSCRIPTION_KV);
    const reminderRepo = createReminderRepository(ctx.env.SUBSCRIPTION_KV);
    const service = createSubscriptionService(repo, reminderRepo);
    const sub = await service.get(ctx.userKey, parsed.subId, ctx.env.ENCRYPTION_KEY);

    if (!sub) {
      await safeAnswerCallbackQuery(ctx, "Subscription not found.");
      await safeEditMessageText(
        ctx,
        "Subscription not found or already deleted."
      );
      return;
    }

    logger.info("Delete confirmation requested via callback", { subId: parsed.subId });

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, `Delete "${sub.name}"?`, {
      reply_markup: confirmationKeyboard("delete", parsed.subId),
    });
  } catch (error) {
    logger.error("Error in subDeleteCallback", {
      error: error instanceof Error ? error.message : String(error),
    });
    await safeAnswerCallbackQuery(ctx, "Something went wrong.");
  }
}
