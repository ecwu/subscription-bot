import { BotContext } from "../../types/context.js";
import { createSubscriptionService } from "../../services/subscriptionService.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createLogger } from "../../utils/logger.js";

export async function viewCommand(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  if (!ctx.userKey) {
    await ctx.reply("Unable to identify user. Please try again.");
    logger.warn("View command without userKey");
    return;
  }

  const text = ctx.msg?.text ?? "";
  const args = text.trim().split(/\s+/);

  if (args.length < 2) {
    await ctx.reply("Usage: /view <id>\nUse /list to see your subscriptions.");
    return;
  }

  const inputId = args[1];

  const repo = createSubscriptionRepository(ctx.env.SUBSCRIPTION_KV);
  const service = createSubscriptionService(repo);

  const resolved = await service.resolveId(
    ctx.userKey,
    inputId,
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

  const lines: string[] = [`${sub.name}`];

  if (sub.price !== undefined) {
    lines.push(`Price: ${sub.price} ${sub.currency ?? ""}`.trim());
  }

  lines.push(`Cycle: ${sub.billingCycle}`);
  lines.push(`Next billing: ${sub.nextBillingDate}`);

  if (sub.category) {
    lines.push(`Category: ${sub.category}`);
  }

  if (sub.note) {
    lines.push(`Note: ${sub.note}`);
  }

  await ctx.reply(lines.join("\n"));

  logger.info("Viewed subscription", {
    subId: resolved.id,
    // Do not log subscription details
  });
}
