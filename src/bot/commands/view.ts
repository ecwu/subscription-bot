import { BotContext } from "../../types/context.js";
import { createSubscriptionService } from "../../services/subscriptionService.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createReminderRepository } from "../../repositories/reminderRepository.js";
import { createLogger } from "../../utils/logger.js";
import { formatBillingCycle } from "../../utils/labels.js";

export async function viewCommand(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  if (!ctx.userKey) {
    await ctx.reply("无法识别用户，请稍后再试。");
    logger.warn("View command without userKey");
    return;
  }

  const text = ctx.msg?.text ?? "";
  const args = text.trim().split(/\s+/);

  if (args.length < 2) {
    await ctx.reply("用法：/view <id>\n发送 /list 查看你的订阅。");
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
    await ctx.reply("没有找到这个订阅。");
    return;
  }

  if (resolved.kind === "ambiguous") {
    await ctx.reply("这个短 ID 匹配了多个订阅，请使用完整 ID。");
    return;
  }

  const sub = await service.get(
    ctx.userKey,
    resolved.id,
    ctx.env.ENCRYPTION_KEY,
  );

  if (!sub) {
    await ctx.reply("没有找到这个订阅。");
    return;
  }

  const lines: string[] = [`${sub.name}`];

  if (sub.price !== undefined) {
    lines.push(`价格：${sub.price} ${sub.currency ?? ""}`.trim());
  }

  lines.push(`周期：${formatBillingCycle(sub.billingCycle, sub.billingInterval)}`);
  lines.push(`下次扣款：${sub.nextBillingDate}`);

  if (sub.category) {
    lines.push(`分类：${sub.category}`);
  }

  if (sub.note) {
    lines.push(`备注：${sub.note}`);
  }

  await ctx.reply(lines.join("\n"));

  logger.info("Viewed subscription", {
    subId: resolved.id,
    // Do not log subscription details
  });
}
