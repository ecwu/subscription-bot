import { BotContext } from "../../types/context.js";

export async function debugMeCommand(ctx: BotContext): Promise<void> {
  if (ctx.env.APP_ENV === "production") {
    await ctx.reply("This command is not available.");
    return;
  }

  await ctx.reply(
    "Debug info:\n" +
      `- userKey: ${ctx.userKey ? "present" : "missing"}\n` +
      `- requestId: ${ctx.requestId}\n` +
      `- env: ${ctx.env.APP_ENV ?? "unknown"}`
  );
}
