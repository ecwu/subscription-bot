import { BotContext } from "../../types/context.js";
import { createSubscriptionService } from "../../services/subscriptionService.js";
import { createPrivacyService } from "../../services/privacyService.js";
import { createSubscriptionRepository } from "../../repositories/subscriptionRepository.js";
import { createReminderRepository } from "../../repositories/reminderRepository.js";
import { createUserRepository } from "../../repositories/userRepository.js";
import { createLogger } from "../../utils/logger.js";

// Telegram message text limit is 4096 UTF-16 code units.
// We keep a conservative margin for the code block wrapper.
const MAX_EXPORT_MESSAGE_LENGTH = 4000;

export async function exportCommand(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  if (!ctx.userKey) {
    await ctx.reply("Unable to identify user. Please try again.");
    logger.warn("Export command without userKey");
    return;
  }

  const repo = createSubscriptionRepository(ctx.env.SUBSCRIPTION_KV);
  const reminderRepo = createReminderRepository(ctx.env.SUBSCRIPTION_KV);
  const userRepo = createUserRepository(ctx.env.SUBSCRIPTION_KV);
  const subscriptionService = createSubscriptionService(repo, reminderRepo);
  const privacyService = createPrivacyService(
    subscriptionService,
    userRepo,
    reminderRepo,
  );

  const exportData = await privacyService.exportUserData(
    ctx.userKey,
    ctx.env.ENCRYPTION_KEY,
  );

  // Build JSON without internal identifiers
  const payload = JSON.stringify(exportData, null, 2);

  if (payload.length > MAX_EXPORT_MESSAGE_LENGTH) {
    await ctx.reply(
      "Your export is too large to send as a message.\n" +
        "TODO: file upload support will be added in a future update.",
    );
    logger.info("Export too large for message", {
      payloadLength: payload.length,
    });
    return;
  }

  // Send as a code block for easy copy-paste
  await ctx.reply(`\`\`\`json\n${payload}\n\`\`\``, {
    parse_mode: "MarkdownV2",
  });

  logger.info("Data exported", {
    subscriptionCount: exportData.subscriptions.length,
    // Do not log the exported JSON or subscription details
  });
}
