import { BotContext } from "../../types/context.js";
import { createLogger } from "../../utils/logger.js";
import { parseEditCallbackData } from "../../utils/callbackParser.js";

async function safeAnswerCallbackQuery(
  ctx: BotContext,
  text?: string,
): Promise<void> {
  try {
    await ctx.answerCallbackQuery(text);
  } catch {
    // Ignore if answering fails
  }
}

async function safeEditMessageText(
  ctx: BotContext,
  text: string,
): Promise<void> {
  try {
    await ctx.editMessageText(text);
  } catch {
    // Message may have been deleted or already edited
  }
}

export async function editFieldCallback(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  try {
    if (!ctx.userKey) {
      await safeAnswerCallbackQuery(ctx, "Unable to identify user.");
      return;
    }

    const parsed = parseEditCallbackData(ctx.callbackQuery?.data ?? "");
    if (!parsed) {
      await safeAnswerCallbackQuery(ctx, "Invalid callback data.");
      return;
    }

    const { field, subId } = parsed;

    if (field === "cycle") {
      await safeAnswerCallbackQuery(ctx);
      await ctx.conversation.enter("editCycle", subId);
      return;
    }

    if (["name", "price", "currency", "date"].includes(field)) {
      await safeAnswerCallbackQuery(ctx);
      await ctx.conversation.enter(
        "editField",
        subId,
        field as "name" | "price" | "currency" | "date",
      );
      return;
    }

    await safeAnswerCallbackQuery(ctx, "Unknown edit field.");
    logger.warn("Unknown edit field in callback", { field });
  } catch (error) {
    logger.error("Error in editFieldCallback", {
      error: error instanceof Error ? error.message : String(error),
    });
    await safeAnswerCallbackQuery(ctx, "Something went wrong.");
  }
}

export async function editCancelCallback(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  try {
    if (!ctx.userKey) {
      await safeAnswerCallbackQuery(ctx, "Unable to identify user.");
      await safeEditMessageText(ctx, "Unable to identify user.");
      return;
    }

    await safeAnswerCallbackQuery(ctx, "Cancelled.");
    await safeEditMessageText(ctx, "Edit cancelled.");

    logger.info("Edit cancelled via callback");
  } catch (error) {
    logger.error("Error in editCancelCallback", {
      error: error instanceof Error ? error.message : String(error),
    });
    await safeAnswerCallbackQuery(ctx, "Something went wrong.");
  }
}
