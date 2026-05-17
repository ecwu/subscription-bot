import { InlineKeyboard } from "grammy";

export function subscriptionActionsKeyboard(subId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("View", `sub:view:${subId}`)
    .text("Edit", `sub:edit:${subId}`)
    .text("Delete", `sub:delete:${subId}`);
}
