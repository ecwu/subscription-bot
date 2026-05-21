import { InlineKeyboard } from "grammy";
import { binaryActionKeyboard } from "./confirmationKeyboard.js";

export function privacyDeleteKeyboard(): InlineKeyboard {
  return binaryActionKeyboard({
    confirmLabel: "🗑 删除全部数据",
    confirmData: "privacy:delete_confirm",
    cancelData: "privacy:delete_cancel",
  });
}
