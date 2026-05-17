import { InlineKeyboard } from "grammy";

export function subscriptionActionsKeyboard(subId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("查看", `sub:view:${subId}`)
    .text("编辑", `sub:edit:${subId}`)
    .text("删除", `sub:delete:${subId}`);
}
