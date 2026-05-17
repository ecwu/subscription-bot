import { BotContext } from "../../types/context.js";

export async function debugMeCommand(ctx: BotContext): Promise<void> {
  if (ctx.env.APP_ENV === "production") {
    await ctx.reply("这个命令不可用。");
    return;
  }

  await ctx.reply(
    "调试信息：\n" +
      `- userKey：${ctx.userKey ? "存在" : "缺失"}\n` +
      `- requestId：${ctx.requestId}\n` +
      `- 环境：${ctx.env.APP_ENV ?? "未知"}`,
  );
}
