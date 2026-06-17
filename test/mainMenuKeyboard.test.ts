import { describe, expect, it } from "vitest";
import {
  MAIN_MENU_BUTTON_LABELS,
  actionFromMainMenuText,
  mainMenuCallbackData,
  mainMenuInlineKeyboard,
  mainMenuReplyKeyboard,
} from "../src/bot/keyboards/mainMenuKeyboard.js";

describe("main menu keyboard", () => {
  it("builds an inline keyboard with callback actions", () => {
    const keyboard = mainMenuInlineKeyboard();

    expect(keyboard.inline_keyboard[0][0]).toEqual({
      text: MAIN_MENU_BUTTON_LABELS.add,
      callback_data: mainMenuCallbackData("add"),
    });
    expect(keyboard.inline_keyboard.flat()).toContainEqual({
      text: MAIN_MENU_BUTTON_LABELS.settings,
      callback_data: mainMenuCallbackData("settings"),
    });
  });

  it("builds a persistent reply keyboard", () => {
    const keyboard = mainMenuReplyKeyboard();

    expect(keyboard.keyboard[0][0].text).toBe(MAIN_MENU_BUTTON_LABELS.add);
    expect(keyboard.resize_keyboard).toBe(true);
    expect(keyboard.is_persistent).toBe(true);
  });

  it("parses callback data and reply keyboard text", () => {
    expect(actionFromMainMenuText(MAIN_MENU_BUTTON_LABELS.report)).toBe(
      "report",
    );
    expect(actionFromMainMenuText("随便输入")).toBeNull();
  });
});
