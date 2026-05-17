import { InlineKeyboard } from "grammy";

export function privacyDeleteKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🗑 Delete all data", "privacy:delete_confirm")
    .text("❌ Cancel", "privacy:delete_cancel");
}
