import { Bot, session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { BotContext, BaseBotContext, SessionData } from "../types/context.js";
import { Env } from "../types/env.js";
import { requestContext } from "./middleware/requestContext.js";
import { auth } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { rateLimiter } from "./middleware/rateLimit.js";
import { startCommand } from "./commands/start.js";
import { helpCommand } from "./commands/help.js";
import { addCommand } from "./commands/add.js";
import { listCommand } from "./commands/list.js";
import { deleteCommand } from "./commands/delete.js";
import { viewCommand } from "./commands/view.js";
import { editCommand } from "./commands/edit.js";
import { exportCommand } from "./commands/export.js";
import { deleteMeCommand } from "./commands/deleteMe.js";
import { remindersCommand } from "./commands/reminders.js";
import { debugMeCommand } from "./commands/debugMe.js";
import { cancelCommand } from "./commands/cancel.js";
import { addConversation } from "./conversations/addConversation.js";
import {
  editFieldConversation,
  editCycleConversation,
} from "./conversations/editFieldConversation.js";
import {
  deleteConfirmCallback,
  deleteCancelCallback,
} from "./callbacks/deleteConfirm.js";
import {
  privacyDeleteConfirmCallback,
  privacyDeleteCancelCallback,
} from "./callbacks/privacyCallbacks.js";
import {
  subViewCallback,
  subEditCallback,
  subDeleteCallback,
} from "./callbacks/subCallbacks.js";
import {
  editFieldCallback,
  editCancelCallback,
} from "./callbacks/editCallbacks.js";

export function createBot(env: Env): Bot<BotContext> {
  const bot = new Bot<BotContext>(env.BOT_TOKEN);

  // Session and conversations.
  // NOTE: Session is in-memory per Cloudflare Worker isolate.
  // On Cloudflare Workers, each request may run in a different isolate,
  // and isolates are recycled/evicted unpredictably. This means:
  //   - Conversations may reset between requests if isolates change.
  //   - Users may need to restart /add or /edit flows unexpectedly.
  //   - Session data is NOT shared across isolates.
  // For MVP this is acceptable. A KV-backed session adapter could be
  // implemented later, but it adds latency and complexity (session
  // serialization, encryption, TTL). grammY's default in-memory session
  // is the pragmatic choice for a stateless Worker.
  bot.use(session<SessionData, BotContext>({ initial: () => ({}) }));

  // Core middleware stack.
  // requestContext must run before any handler (including conversation
  // entry points) that needs ctx.userKey, ctx.env, or ctx.requestId.
  // errorHandler is placed before conversations/commands so it can catch
  // errors in downstream middleware. It must run AFTER rateLimiter so
  // rate limit responses are not treated as errors.
  bot.use(requestContext(env));
  bot.use(auth);
  bot.use(rateLimiter());
  bot.use(errorHandler);
  bot.use(conversations());

  // Register conversations
  bot.use(createConversation<BotContext, BaseBotContext>(addConversation, "add"));
  bot.use(createConversation<BotContext, BaseBotContext>(editFieldConversation, "editField"));
  bot.use(createConversation<BotContext, BaseBotContext>(editCycleConversation, "editCycle"));

  // Commands
  bot.command("start", startCommand);
  bot.command("help", helpCommand);
  bot.command("add", addCommand);
  bot.command("list", listCommand);
  bot.command("delete", deleteCommand);
  bot.command("view", viewCommand);
  bot.command("edit", editCommand);
  bot.command("export", exportCommand);
  bot.command("delete_me", deleteMeCommand);
  bot.command("reminders", remindersCommand);
  bot.command("cancel", cancelCommand);

  // Dev-only commands
  if (env.APP_ENV !== "production") {
    bot.command("debug_me", debugMeCommand);
  }

  // Callbacks — use regex for dynamic callback data
  bot.callbackQuery(/^delete:confirm:/, deleteConfirmCallback);
  bot.callbackQuery(/^delete:cancel:/, deleteCancelCallback);

  // Subscription inline button callbacks
  bot.callbackQuery(/^sub:view:/, subViewCallback);
  bot.callbackQuery(/^sub:edit:/, subEditCallback);
  bot.callbackQuery(/^sub:delete:/, subDeleteCallback);

  // Edit field callbacks
  bot.callbackQuery(/^edit:name:/, editFieldCallback);
  bot.callbackQuery(/^edit:price:/, editFieldCallback);
  bot.callbackQuery(/^edit:currency:/, editFieldCallback);
  bot.callbackQuery(/^edit:cycle:/, editFieldCallback);
  bot.callbackQuery(/^edit:date:/, editFieldCallback);
  bot.callbackQuery(/^edit:cancel:/, editCancelCallback);

  // Privacy callbacks
  bot.callbackQuery(/^privacy:delete_confirm$/, privacyDeleteConfirmCallback);
  bot.callbackQuery(/^privacy:delete_cancel$/, privacyDeleteCancelCallback);

  // Fallback handlers for conversation-specific callbacks.
  // These fire when a conversation button is clicked after the
  // conversation has ended (e.g., isolate recycled, user cancelled,
  // or timeout). They answer the callback so Telegram stops the
  // loading spinner and inform the user the action expired.
  bot.callbackQuery(/^cycle:/, async (ctx) => {
    await ctx.answerCallbackQuery("This selection has expired. Use /add to start again.");
  });
  bot.callbackQuery(/^editcycle:/, async (ctx) => {
    await ctx.answerCallbackQuery("This selection has expired. Use /edit to start again.");
  });
  bot.callbackQuery(/^add:confirm$/, async (ctx) => {
    await ctx.answerCallbackQuery("This confirmation has expired. Use /add to start again.");
  });
  bot.callbackQuery(/^add:cancel$/, async (ctx) => {
    await ctx.answerCallbackQuery("This confirmation has expired.");
  });

  return bot;
}
