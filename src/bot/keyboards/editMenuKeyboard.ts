import { InlineKeyboard } from "grammy";
import { editableFieldsKeyboard } from "./editFields.js";

export function editMenuKeyboard(subId: string): InlineKeyboard {
  return editableFieldsKeyboard({
    callbackData: (field) => `edit:${field}:${subId}`,
    backButton: { label: "取消", callbackData: `edit:cancel:${subId}` },
  });
}
