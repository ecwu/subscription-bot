import { BotContext } from "../../types/context.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createLogger } from "../../utils/logger.js";

export async function startCommand(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  if (!ctx.userKey) {
    await ctx.reply(
      "Welcome! I'm your personal subscription tracker bot.\n\n" +
        "I help you keep track of all your recurring subscriptions " +
        "so you never miss a payment or wonder where your money goes.\n\n" +
        "Get started:\n" +
        "• /add — Add your first subscription\n" +
        "• /help — See all available commands\n" +
        "• /report — View your monthly spending overview",
    );
    logger.info("Start command without userKey");
    return;
  }

  const repo = createSubscriptionRepository(ctx.env.SUBSCRIPTION_KV);
  const existingIds = await repo.listIds(ctx.userKey);
  const isFirstTime = existingIds.length === 0;

  if (isFirstTime) {
    await ctx.reply(
      "Welcome! I'm your personal subscription tracker bot. 🤖\n\n" +
        "I help you keep track of all your recurring subscriptions " +
        "so you never miss a payment or wonder where your money goes.\n\n" +
        "*Quick start:*\n" +
        "1️⃣ Add a subscription with /add\n" +
        "   Example: `/add Netflix 12.99 USD monthly 2026-06-01`\n\n" +
        "2️⃣ See all your subscriptions with /list\n\n" +
        "3️⃣ Check your monthly spending with /report\n\n" +
        "Need help? Type /help anytime to see all commands.",
      { parse_mode: "Markdown" },
    );
    logger.info("Start command: first-time welcome");
  } else {
    await ctx.reply(
      "Welcome back! 👋\n\n" +
        "Quick actions:\n" +
        "• /add — Add a new subscription\n" +
        "• /list — View your subscriptions\n" +
        "• /report — Spending overview\n" +
        "• /help — All commands",
    );
    logger.info("Start command: returning user welcome", {
      subscriptionCount: existingIds.length,
    });
  }
}
