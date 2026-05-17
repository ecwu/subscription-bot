import { InlineKeyboard } from "grammy";

export function confirmationKeyboard(
  actionPrefix: string,
  data: string,
): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ 确认", `${actionPrefix}:confirm:${data}`)
    .text("❌ 取消", `${actionPrefix}:cancel:${data}`);
}
