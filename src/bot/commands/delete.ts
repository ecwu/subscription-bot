import { BotContext } from "../../types/context.js";
import { createSubscriptionService } from "../../services/subscriptionService.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createReminderRepository } from "../../repositories/reminderRepository.js";
import { confirmationKeyboard } from "../keyboards/confirmationKeyboard.js";
import { createLogger } from "../../utils/logger.js";

export async function deleteCommand(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  if (!ctx.userKey) {
    await ctx.reply("Unable to identify user. Please try again.");
    logger.warn("Delete command without userKey");
    return;
  }

  const text = ctx.msg?.text ?? "";
  const args = text.trim().split(/\s+/);

  if (args.length < 2) {
    await ctx.reply(
      "Usage: /delete <id>\nUse /list to see your subscriptions.",
    );
    return;
  }

  const inputId = args[1];

  const repo = createSubscriptionRepository(ctx.env.SUBSCRIPTION_KV);
  const reminderRepo = createReminderRepository(ctx.env.SUBSCRIPTION_KV);
  const service = createSubscriptionService(repo, reminderRepo);

  const resolved = await service.resolveId(
    ctx.userKey,
    inputId,
    ctx.env.ENCRYPTION_KEY,
  );

  if (resolved.kind === "not_found") {
    await ctx.reply("Subscription not found.");
    return;
  }

  if (resolved.kind === "ambiguous") {
    await ctx.reply(
      "That short ID matches multiple subscriptions. Use the full ID.",
    );
    return;
  }

  const sub = await service.get(
    ctx.userKey,
    resolved.id,
    ctx.env.ENCRYPTION_KEY,
  );

  if (!sub) {
    await ctx.reply("Subscription not found.");
    return;
  }

  logger.info("Delete confirmation requested", {
    subId: resolved.id,
    // Do not log subscription name or details
  });

  await ctx.reply(`Delete "${sub.name}"?`, {
    reply_markup: confirmationKeyboard("delete", resolved.id),
  });
}
