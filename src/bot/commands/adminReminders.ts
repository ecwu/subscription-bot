import { BotContext } from "../../types/context.js";
import { createUserRepository } from "../../repositories/userRepository.js";
import { createLogger } from "../../utils/logger.js";
import { parseReminderDateEntryKey } from "../../utils/kvKeys.js";

const MAX_FUTURE_DAYS = 30;
const MAX_DATE_KEYS = 100;
const TODAY = new Date();

function futureDateRange(): string[] {
  const dates: string[] = [];
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() + 1);
  for (let i = 0; i < MAX_FUTURE_DAYS; i++) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${day}`);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

export async function adminRemindersCommand(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  if (!ctx.isAdmin) {
    await ctx.reply("This command is only available to admins.");
    logger.warn("Non-admin attempted adminReminders command");
    return;
  }

  const kv = ctx.env.SUBSCRIPTION_KV;
  const targetDates = futureDateRange();
  const seenUserKeys = new Set<string>();

  let cursor: string | undefined;
  let dateKeysScanned = 0;

  do {
    const list = await kv.list({
      prefix: "reminders:date:",
      cursor,
      limit: 1000,
    });
    cursor = list.list_complete ? undefined : list.cursor;

    for (const key of list.keys) {
      const parsed = parseReminderDateEntryKey(key.name);
      if (!parsed || !targetDates.includes(parsed.date)) continue;

      dateKeysScanned += 1;
      if (dateKeysScanned > MAX_DATE_KEYS) break;
      seenUserKeys.add(parsed.userKey);
    }

    if (dateKeysScanned > MAX_DATE_KEYS) break;
  } while (cursor);

  if (seenUserKeys.size === 0) {
    await ctx.reply("No upcoming reminder data found.");
    return;
  }

  const repo = createUserRepository(kv);
  const distribution = new Map<string, number>();
  let enabledCount = 0;

  for (const userKey of seenUserKeys) {
    try {
      const profile = await repo.getUserProfile(
        userKey,
        ctx.env.ENCRYPTION_KEY,
      );
      if (!profile) continue;

      const settings = profile.settings;
      if (!settings?.reminderEnabled) continue;

      enabledCount += 1;
      const tz = settings.timezone || "UTC";
      distribution.set(tz, (distribution.get(tz) || 0) + 1);
    } catch {
      continue;
    }
  }

  if (enabledCount === 0) {
    await ctx.reply("No users with reminders enabled found.");
    return;
  }

  const sorted = Array.from(distribution.entries()).sort((a, b) => b[1] - a[1]);

  const lines = [
    "🕐 User Reminder Timezone Distribution",
    "",
    `Total users with reminders enabled: ${enabledCount}`,
    "",
    ...sorted.map(([tz, count]) => `${tz}:  ${count}`),
  ];

  await ctx.reply(lines.join("\n"));
  logger.info("Admin reminders distribution reported", {
    enabledCount,
    timezones: sorted.length,
  });
}
