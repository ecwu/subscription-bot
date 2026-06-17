import { Bot, Context, session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { BotContext, BaseBotContext, SessionData } from "../types/context.js";
import { Env } from "../types/env.js";
import { hashUserId } from "../crypto/userHash.js";
import { KvSessionStorage } from "./session/kvSessionStorage.js";
import { sequentialize } from "./middleware/sequentialize.js";
import { requestContext } from "./middleware/requestContext.js";
import { auth } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { rateLimiter } from "./middleware/rateLimit.js";
import { startCommand } from "./commands/start.js";
import { helpCommand } from "./commands/help.js";
import { addCommand } from "./commands/add.js";
import { listCommand, listFullCommand } from "./commands/list.js";
import { exportCommand } from "./commands/export.js";
import { reportCommand } from "./commands/report.js";
import { reportTextCommand } from "./commands/reportText.js";
import { deleteMeCommand } from "./commands/deleteMe.js";
import { remindersCommand } from "./commands/reminders.js";
import { settingsCommand } from "./commands/settings.js";
import { adminRemindersCommand } from "./commands/adminReminders.js";
import { debugMeCommand } from "./commands/debugMe.js";
import { addConversation } from "./conversations/addConversation.js";
import {
  editFieldConversation,
  editCycleConversation,
} from "./conversations/editFieldConversation.js";
import { resumeConversation } from "./conversations/resumeConversation.js";
import { settingsConversation } from "./conversations/settingsConversation.js";
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
  subPauseCallback,
  subResumeCallback,
  reminderRenewCallback,
} from "./callbacks/subCallbacks.js";
import {
  editFieldCallback,
  editCancelCallback,
} from "./callbacks/editCallbacks.js";
import {
  listPageCallback,
  listSelectCallback,
  listDetailCallback,
  listBackCallback,
  listEditCallback,
  listPauseCallback,
  listResumeCallback,
  listDelCallback,
  listDeleteConfirmCallback,
  listDeleteCancelCallback,
  listEditFieldCallback,
} from "./callbacks/listCallbacks.js";

function createGetSessionKey(env: Env) {
  return async (ctx: Context): Promise<string | undefined> => {
    if (!ctx.from?.id) return undefined;
    return hashUserId(ctx.from.id, env.USER_HASH_SECRET);
  };
}

