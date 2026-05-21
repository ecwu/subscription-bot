import { Conversation } from "@grammyjs/conversations";
import { BotContext, BaseBotContext } from "../../types/context.js";
import { createSubscriptionService } from "../../services/subscriptionService.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createReminderRepository } from "../../repositories/reminderRepository.js";
import { collectDateInput } from "./dateInput.js";
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

  const selectedDate = await collectDateInput(
    conversation,
    ctx,
    `恢复"${sub.name}"？\n当前下次扣款日期：${sub.nextBillingDate}\n\n如果日期正确，请发送“确认”；也可以输入新日期或点选日期：`,
    {
      confirmTexts: ["正确", "确认", "yes", "y"],
      confirmValue: sub.nextBillingDate,
      cancelMessage: "已取消恢复操作。",
    },
  );

  if (!selectedDate) {
    return;
  }

  await resumeWithDate(conversation, ctx, userKey, encryptionKey, subId, {
    newDate: selectedDate,
    options,
  });
}

async function resumeWithDate(
  conversation: Conversation<BotContext, BaseBotContext>,
  ctx: BaseBotContext,
  userKey: string,
  encryptionKey: string,
  subId: string,
  {
    newDate,
    options,
  }: {
    newDate: string;
    options?: ResumeConversationOptions;
  },
): Promise<void> {
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
