import { Conversation } from "@grammyjs/conversations";
import { BotContext, BaseBotContext } from "../../types/context.js";
import { createSubscriptionService } from "../../services/subscriptionService.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createReminderRepository } from "../../repositories/reminderRepository.js";
import { validateEditDate } from "./editFieldConversation.js";
import { formatStatus } from "../../utils/labels.js";
import {
  buildDetailKeyboard,
  formatDetailText,
} from "../keyboards/listManagerKeyboard.js";

interface ResumeConversationOptions {
  source?: "listManager";
  page?: number;
}

function isFromListManager(options?: ResumeConversationOptions): boolean {
  return options?.source === "listManager";
}

async function replyWithListManagerDetail(
  ctx: BaseBotContext,
  sub: Parameters<typeof formatDetailText>[0],
  page: number,
): Promise<void> {
  await ctx.reply(formatDetailText(sub), {
    reply_markup: buildDetailKeyboard(sub, page),
  });
}

export async function resumeConversation(
  conversation: Conversation<BotContext, BaseBotContext>,
  ctx: BaseBotContext,
  subId: string,
  options?: ResumeConversationOptions,
): Promise<void> {
  const ctxData = await conversation.external((outsideCtx) => ({
    userKey: outsideCtx.userKey ?? null,
    encryptionKey: outsideCtx.env.ENCRYPTION_KEY,
  }));

  if (!ctxData.userKey) {
    await ctx.reply("无法识别用户，请稍后再试。");
    return;
  }

  const userKey = ctxData.userKey;
  const encryptionKey = ctxData.encryptionKey;

  const sub = await conversation.external(async (outsideCtx) => {
    const repo = createSubscriptionRepository(outsideCtx.env.SUBSCRIPTION_KV);
    const reminderRepo = createReminderRepository(
      outsideCtx.env.SUBSCRIPTION_KV,
    );
    const service = createSubscriptionService(repo, reminderRepo);
    return service.get(userKey, subId, encryptionKey);
  });

  if (!sub) {
    await ctx.reply("没有找到这个订阅，或它已被删除。");
    return;
  }

  if (sub.status === "active") {
    await ctx.reply(`"${sub.name}" 已经是${formatStatus("active")}状态。`);
    if (isFromListManager(options)) {
      await replyWithListManagerDetail(ctx, sub, options?.page ?? 0);
    }
    return;
  }

  await ctx.reply(
    `恢复"${sub.name}"？\n当前下次扣款日期：${sub.nextBillingDate}\n\n请确认下次扣款日期是否正确，或输入新日期：`,
  );

  const inputCtx = await conversation.waitFor("message:text");
  const input = inputCtx.msg.text.trim();

  if (input === "/cancel" || input === "取消") {
    await ctx.reply("已取消恢复操作。");
    return;
  }

  if (
    input === "正确" ||
    input === "确认" ||
    input === "yes" ||
    input === "y"
  ) {
    const resumed = await conversation.external(async (outsideCtx) => {
      const repo = createSubscriptionRepository(outsideCtx.env.SUBSCRIPTION_KV);
      const reminderRepo = createReminderRepository(
        outsideCtx.env.SUBSCRIPTION_KV,
      );
      const service = createSubscriptionService(repo, reminderRepo);
      return service.resume(userKey, subId, encryptionKey);
    });

    if (!resumed) {
      await ctx.reply("恢复失败，请稍后再试。");
      return;
    }

    if (isFromListManager(options)) {
      await ctx.reply(
        `已恢复"${resumed.name}"。\n下次扣款日期：${resumed.nextBillingDate}`,
      );
      await replyWithListManagerDetail(ctx, resumed, options?.page ?? 0);
      return;
    }

    await ctx.reply(
      `已恢复"${resumed.name}"。\n下次扣款日期：${resumed.nextBillingDate}`,
    );
    return;
  }

  const dateResult = validateEditDate(input);
  if (dateResult.error) {
    await ctx.reply(
      dateResult.error +
        (isFromListManager(options)
          ? "\n请重新从详情中选择恢复。"
          : "\n请发送 /resume 重新开始。"),
    );
    return;
  }

  const newDate = dateResult.date!;
  const resumed = await conversation.external(async (outsideCtx) => {
    const repo = createSubscriptionRepository(outsideCtx.env.SUBSCRIPTION_KV);
    const reminderRepo = createReminderRepository(
      outsideCtx.env.SUBSCRIPTION_KV,
    );
    const service = createSubscriptionService(repo, reminderRepo);
    return service.resume(userKey, subId, encryptionKey, newDate);
  });

  if (!resumed) {
    await ctx.reply("恢复失败，请稍后再试。");
    return;
  }

  if (isFromListManager(options)) {
    await ctx.reply(
      `已恢复"${resumed.name}"。\n下次扣款日期：${resumed.nextBillingDate}`,
    );
    await replyWithListManagerDetail(ctx, resumed, options?.page ?? 0);
    return;
  }

  await ctx.reply(
    `已恢复"${resumed.name}"。\n下次扣款日期：${resumed.nextBillingDate}`,
  );
}
