import { InlineKeyboard } from "grammy";

export function editMenuKeyboard(subId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("Name", `edit:name:${subId}`)
    .text("Price", `edit:price:${subId}`)
    .text("Currency", `edit:currency:${subId}`)
    .row()
    .text("Cycle", `edit:cycle:${subId}`)
    .text("Next billing date", `edit:date:${subId}`)
    .row()
    .text("Cancel", `edit:cancel:${subId}`);
}
