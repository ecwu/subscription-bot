import { BotContext } from "../../types/context.js";

export async function helpCommand(ctx: BotContext): Promise<void> {
  await ctx.reply(
    "Available commands:\n\n" +
      "Command style:\n" +
      "/add <name> <price> <currency> <cycle> <date> — Add a subscription\n" +
      "  Example: /add Netflix 12.99 EUR monthly 2026-06-01\n" +
      "  Note: one-line /add names cannot contain spaces\n\n" +
      "/list — List your subscriptions with buttons\n" +
      "/view <id> — View a subscription (short ID or full ID)\n" +
      "/edit <id> date|price|cycle <value> — Edit a subscription\n" +
      "/delete <id> — Delete a subscription (short ID or full ID)\n" +
      "/reminders — Show upcoming renewals within the reminder window\n\n" +
      "Interactive style:\n" +
      "/add with no arguments — Add step by step (supports names with spaces)\n" +
      "/list — Click View, Edit, or Delete on each subscription\n" +
      "/cancel — Stop an active flow\n\n" +
      "Privacy & data:\n" +
      "/export — Export your stored subscriptions as JSON\n" +
      "/delete_me — Permanently delete all your stored data (with confirmation)\n\n" +
      "/help — Show this help message"
  );
}
