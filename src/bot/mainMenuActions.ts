import type { BotContext } from "../types/context.js";
import { helpCommand } from "./commands/help.js";
import { listFullCommand } from "./commands/list.js";
import { remindersCommand } from "./commands/reminders.js";
import { reportCommand } from "./commands/report.js";
import { settingsCommand } from "./commands/settings.js";
import {
  actionFromMainMenuText,
  type MainMenuAction,
} from "./keyboards/mainMenuKeyboard.js";

export async function dispatchMainMenuAction(
  ctx: BotContext,
  action: MainMenuAction,
): Promise<void> {
  switch (action) {
    case "add":
      await ctx.conversation.enter("add");
      return;
    case "list":
      await listFullCommand(ctx);
      return;
    case "report":
      await reportCommand(ctx);
      return;
    case "reminders":
      await remindersCommand(ctx);
      return;
    case "settings":
      await settingsCommand(ctx);
      return;
    case "help":
      await helpCommand(ctx);
      return;
  }
}

export async function mainMenuText(ctx: BotContext): Promise<void> {
  const action = actionFromMainMenuText(ctx.msg?.text);
  if (!action) return;
  await dispatchMainMenuAction(ctx, action);
}
