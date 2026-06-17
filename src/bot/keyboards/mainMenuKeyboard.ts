import { InlineKeyboard, Keyboard } from "grammy";
import {
  MAIN_MENU_ACTIONS,
  type MainMenuAction,
} from "../../utils/callbackParser.js";

export { MAIN_MENU_ACTIONS, type MainMenuAction };

export const MAIN_MENU_BUTTON_LABELS: Record<MainMenuAction, string> = {
  add: "➕ 添加订阅",
  list: "📋 管理订阅",
  report: "📊 支出报告",
  reminders: "⏰ 近期扣款",
  settings: "⚙️ 提醒设置",
  help: "❓ 帮助",
};

export function mainMenuCallbackData(action: MainMenuAction): string {
  return `menu:${action}`;
}

export function actionFromMainMenuText(
  text: string | undefined,
): MainMenuAction | null {
  if (!text) return null;
  const entry = MAIN_MENU_ACTIONS.find(
    (action) => MAIN_MENU_BUTTON_LABELS[action] === text,
  );
  return entry ?? null;
}

export function mainMenuInlineKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(MAIN_MENU_BUTTON_LABELS.add, mainMenuCallbackData("add"))
    .text(MAIN_MENU_BUTTON_LABELS.list, mainMenuCallbackData("list"))
    .row()
    .text(MAIN_MENU_BUTTON_LABELS.report, mainMenuCallbackData("report"))
    .text(MAIN_MENU_BUTTON_LABELS.reminders, mainMenuCallbackData("reminders"))
    .row()
    .text(MAIN_MENU_BUTTON_LABELS.settings, mainMenuCallbackData("settings"))
    .text(MAIN_MENU_BUTTON_LABELS.help, mainMenuCallbackData("help"));
}

export function mainMenuReplyKeyboard(): Keyboard {
  return new Keyboard()
    .text(MAIN_MENU_BUTTON_LABELS.add)
    .text(MAIN_MENU_BUTTON_LABELS.list)
    .row()
    .text(MAIN_MENU_BUTTON_LABELS.report)
    .text(MAIN_MENU_BUTTON_LABELS.reminders)
    .row()
    .text(MAIN_MENU_BUTTON_LABELS.settings)
    .text(MAIN_MENU_BUTTON_LABELS.help)
    .resized()
    .persistent();
}