export function createBot(env: Env): Bot<BotContext> {
  const bot = new Bot<BotContext>(env.BOT_TOKEN);

  const getSessionKey = createGetSessionKey(env);

  // Sequentialize updates sharing the same session key to prevent
  // read-modify-write races on KV-backed session data.
  bot.use(sequentialize(getSessionKey));

  // Session and conversations backed by Cloudflare KV with 1-hour TTL.
  // Session keys are prefixed with "session:" and encrypted at rest using
  // a per-user key derived from the master key and the session key.
  // The TTL is refreshed on every write, so active conversations stay alive.
  // Expired sessions are cleaned up automatically by KV.
  bot.use(
    session<SessionData, BotContext>({
      initial: () => ({}),
      getSessionKey,
      storage: new KvSessionStorage(env.SUBSCRIPTION_KV, env.ENCRYPTION_KEY),
    }),
  );

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
  bot.use(
    createConversation<BotContext, BaseBotContext>(addConversation, "add"),
  );
  bot.use(
    createConversation<BotContext, BaseBotContext>(
      editFieldConversation,
      "editField",
    ),
  );
  bot.use(
    createConversation<BotContext, BaseBotContext>(
      editCycleConversation,
      "editCycle",
    ),
  );
  bot.use(
    createConversation<BotContext, BaseBotContext>(
      resumeConversation,
      "resume",
    ),
  );
  bot.use(
    createConversation<BotContext, BaseBotContext>(
      settingsConversation,
      "settings",
    ),
  );

  // Commands
  bot.command("start", startCommand);
  bot.command("help", helpCommand);
  bot.command("add", addCommand);
  bot.command("list_full", listFullCommand);
  bot.command("list", listCommand);
  bot.command("export", exportCommand);
  bot.command("report", reportCommand);
  bot.command("report_text", reportTextCommand);
  bot.command("delete_me", deleteMeCommand);
  bot.command("reminders", remindersCommand);
  bot.command("settings", settingsCommand);
  bot.command("admin_reminders", adminRemindersCommand);

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
  bot.callbackQuery(/^sub:pause:/, subPauseCallback);
  bot.callbackQuery(/^sub:resume:/, subResumeCallback);
  bot.callbackQuery(/^reminder:renew:/, reminderRenewCallback);

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

  // List manager inline panel callbacks
  bot.callbackQuery(/^list:page:/, listPageCallback);
  bot.callbackQuery(/^list:select:/, listSelectCallback);
  bot.callbackQuery(/^list:detail:/, listDetailCallback);
  bot.callbackQuery(/^list:back:/, listBackCallback);
  bot.callbackQuery(/^list:edit:/, listEditCallback);
  bot.callbackQuery(/^list:pause:/, listPauseCallback);
  bot.callbackQuery(/^list:resume:/, listResumeCallback);
  bot.callbackQuery(/^list:del:/, listDelCallback);
  bot.callbackQuery(/^list:delok:/, listDeleteConfirmCallback);
  bot.callbackQuery(/^list:delno:/, listDeleteCancelCallback);
  bot.callbackQuery(/^list:ef:/, listEditFieldCallback);

  // Fallback handlers for conversation-specific callbacks.
  // These fire when a conversation button is clicked after the
  // conversation has ended (e.g., isolate recycled, user cancelled,
  // or timeout). They answer the callback so Telegram stops the
  // loading spinner and inform the user the action expired.
  bot.callbackQuery(/^cycle:/, async (ctx) => {
    await ctx.answerCallbackQuery("这次选择已过期，请发送 /add 重新开始。");
  });
  bot.callbackQuery(/^editcycle:/, async (ctx) => {
    await ctx.answerCallbackQuery("这次选择已过期，请通过订阅列表重新编辑。");
  });
  bot.callbackQuery(/^addcurrency:/, async (ctx) => {
    await ctx.answerCallbackQuery("这次币种选择已过期，请重新开始当前操作。");
  });
  bot.callbackQuery(/^addprice:/, async (ctx) => {
    await ctx.answerCallbackQuery("这次价格选择已过期，请重新开始当前操作。");
  });
  bot.callbackQuery(/^adddate:/, async (ctx) => {
    await ctx.answerCallbackQuery("这次日期选择已过期，请重新开始当前操作。");
  });
  bot.callbackQuery(/^cycleint:/, async (ctx) => {
    await ctx.answerCallbackQuery("这次间隔选择已过期，请重新开始当前操作。");
  });
  bot.callbackQuery(/^addpreview:/, async (ctx) => {
    await ctx.answerCallbackQuery("这次预览已过期，请发送 /add 重新开始。");
  });
  bot.callbackQuery(/^addtrial:/, async (ctx) => {
    await ctx.answerCallbackQuery("这次选择已过期，请发送 /add 重新开始。");
  });
  bot.callbackQuery(/^addrenew:/, async (ctx) => {
    await ctx.answerCallbackQuery("这次选择已过期，请发送 /add 重新开始。");
  });
  bot.callbackQuery(/^add:confirm$/, async (ctx) => {
    await ctx.answerCallbackQuery("这次确认已过期，请发送 /add 重新开始。");
  });
  bot.callbackQuery(/^add:cancel$/, async (ctx) => {
    await ctx.answerCallbackQuery("这次确认已过期。");
  });
  bot.callbackQuery(/^add:/, async (ctx) => {
    await ctx.answerCallbackQuery("这次确认已过期，请发送 /add 重新开始。");
  });
  bot.callbackQuery(/^settings:/, async (ctx) => {
    await ctx.answerCallbackQuery(
      "这次选择已过期，请发送 /settings 重新开始。",
    );
  });

  return bot;
}
