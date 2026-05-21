import { BotContext } from "../../types/context.js";
import { createSubscriptionService } from "../../services/subscriptionService.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createReminderRepository } from "../../repositories/reminderRepository.js";
import { createLogger } from "../../utils/logger.js";

export async function resumeCommand(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  if (!ctx.userKey) {
    await ctx.reply("无法识别用户，请稍后再试。");
    logger.warn("Resume command without userKey");
    return;
  }

  const text = ctx.msg?.text ?? "";
  const args = text.trim().split(/\s+/);

  if (args.length < 2) {
    await ctx.reply("用法：/resume <id>\n发送 /list 查看你的订阅。");
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

  await ctx.conversation.enter("resume", resolved.id);

  logger.info("Resume conversation entered", { subId: resolved.id });
}
