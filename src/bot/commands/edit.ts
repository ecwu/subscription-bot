import { BotContext } from "../../types/context.js";
import { createSubscriptionService } from "../../services/subscriptionService.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createReminderRepository } from "../../repositories/reminderRepository.js";
import { parseEditArgs } from "../../utils/editParser.js";
import { ValidationError } from "../../utils/errors.js";
import { createLogger } from "../../utils/logger.js";
import { getBillingAnchorDay } from "../../utils/date.js";

const FIELD_LABELS: Record<string, string> = {
  date: "下次扣款日期",
  price: "价格",
  cycle: "周期",
};

export async function editCommand(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  if (!ctx.userKey) {
    await ctx.reply("无法识别用户，请稍后再试。");
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

  // Apply edits
  const now = new Date().toISOString();
  const updated = { ...sub, updatedAt: now };

  if (parsed.field === "date" && parsed.nextBillingDate) {
    updated.nextBillingDate = parsed.nextBillingDate;
    updated.billingAnchorDay = getBillingAnchorDay(parsed.nextBillingDate);
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
    `已更新“${updated.name}”的${FIELD_LABELS[parsed.field]}。\n发送 /view 查看结果。`,
  );
}
