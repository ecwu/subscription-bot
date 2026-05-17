import { BotContext } from "../../types/context.js";

export async function startCommand(ctx: BotContext): Promise<void> {
  await ctx.reply("Subscription bot is running.");
}
