import { BotContext } from "../../types/context.js";
import { createSubscriptionService } from "../../services/subscriptionService.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createReminderRepository } from "../../repositories/reminderRepository.js";
import { parseEditArgs } from "../../utils/editParser.js";
import { ValidationError } from "../../utils/errors.js";
import { createLogger } from "../../utils/logger.js";

export async function editCommand(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  if (!ctx.userKey) {
    await ctx.reply("Unable to identify user. Please try again.");
    logger.warn("Edit command without userKey");
    return;
  }

  const text = ctx.msg?.text ?? "";
  const args = text.trim().split(/\s+/);

  let parsed;
  try {
    parsed = parseEditArgs(args);
  } catch (err) {
    if (err instanceof ValidationError) {
      await ctx.reply(err.message);
      return;
    }
    throw err;
  }

  const repo = createSubscriptionRepository(ctx.env.SUBSCRIPTION_KV);
  const reminderRepo = createReminderRepository(ctx.env.SUBSCRIPTION_KV);
  const service = createSubscriptionService(repo, reminderRepo);

  const resolved = await service.resolveId(
    ctx.userKey,
    parsed.subId,
    ctx.env.ENCRYPTION_KEY
  );

  if (resolved.kind === "not_found") {
    await ctx.reply("Subscription not found.");
    return;
  }

  if (resolved.kind === "ambiguous") {
    await ctx.reply(
      "That short ID matches multiple subscriptions. Use the full ID."
    );
    return;
  }

  const sub = await service.get(
    ctx.userKey,
    resolved.id,
    ctx.env.ENCRYPTION_KEY
  );

  if (!sub) {
    await ctx.reply("Subscription not found.");
    return;
  }

  // Apply edits
  const now = new Date().toISOString();
  const updated = { ...sub, updatedAt: now };

  if (parsed.field === "date" && parsed.nextBillingDate) {
    updated.nextBillingDate = parsed.nextBillingDate;
  } else if (parsed.field === "price" && parsed.price !== undefined) {
    updated.price = parsed.price;
    updated.currency = parsed.currency;
  } else if (parsed.field === "cycle" && parsed.billingCycle) {
    updated.billingCycle = parsed.billingCycle;
  }

  await service.update(ctx.userKey, updated, ctx.env.ENCRYPTION_KEY);

  logger.info("Subscription updated", {
    subId: resolved.id,
    field: parsed.field,
    // Do not log old/new values
  });

  await ctx.reply(
    `Updated "${updated.name}": ${parsed.field} changed.\nUse /view to see the result.`
  );
}
