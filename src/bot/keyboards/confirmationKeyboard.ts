import { InlineKeyboard } from "grammy";

export function confirmationKeyboard(
  actionPrefix: string,
  data: string
): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Confirm", `${actionPrefix}:confirm:${data}`)
    .text("❌ Cancel", `${actionPrefix}:cancel:${data}`);
}
