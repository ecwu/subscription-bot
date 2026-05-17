import { Env } from "../types/env.js";
import { log } from "../utils/logger.js";

export async function handleScheduled(
  _controller: ScheduledController,
  env: Env
): Promise<void> {
  log("info", "Scheduled trigger fired", { env: env.APP_ENV });

  // TODO: implement reminder processing
  // 1. Load all reminders for today
  // 2. Send Telegram messages for unsent reminders
  // 3. Mark reminders as sent
}
