import { InlineKeyboard } from "grammy";

export const COMMON_CURRENCIES = [
  "CNY",
  "USD",
  "HKD",
  "TWD",
  "EUR",
  "JPY",
  "GBP",
  "SGD",
] as const;

export function currencyKeyboard(hasPrice: boolean): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  COMMON_CURRENCIES.forEach((currency, index) => {
    keyboard.text(currency, `addcurrency:${currency}`);
    if (index % 4 === 3) keyboard.row();
  });

  keyboard.text("其他", "addcurrency:other");
  if (!hasPrice) {
    keyboard.text("不填写", "addcurrency:skip");
  }
  keyboard.row().text("取消", "addcurrency:cancel");
  return keyboard;
}

export function validateCurrencyInput(
  currencyStr: string,
  hasPrice: boolean,
): { currency?: string; error?: string } {
  const trimmed = currencyStr.trim().toUpperCase();
  if (trimmed === "SKIP" || trimmed === "") {
    if (hasPrice) {
      return { error: "已填写价格时必须选择币种。" };
    }
    return { currency: undefined };
  }
  if (!/^[A-Z]{3}$/.test(trimmed)) {
    return {
      error: "请输入 3 位币种代码，例如 CNY 或 USD。",
    };
  }
  return { currency: trimmed };
}

export function validateCurrencyCode(currencyStr: string): {
  currency: string;
  error?: string;
} {
  const trimmed = currencyStr.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(trimmed)) {
    return {
      currency: "",
      error: "请输入 3 位币种代码，例如 CNY 或 USD。",
    };
  }
  return { currency: trimmed };
}
