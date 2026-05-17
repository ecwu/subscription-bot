import { InlineKeyboard } from "grammy";

export function editMenuKeyboard(subId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("名称", `edit:name:${subId}`)
    .text("价格", `edit:price:${subId}`)
    .text("币种", `edit:currency:${subId}`)
    .row()
    .text("周期", `edit:cycle:${subId}`)
    .text("下次扣款日期", `edit:date:${subId}`)
    .row()
    .text("取消", `edit:cancel:${subId}`);
}
