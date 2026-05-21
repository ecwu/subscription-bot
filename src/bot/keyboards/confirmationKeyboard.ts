import { InlineKeyboard } from "grammy";

export function binaryActionKeyboard({
  confirmLabel = "✅ 确认",
  confirmData,
  cancelLabel = "❌ 取消",
  cancelData,
}: {
  confirmLabel?: string;
  confirmData: string;
  cancelLabel?: string;
  cancelData: string;
}): InlineKeyboard {
  return new InlineKeyboard()
    .text(confirmLabel, confirmData)
    .text(cancelLabel, cancelData);
}

export function confirmationKeyboard(
  actionPrefix: string,
  data: string,
  options?: {
    confirmLabel?: string;
    cancelLabel?: string;
  },
): InlineKeyboard {
  return binaryActionKeyboard({
    confirmLabel: options?.confirmLabel,
    confirmData: `${actionPrefix}:confirm:${data}`,
    cancelLabel: options?.cancelLabel,
    cancelData: `${actionPrefix}:cancel:${data}`,
  });
}
